use anyhow::anyhow;
use clap::ValueEnum;
use log::debug;
use screenpipe_core::Language;
use whisper_rs::{get_lang_str, get_lang_str_full};

pub fn detect_language<'a>(tokens: Vec<f32>, languages: Vec<Language>) -> Option<&'a str> {
    if languages.len() == 1 {
        return Some(languages.first().unwrap().as_lang_code());
    }
    for token in tokens {
        let token = token as i32;
        if let Some(lang) = get_lang_str_full(token) {
            debug!("Detected language {lang}");
            if languages.is_empty() {
                return get_lang_str(token);
            }

            let l = match Language::from_str(lang, true)
                .map_err(|_| anyhow!("language token not found"))
            {
                Ok(lang) => lang,
                Err(_) => return None,
            };

            if languages.contains(&l) {
                return get_lang_str(token);
            }
        }
    }

    None
}
