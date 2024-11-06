use rdev::{listen, Event, EventType, Key};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use tracing::error;

pub enum KeystrokeCommand {
    DoubleSlash,
    Stop,
    // Add other commands as needed
}

pub struct KeystrokeMonitor {
    tx: mpsc::Sender<KeystrokeCommand>,
    last_slash: Arc<Mutex<Option<std::time::Instant>>>,
    shift_pressed: Arc<AtomicBool>,
    ctrl_pressed: Arc<AtomicBool>,
}

impl KeystrokeMonitor {
    pub fn new(tx: mpsc::Sender<KeystrokeCommand>) -> Self {
        KeystrokeMonitor {
            tx,
            last_slash: Arc::new(Mutex::new(None)),
            shift_pressed: Arc::new(AtomicBool::new(false)),
            ctrl_pressed: Arc::new(AtomicBool::new(false)),
        }
    }

    pub async fn start_monitoring(&self) -> anyhow::Result<()> {
        let tx = self.tx.clone();
        let last_slash = self.last_slash.clone();
        let shift_pressed = self.shift_pressed.clone();
        let ctrl_pressed = self.ctrl_pressed.clone();
        tokio::task::spawn_blocking(move || {
            if let Err(error) = listen(move |event| {
                let _ = handle_event(event, &tx, &last_slash, &shift_pressed, &ctrl_pressed);
            }) {
                error!("error: {:?}", error)
            }
        });

        Ok(())
    }
}

fn handle_event(
    event: Event,
    tx: &mpsc::Sender<KeystrokeCommand>,
    last_slash: &Arc<Mutex<Option<std::time::Instant>>>,
    shift_pressed: &Arc<AtomicBool>,
    ctrl_pressed: &Arc<AtomicBool>,
) -> anyhow::Result<()> {
    match event.event_type {
        EventType::KeyPress(key) => {
            match key {
                Key::ShiftLeft | Key::ShiftRight => {
                    shift_pressed.store(true, Ordering::SeqCst);
                }
                Key::ControlLeft | Key::ControlRight => {
                    ctrl_pressed.store(true, Ordering::SeqCst);
                }
                Key::KeyQ => {
                    tx.blocking_send(KeystrokeCommand::Stop)?;
                    return Ok(());
                }
                Key::Slash | Key::Num7 if shift_pressed.load(Ordering::SeqCst) => {
                    // Monitoring for slash (/) or Shift+7 combination
                    let mut last_slash_guard = last_slash.blocking_lock();
                    let now = std::time::Instant::now();
                    if let Some(last) = *last_slash_guard {
                        if now.duration_since(last).as_millis() < 500 {
                            tx.blocking_send(KeystrokeCommand::DoubleSlash)?;
                            *last_slash_guard = None;
                            return Ok(());
                        }
                    }
                    *last_slash_guard = Some(now);
                }
                _ => {}
            }
        }
        EventType::KeyRelease(key) => match key {
            Key::ShiftLeft | Key::ShiftRight => {
                shift_pressed.store(false, Ordering::SeqCst);
            }
            Key::ControlLeft | Key::ControlRight => {
                ctrl_pressed.store(false, Ordering::SeqCst);
            }
            _ => {}
        },
        _ => {}
    }
    Ok(())
}

pub async fn run_keystroke_monitor(tx: mpsc::Sender<KeystrokeCommand>) -> anyhow::Result<()> {
    let monitor = KeystrokeMonitor::new(tx);
    monitor.start_monitoring().await?;
    Ok(())
}
