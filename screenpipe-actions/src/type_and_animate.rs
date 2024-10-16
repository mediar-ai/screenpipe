use anyhow::Result;
use tokio::time::{sleep, Duration};
use std::cell::RefCell;
use enigo::{Enigo, Key, KeyboardControllable};
use serde::Serialize;

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
            for _ in 0..count {
                enigo.key_click(Key::Backspace);
                std::thread::sleep(Duration::from_millis(1));
            }
        });
    })
    .await?;
    Ok(())
}

pub async fn type_slowly(text: &str) -> Result<()> {
    for c in text.chars() {
        let c_clone = c;
        tokio::task::spawn_blocking(move || {
            with_enigo(|enigo| {
                match c_clone {
                    '\n' => enigo.key_click(Key::Return),
                    ' ' => enigo.key_click(Key::Space),
                    _ => enigo.key_click(Key::Layout(c_clone)),
                }
            });
        })
        .await?;
        sleep(Duration::from_millis(1)).await;
    }
    Ok(())
}
