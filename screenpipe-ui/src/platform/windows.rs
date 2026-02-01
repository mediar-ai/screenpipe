//! Windows UI event capture using rdev and UI Automation
//!
//! Based on bigbrother's Windows implementation.

use crate::config::UiCaptureConfig;
use crate::events::{ElementContext, EventData, UiEvent};
use anyhow::Result;
use chrono::Utc;
use crossbeam_channel::{bounded, Receiver, Sender};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Instant;
use tracing::{debug, error, warn};

use rdev::{listen, Event as RdevEvent, EventType, Key};

/// Permission status for UI capture
#[derive(Debug, Clone)]
pub struct PermissionStatus {
    pub accessibility: bool,
    pub input_monitoring: bool,
}

impl PermissionStatus {
    pub fn all_granted(&self) -> bool {
        self.accessibility && self.input_monitoring
    }
}

/// UI Event recorder for Windows
pub struct UiRecorder {
    config: UiCaptureConfig,
}

/// Handle to a running recording session
pub struct RecordingHandle {
    stop: Arc<AtomicBool>,
    events_rx: Receiver<UiEvent>,
    threads: Vec<thread::JoinHandle<()>>,
}

impl RecordingHandle {
    pub fn stop(self) {
        self.stop.store(true, Ordering::SeqCst);
        for t in self.threads {
            let _ = t.join();
        }
    }

    pub fn is_running(&self) -> bool {
        !self.stop.load(Ordering::Relaxed)
    }

    pub fn receiver(&self) -> &Receiver<UiEvent> {
        &self.events_rx
    }

    pub fn try_recv(&self) -> Option<UiEvent> {
        self.events_rx.try_recv().ok()
    }

    pub fn recv(&self) -> Option<UiEvent> {
        self.events_rx.recv().ok()
    }

    pub fn recv_timeout(&self, timeout: std::time::Duration) -> Option<UiEvent> {
        self.events_rx.recv_timeout(timeout).ok()
    }
}

impl UiRecorder {
    pub fn new(config: UiCaptureConfig) -> Self {
        Self { config }
    }

    pub fn with_defaults() -> Self {
        Self::new(UiCaptureConfig::new())
    }

    /// Windows doesn't require explicit permissions
    pub fn check_permissions(&self) -> PermissionStatus {
        PermissionStatus {
            accessibility: true,
            input_monitoring: true,
        }
    }

    pub fn request_permissions(&self) -> PermissionStatus {
        self.check_permissions()
    }

    pub fn start(&self) -> Result<RecordingHandle> {
        let (tx, rx) = bounded::<UiEvent>(self.config.max_buffer_size);
        let stop = Arc::new(AtomicBool::new(false));
        let start_time = Instant::now();

        let mut threads = Vec::new();

        // Thread 1: rdev event listener
        let tx1 = tx.clone();
        let stop1 = stop.clone();
        let config1 = self.config.clone();
        threads.push(thread::spawn(move || {
            run_rdev_listener(tx1, stop1, start_time, config1);
        }));

        // Thread 2: App/window observer
        let tx2 = tx.clone();
        let stop2 = stop.clone();
        let config2 = self.config.clone();
        threads.push(thread::spawn(move || {
            run_app_observer(tx2, stop2, start_time, config2);
        }));

        Ok(RecordingHandle {
            stop,
            events_rx: rx,
            threads,
        })
    }
}

// ============================================================================
// rdev Event Listener
// ============================================================================

struct ListenerState {
    tx: Sender<UiEvent>,
    start: Instant,
    config: UiCaptureConfig,
    last_mouse: (f64, f64),
    text_buf: String,
    last_text_time: Option<Instant>,
}

