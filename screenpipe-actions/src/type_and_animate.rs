use anyhow::Result;
use enigo::{Enigo, Key, KeyboardControllable};
use serde::Serialize;
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::time::{sleep, Duration};

#[allow(dead_code)]
#[derive(Debug)]
pub enum EnigoCommand {
    TypeCharacter(char),
    TypeString(String),
    DeleteCharacter,
    Shutdown,
}

#[derive(Debug, Serialize)]
pub struct EnigoResponse {
    pub success: bool,
    pub message: Option<String>,
}

thread_local! {
    static ENIGO: RefCell<Option<Enigo>> = RefCell::new(None);
}

fn with_enigo<F, R>(f: F) -> R
where
    F: FnOnce(&mut Enigo) -> R,
{
    ENIGO.with(|cell| {
        let mut enigo = cell.borrow_mut();
        if enigo.is_none() {
            *enigo = Some(Enigo::new());
        }
        f(enigo.as_mut().unwrap())
    })
}

pub async fn delete_characters(count: usize) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        with_enigo(|enigo| {
            enigo.key_sequence(&"\u{8}".repeat(count));
        });
    })
    .await?;
    Ok(())
}

pub async fn type_slowly(text: String, stop_signal: Arc<AtomicBool>) -> Result<()> {
    let text_len = text.len();
    for line in text.split('\n') {
        if !line.is_empty() {
            for char in line.chars() {
                if stop_signal.load(Ordering::SeqCst) {
                    return Ok(());
                }
                tokio::task::spawn_blocking(move || {
                    with_enigo(|enigo| {
                        enigo.key_sequence(&char.to_string());
                    });
                })
                .await?;
                sleep(Duration::from_millis(50)).await;
            }
        }
        if text.contains('\n') {
            if stop_signal.load(Ordering::SeqCst) {
                return Ok(());
            }
            tokio::task::spawn_blocking(move || {
                with_enigo(|enigo| {
                    enigo.key_down(Key::Shift);
                    enigo.key_click(Key::Return);
                    enigo.key_up(Key::Shift);
                });
            })
            .await?;
        }
    }
    sleep(Duration::from_millis(text_len as u64)).await;
    Ok(())
}

pub fn trigger_keyboard_permission() -> anyhow::Result<()> {
    with_enigo(|enigo| {
        // Perform a no-op key press to trigger the permission request
        enigo.key_down(enigo::Key::Shift);
        enigo.key_up(enigo::Key::Shift);
    });
    Ok(())
}
