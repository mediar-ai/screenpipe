use anyhow::Result;
use tokio::time::{sleep, Duration};
use std::cell::RefCell;
use enigo::{Enigo, Key, KeyboardControllable};
use serde::Serialize;

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

pub async fn type_slowly(text: String) -> Result<()> {
    let text_len = text.len();
    tokio::task::spawn_blocking(move || {
        with_enigo(|enigo| {
            for line in text.split('\n') {
                if !line.is_empty() {
                    enigo.key_sequence(line);
                }
                if text.contains('\n') {
                    enigo.key_down(Key::Shift);
                    enigo.key_click(Key::Return);
                    enigo.key_up(Key::Shift);
                }
            }
        });
    })
    .await?;
    sleep(Duration::from_millis(text_len as u64)).await;
    Ok(())
}
