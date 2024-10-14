use anyhow::Result;
use enigo::{Enigo, KeyboardControllable};
use std::time::Duration;
use tokio::time;

pub async fn delete_characters(count: usize) -> Result<()> {
    let mut enigo = Enigo::new();
    for _ in 0..count {
        enigo.key_click(enigo::Key::Backspace);
    }
    Ok(())
}

pub async fn type_slowly(text: &str) -> Result<()> {
    let mut enigo = Enigo::new();
    for c in text.chars() {
        match c {
            '\n' => {
                enigo.key_down(enigo::Key::Shift);
                enigo.key_click(enigo::Key::Return);
                enigo.key_up(enigo::Key::Shift);
            },
            '\t' => enigo.key_click(enigo::Key::Tab),
            _ => enigo.key_sequence(&c.to_string()),
        }
        time::sleep(Duration::from_millis(1)).await;
    }
    Ok(())
}
