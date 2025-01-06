use anyhow::Result;
use crossbeam::channel::{bounded, Sender};
use rdev::{listen, EventType};
use std::fmt::Display;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use tokio::sync::mpsc;
use tracing::{debug, error};

pub struct KeyboardCapture {
    is_running: Arc<AtomicBool>,
    tx: mpsc::Sender<KeyboardEvent>,
}

#[derive(Debug, Clone)]
pub struct KeyboardEvent {
    pub timestamp: SystemTime,
    pub key: String,
    pub event_type: KeyboardEventType,
}

#[derive(Debug, Clone)]
pub enum KeyboardEventType {
    KeyPress,
    KeyRelease,
}

impl Display for KeyboardEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            KeyboardEventType::KeyPress => write!(f, "press"),
            KeyboardEventType::KeyRelease => write!(f, "release"),
        }
    }
}

impl KeyboardCapture {
    pub fn new(tx: mpsc::Sender<KeyboardEvent>) -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(true)),
            tx,
        }
    }

    pub async fn start(&self) -> Result<()> {
        debug!("starting keyboard capture");
        let (event_tx, event_rx) = bounded(100);
        let is_running = Arc::clone(&self.is_running);
        let tx = self.tx.clone();

        // Create a channel for stopping the keyboard listener
        let (stop_tx, stop_rx) = bounded::<()>(1);
        let stop_tx_clone = stop_tx.clone();
        let is_running_clone = is_running.clone();

        // Spawn blocking task for keyboard events
        tokio::task::spawn_blocking(move || {
            if let Err(e) = listen_keyboard(event_tx, is_running_clone, stop_rx) {
                error!("keyboard capture error: {:?}", e);
            }
        });

        // Process events
        loop {
            if !self.is_running.load(Ordering::SeqCst) {
                debug!("keyboard capture shutdown signal received");
                let _ = stop_tx_clone.send(());
                break;
            }

            if let Ok(event) = event_rx.try_recv() {
                if let Err(e) = tx.try_send(event) {
                    error!("error sending keyboard event: {:?}", e);
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }

        debug!("keyboard capture stopped");
        Ok(())
    }

    pub fn stop(&self) {
        debug!("stopping keyboard capture");
        self.is_running.store(false, Ordering::SeqCst);
    }
}

fn listen_keyboard(
    tx: Sender<KeyboardEvent>,
    is_running: Arc<AtomicBool>,
    stop_rx: crossbeam::channel::Receiver<()>,
) -> anyhow::Result<()> {
    let stop_rx = Arc::new(stop_rx);
    let stop_rx_clone = Arc::clone(&stop_rx);
    let is_running_clone = Arc::clone(&is_running);

    // Create a thread to handle the stop signal
    let stop_thread = std::thread::spawn(move || {
        while is_running_clone.load(Ordering::SeqCst) {
            if stop_rx_clone.try_recv().is_ok() {
                is_running_clone.store(false, Ordering::SeqCst);
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    });

    // Use a channel to communicate with the rdev listener
    let (exit_tx, exit_rx) = std::sync::mpsc::channel();

    std::thread::spawn(move || {
        listen(move |event| {
            if !is_running.load(Ordering::SeqCst) || stop_rx.try_recv().is_ok() {
                let _ = exit_tx.send(());
                return;
            }

            match event.event_type {
                EventType::KeyPress(key) | EventType::KeyRelease(key) => {
                    let event = KeyboardEvent {
                        timestamp: SystemTime::now(),
                        key: format!("{:?}", key),
                        event_type: match event.event_type {
                            EventType::KeyPress(_) => KeyboardEventType::KeyPress,
                            EventType::KeyRelease(_) => KeyboardEventType::KeyRelease,
                            _ => return,
                        },
                    };
                    if let Err(e) = tx.send(event) {
                        error!("error sending keyboard event: {:?}", e);
                    }
                }
                _ => {}
            }
        })
        .unwrap();
    });

    // Wait for the stop signal
    let _ = exit_rx.recv();
    stop_thread.join().unwrap();

    Ok(())
}