fn run_rdev_listener(
    tx: Sender<UiEvent>,
    stop: Arc<AtomicBool>,
    start: Instant,
    config: UiCaptureConfig,
) {
    let state = Arc::new(Mutex::new(ListenerState {
        tx,
        start,
        config: config.clone(),
        last_mouse: (0.0, 0.0),
        text_buf: String::new(),
        last_text_time: None,
    }));

    let state_clone = state.clone();
    let stop_clone = stop.clone();

    let callback = move |event: RdevEvent| {
        if stop_clone.load(Ordering::Relaxed) {
            return;
        }

        let mut s = state_clone.lock();
        let t = s.start.elapsed().as_millis() as u64;
        let timestamp = Utc::now();

        match event.event_type {
            EventType::ButtonPress(button) => {
                if !s.config.capture_clicks {
                    return;
                }

                let (x, y) = s.last_mouse;
                let btn = match button {
                    rdev::Button::Left => 0,
                    rdev::Button::Right => 1,
                    rdev::Button::Middle => 2,
                    _ => 0,
                };

                let ui_event = UiEvent::click(timestamp, t, x as i32, y as i32, btn, 1, 0);
                let _ = s.tx.try_send(ui_event);
            }

            EventType::MouseMove { x, y } => {
                if !s.config.capture_mouse_move {
                    s.last_mouse = (x, y);
                    return;
                }

                let dx = x - s.last_mouse.0;
                let dy = y - s.last_mouse.1;
                let dist = (dx * dx + dy * dy).sqrt();

                if dist >= s.config.mouse_move_threshold {
                    s.last_mouse = (x, y);
                    let ui_event = UiEvent {
                        id: None,
                        timestamp,
                        relative_ms: t,
                        data: EventData::Move {
                            x: x as i32,
                            y: y as i32,
                        },
                        app_name: None,
                        window_title: None,
                        browser_url: None,
                        element: None,
                        frame_id: None,
                    };
                    let _ = s.tx.try_send(ui_event);
                } else {
                    s.last_mouse = (x, y);
                }
            }

            EventType::Wheel { delta_x, delta_y } => {
                let (x, y) = s.last_mouse;
                let ui_event = UiEvent {
                    id: None,
                    timestamp,
                    relative_ms: t,
                    data: EventData::Scroll {
                        x: x as i32,
                        y: y as i32,
                        delta_x: delta_x as i16,
                        delta_y: delta_y as i16,
                    },
                    app_name: None,
                    window_title: None,
                    browser_url: None,
                    element: None,
                    frame_id: None,
                };
                let _ = s.tx.try_send(ui_event);
            }

            EventType::KeyPress(key) => {
                let keycode = key_to_code(&key);

                // Check text aggregation timeout first
                if let Some(last) = s.last_text_time {
                    if last.elapsed().as_millis() as u64 >= s.config.text_timeout_ms
                        && !s.text_buf.is_empty()
                    {
                        let text = std::mem::take(&mut s.text_buf);
                        let ui_event = UiEvent::text(timestamp, t, text);
                        let _ = s.tx.try_send(ui_event);
                        s.last_text_time = None;
                    }
                }

                // Try to get character for text aggregation
                if s.config.capture_text {
                    if let Some(c) = key_to_char(&key) {
                        if c == '\x08' {
                            s.text_buf.pop();
                        } else {
                            s.text_buf.push(c);
                        }
                        s.last_text_time = Some(Instant::now());
                        return; // Don't record as key event
                    }
                }

                // Record as key event for special keys
                if s.config.capture_keystrokes {
                    let ui_event = UiEvent {
                        id: None,
                        timestamp,
                        relative_ms: t,
                        data: EventData::Key {
                            key_code: keycode,
                            modifiers: 0,
                        },
                        app_name: None,
                        window_title: None,
                        browser_url: None,
                        element: None,
                        frame_id: None,
                    };
                    let _ = s.tx.try_send(ui_event);
                }
            }

            _ => {}
        }
    };

    debug!("Starting rdev listener");
    if let Err(e) = listen(callback) {
        error!("rdev listen error: {:?}", e);
    }
}

fn key_to_code(key: &Key) -> u16 {
    match key {
        Key::Alt => 0x12,
        Key::AltGr => 0x12,
        Key::Backspace => 0x08,
        Key::CapsLock => 0x14,
        Key::ControlLeft | Key::ControlRight => 0x11,
        Key::Delete => 0x2E,
        Key::DownArrow => 0x28,
        Key::End => 0x23,
        Key::Escape => 0x1B,
        Key::F1 => 0x70,
        Key::F2 => 0x71,
        Key::F3 => 0x72,
        Key::F4 => 0x73,
        Key::F5 => 0x74,
        Key::F6 => 0x75,
        Key::F7 => 0x76,
        Key::F8 => 0x77,
        Key::F9 => 0x78,
        Key::F10 => 0x79,
        Key::F11 => 0x7A,
        Key::F12 => 0x7B,
        Key::Home => 0x24,
        Key::LeftArrow => 0x25,
        Key::MetaLeft | Key::MetaRight => 0x5B,
        Key::PageDown => 0x22,
        Key::PageUp => 0x21,
        Key::Return => 0x0D,
        Key::RightArrow => 0x27,
        Key::ShiftLeft | Key::ShiftRight => 0x10,
        Key::Space => 0x20,
        Key::Tab => 0x09,
        Key::UpArrow => 0x26,
        _ => 0,
    }
}

