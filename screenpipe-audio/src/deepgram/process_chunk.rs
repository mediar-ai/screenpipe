use anyhow::Result;
use hound::{WavSpec, WavWriter};
use log::{debug, error, info};
use reqwest::Client;
use screenpipe_core::Language;
use serde_json::Value;
use std::io::Cursor;

use crate::deepgram::{CUSTOM_DEEPGRAM_API_TOKEN, DEEPGRAM_API_URL};

pub async fn transcribe_with_deepgram(
    api_key: &str,
    audio_data: &[f32],
    device: &str,
    sample_rate: u32,
    languages: Vec<Language>,
) -> Result<String> {
    debug!("starting deepgram transcription");
    let client = Client::new();

    // Use token from env var
    let custom_api_key = CUSTOM_DEEPGRAM_API_TOKEN.as_str();

    // Create a WAV file in memory
    let mut cursor = Cursor::new(Vec::new());
    {
        let spec = WavSpec {
            channels: 1,
            sample_rate: match sample_rate {
                88200 => 16000,   // Deepgram expects 16kHz for 88.2kHz
                _ => sample_rate, // Fallback for other sample rates
            },
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };
        let mut writer = WavWriter::new(&mut cursor, spec)?;
        for &sample in audio_data {
            writer.write_sample(sample)?;
        }
        writer.finalize()?;
    }

    // Get the WAV data from the cursor
    let wav_data = cursor.into_inner();

    let mut query_params = String::from("model=nova-2&smart_format=true&sample_rate=16000");

    if !languages.is_empty() {
        query_params = [
            query_params,
            "&".into(),
            languages
                .iter()
                .map(|lang| format!("detect_language={}", lang.as_lang_code()))
                .collect::<Vec<String>>()
                .join("&"),
        ]
        .concat();
    }

    // rationale: custom api key = custom AI proxy to use deepgram
    // no custom api key = use deepgram api key for real deepgram endpoint
    let api_key_to_use = if custom_api_key.is_empty() {
        api_key
    } else {
        custom_api_key
    };
    let is_custom_endpoint = !custom_api_key.is_empty();

    debug!("deepgram api key: {}", api_key_to_use);

    let response = client
        .post(format!("{}?{}", *DEEPGRAM_API_URL, query_params))
        .header("Content-Type", "audio/wav")
        // Use Bearer format when using custom endpoint/proxy
        .header(
            "Authorization",
            if is_custom_endpoint {
                format!("Bearer {}", api_key_to_use)
            } else {
                format!("Token {}", api_key_to_use)
            },
        )
        .body(wav_data)
        .send();

    match response.await {
        Ok(resp) => {
            debug!("received response from deepgram api");
            match resp.json::<Value>().await {
                Ok(result) => {
                    debug!("successfully parsed json response");
                    if let Some(err_code) = result.get("err_code") {
                        error!(
                            "deepgram api error code: {:?}, result: {:?}",
                            err_code, result
                        );
                        return Err(anyhow::anyhow!("Deepgram API error: {:?}", result));
                    }
                    let transcription = result["results"]["channels"][0]["alternatives"][0]
                        ["transcript"]
                        .as_str()
                        .unwrap_or("");

                    if transcription.is_empty() {
                        info!(
                            "device: {}, transcription is empty. full response: {:?}",
                            device, result
                        );
                    } else {
                        info!(
                            "device: {}, transcription successful. length: {} characters",
                            device,
                            transcription.len()
                        );
                    }

                    Ok(transcription.to_string())
                }
                Err(e) => {
                    error!("Failed to parse JSON response: {:?}", e);
                    Err(anyhow::anyhow!("Failed to parse JSON response: {:?}", e))
                }
            }
        }
        Err(e) => {
            error!("Failed to send request to Deepgram API: {:?}", e);
            Err(anyhow::anyhow!(
                "Failed to send request to Deepgram API: {:?}",
                e
            ))
        }
    }
}
