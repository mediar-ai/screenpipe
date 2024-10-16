use rdev::{listen, Event, EventType, Key};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::sync::Mutex;
use tracing::error;

pub enum KeystrokeCommand {
    DoubleSlash,
    // Add other commands as needed
}

#[allow(dead_code)]
pub struct KeystrokeMonitor {
    tx: mpsc::Sender<KeystrokeCommand>,
    last_slash: Arc<Mutex<Option<std::time::Instant>>>,
}

impl KeystrokeMonitor {
    #[allow(dead_code)]
    pub fn new(tx: mpsc::Sender<KeystrokeCommand>) -> Self {
        KeystrokeMonitor {
            tx,
            last_slash: Arc::new(Mutex::new(None)),
        }
    }

    #[allow(dead_code)]
    pub async fn start_monitoring(&self) -> anyhow::Result<()> {
        let tx = self.tx.clone();
        let last_slash = self.last_slash.clone();

        tokio::task::spawn_blocking(move || {
            if let Err(error) = listen(move |event| {
                let _ = handle_event(event, &tx, &last_slash);
            }) {
                error!("error: {:?}", error)
            }
        });

        Ok(())
    }
}

#[allow(dead_code)]
fn handle_event(
    event: Event,
    tx: &mpsc::Sender<KeystrokeCommand>,
    last_slash: &Arc<Mutex<Option<std::time::Instant>>>,
) -> anyhow::Result<()> {
    static mut SHIFT_PRESSED: bool = false;

    match event.event_type {
        EventType::KeyPress(key) => {
            if key == Key::ShiftLeft || key == Key::ShiftRight {
                unsafe { SHIFT_PRESSED = true; }
            } else if key == Key::Slash || (unsafe { SHIFT_PRESSED } && key == Key::Num7) {
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
        },
        EventType::KeyRelease(key) => {
            if key == Key::ShiftLeft || key == Key::ShiftRight {
                unsafe { SHIFT_PRESSED = false; }
            }
        },
        _ => {}
    }
    Ok(())
}

#[allow(dead_code)]
pub async fn run_keystroke_monitor(tx: mpsc::Sender<KeystrokeCommand>) -> anyhow::Result<()> {
    let monitor = KeystrokeMonitor::new(tx);
    monitor.start_monitoring().await?;
    Ok(())
}
