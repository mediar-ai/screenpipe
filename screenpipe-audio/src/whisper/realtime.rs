use crate::{
    multilingual, realtime::RealtimeTranscriptionEvent, resample, AudioStream,
    AudioTranscriptionEngine, DeviceType,
};
use anyhow::Result;
use candle::{Device, Tensor};
use candle_transformers::models::whisper::audio;
use chrono::Utc;
use screenpipe_core::Language;
use std::sync::{atomic::AtomicBool, Arc};
use tokenizers::Tokenizer;
use tokio::sync::broadcast::Sender;

use super::{Decoder, WhisperModel};

pub async fn stream_transcription_whisper(
    stream: Arc<AudioStream>,
    realtime_transcription_sender: Arc<Sender<RealtimeTranscriptionEvent>>,
    languages: Vec<Language>,
    is_running: Arc<AtomicBool>,
    transcription_engine: Arc<AudioTranscriptionEngine>,
) -> Result<()> {
    let mut whisper_model = WhisperModel::new(&transcription_engine)?;
    let mel_bytes = match whisper_model.model.config().num_mel_bins {
        80 => include_bytes!("../../models/whisper/melfilters.bytes").as_slice(),
        128 => include_bytes!("../../models/whisper/melfilters128.bytes").as_slice(),
        nmel => anyhow::bail!("unexpected num_mel_bins {nmel}"),
    };
    let mut mel_filters = vec![0f32; mel_bytes.len() / 4];
    <byteorder::LittleEndian as byteorder::ByteOrder>::read_f32_into(mel_bytes, &mut mel_filters);

    let model = &mut whisper_model.model;
    let tokenizer = &whisper_model.tokenizer;
    let device = &whisper_model.device;

    let mut dc = Decoder::new(model, tokenizer, 42, device, None, false, false)?;

    let mut audio_stream = stream.subscribe().await;
    let sample_rate = stream.device_config.sample_rate().0;

    let mut audio_buffer: Vec<f32> = Vec::with_capacity(sample_rate as usize * 5);

    while let Ok(audio_data) = audio_stream.recv().await {
        audio_buffer.extend_from_slice(&audio_data);

        if audio_buffer.len() >= sample_rate as usize * 5 {
            let audio_chunk = audio_buffer
                .drain(..sample_rate as usize * 5)
                .collect::<Vec<f32>>();
            let result = process_realtime_whisper(
                &audio_chunk,
                languages.clone(),
                &mel_filters,
                &mut dc,
                tokenizer,
                device,
                sample_rate,
            )
            .await?;

            if !result.is_empty() {
                let _ = realtime_transcription_sender.send(RealtimeTranscriptionEvent {
                    timestamp: Utc::now(),
                    device: stream.device.to_string(),
                    transcription: result,
                    is_final: true,
                    is_input: stream.device.device_type == DeviceType::Input,
                });
            }
        }

        if !is_running.load(std::sync::atomic::Ordering::Relaxed) {
            break;
        }
    }
    Ok(())
}

pub async fn process_realtime_whisper(
    audio: &[f32],
    languages: Vec<Language>,
    mel_filters: &[f32],
    dc: &mut Decoder<'_>,
    tokenizer: &Tokenizer,
    device: &Device,
    sample_rate: u32,
) -> Result<String> {
    let audio = if sample_rate != candle_transformers::models::whisper::SAMPLE_RATE as u32 {
        &resample(
            audio,
            sample_rate,
            candle_transformers::models::whisper::SAMPLE_RATE as u32,
        )?
    } else {
        audio
    };

    let model = &mut dc.model;
    let mel = audio::pcm_to_mel(model.config(), audio, mel_filters);
    let mel_len = mel.len();

    let mel = Tensor::from_vec(
        mel,
        (
            1,
            model.config().num_mel_bins,
            mel_len / model.config().num_mel_bins,
        ),
        device,
    )?;

    let language_token = multilingual::detect_language(model, tokenizer, &mel, languages.clone())?;

    dc.set_language_token(Some(language_token));

    let segments = dc.run(&mel)?;
    dc.reset_kv_cache();

    let mut transcription = String::new();

    for segment in segments {
        transcription.push_str(&segment.dr.text);
    }

    Ok(transcription)
}