fn key_to_char(key: &Key) -> Option<char> {
    match key {
        Key::KeyA => Some('a'),
        Key::KeyB => Some('b'),
        Key::KeyC => Some('c'),
        Key::KeyD => Some('d'),
        Key::KeyE => Some('e'),
        Key::KeyF => Some('f'),
        Key::KeyG => Some('g'),
        Key::KeyH => Some('h'),
        Key::KeyI => Some('i'),
        Key::KeyJ => Some('j'),
        Key::KeyK => Some('k'),
        Key::KeyL => Some('l'),
        Key::KeyM => Some('m'),
        Key::KeyN => Some('n'),
        Key::KeyO => Some('o'),
        Key::KeyP => Some('p'),
        Key::KeyQ => Some('q'),
        Key::KeyR => Some('r'),
        Key::KeyS => Some('s'),
        Key::KeyT => Some('t'),
        Key::KeyU => Some('u'),
        Key::KeyV => Some('v'),
        Key::KeyW => Some('w'),
        Key::KeyX => Some('x'),
        Key::KeyY => Some('y'),
        Key::KeyZ => Some('z'),
        Key::Num0 => Some('0'),
        Key::Num1 => Some('1'),
        Key::Num2 => Some('2'),
        Key::Num3 => Some('3'),
        Key::Num4 => Some('4'),
        Key::Num5 => Some('5'),
        Key::Num6 => Some('6'),
        Key::Num7 => Some('7'),
        Key::Num8 => Some('8'),
        Key::Num9 => Some('9'),
        Key::Space => Some(' '),
        Key::Return => Some('\n'),
        Key::Tab => Some('\t'),
        Key::Backspace => Some('\x08'),
        _ => None,
    }
}

// ============================================================================
// App Observer (Windows)
// ============================================================================

fn run_app_observer(
    tx: Sender<UiEvent>,
    stop: Arc<AtomicBool>,
    start: Instant,
    config: UiCaptureConfig,
) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    };

    let mut last_hwnd: isize = 0;
    let mut last_title: Option<String> = None;

    while !stop.load(Ordering::Relaxed) {
        unsafe {
            let hwnd = GetForegroundWindow();
            let hwnd_val = hwnd.0 as isize;

            if hwnd_val != last_hwnd {
                // Get window title
                let mut title_buf = [0u16; 512];
                let len = GetWindowTextW(hwnd, &mut title_buf);
                let title = if len > 0 {
                    Some(String::from_utf16_lossy(&title_buf[..len as usize]))
                } else {
                    None
                };

                // Get process ID
                let mut pid: u32 = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));

                // Get process name
                let app_name = get_process_name(pid).unwrap_or_else(|| "Unknown".to_string());

                // Check exclusions
                if !config.should_capture_app(&app_name) {
                    last_hwnd = hwnd_val;
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    continue;
                }

                if let Some(ref t) = title {
                    if !config.should_capture_window(t) {
                        last_hwnd = hwnd_val;
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        continue;
                    }
                }

                // Send app switch event
                if config.capture_app_switch {
                    let event = UiEvent::app_switch(
                        Utc::now(),
                        start.elapsed().as_millis() as u64,
                        app_name.clone(),
                        pid as i32,
                    );
                    let _ = tx.try_send(event);
                }

                // Send window focus event
                if config.capture_window_focus && title != last_title {
                    let event = UiEvent {
                        id: None,
                        timestamp: Utc::now(),
                        relative_ms: start.elapsed().as_millis() as u64,
                        data: EventData::WindowFocus {
                            app: app_name,
                            title: title.clone(),
                        },
                        app_name: None,
                        window_title: None,
                        browser_url: None,
                        element: None,
                        frame_id: None,
                    };
                    let _ = tx.try_send(event);
                }

                last_hwnd = hwnd_val;
                last_title = title;
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}

fn get_process_name(pid: u32) -> Option<String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;

        let mut entry = PROCESSENTRY32W::default();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                if entry.th32ProcessID == pid {
                    let name_len = entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    let name = String::from_utf16_lossy(&entry.szExeFile[..name_len]);
                    CloseHandle(snapshot).ok();
                    return Some(name);
                }

                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }

        CloseHandle(snapshot).ok();
        None
    }
}
