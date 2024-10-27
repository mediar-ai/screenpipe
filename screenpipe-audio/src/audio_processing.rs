use std::path::PathBuf;
use std::sync::Arc;

use crate::constants::CONFIG;
use crate::vad_engine::{SpeechBoundary, VadEngine};
use crate::AudioDevice;
use anyhow::Result;
use candle_transformers::models::whisper::{self as m};

use realfft::num_complex::{Complex32, ComplexFloat};
use realfft::RealFftPlanner;
use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};

// ! TODO: should optimise speed of these stuff

pub fn normalize_v2(audio: &[f32]) -> Vec<f32> {
    let rms = (audio.iter().map(|&x| x * x).sum::<f32>() / audio.len() as f32).sqrt();
    let peak = audio
        .iter()
        .fold(0.0f32, |max, &sample| max.max(sample.abs()));

    let target_rms = CONFIG.target_rms;
    let target_peak = CONFIG.target_peak;

    let rms_scaling = target_rms / rms;
    let peak_scaling = target_peak / peak;

    let scaling_factor = rms_scaling.min(peak_scaling);

    audio
        .iter()
        .map(|&sample| sample * scaling_factor)
        .collect()
}

pub fn spectral_subtraction(audio: &[f32], d: f32) -> Result<Vec<f32>> {
    let mut real_planner = RealFftPlanner::<f32>::new();
    let window_size = CONFIG.window_size; // 16k sample rate - 100ms
    let r2c = real_planner.plan_fft_forward(window_size);

    let mut y = r2c.make_output_vec();

    let mut padded_audio = audio.to_vec();

    padded_audio.append(&mut vec![0.0f32; window_size - audio.len()]);

    let mut indata = padded_audio;
    r2c.process(&mut indata, &mut y)?;

    let mut processed_audio = y
        .iter()
        .map(|&x| {
            let magnitude_y = x.abs().powf(2.0);

            let div = 1.0 - (d / magnitude_y);

            let gain = {
                if div > 0.0 {
                    f32::sqrt(div)
                } else {
                    0.0f32
                }
            };

            x * gain
        })
        .collect::<Vec<Complex32>>();

    let c2r = real_planner.plan_fft_inverse(window_size);

    let mut outdata = c2r.make_output_vec();

    c2r.process(&mut processed_audio, &mut outdata)?;

    Ok(outdata)
}

// not an average of non-speech segments, but I don't know how much pause time we
// get. for now, we will just assume the noise is constant (kinda defeats the purpose)
// but oh well
pub fn average_noise_spectrum(audio: &[f32]) -> f32 {
    let mut total_sum = 0.0f32;

    for sample in audio {
        let magnitude = sample.abs();

        total_sum += magnitude.powf(2.0);
    }

    total_sum / audio.len() as f32
}

pub fn audio_to_mono(audio: &[f32], channels: u16) -> Vec<f32> {
    let mut mono_samples = Vec::with_capacity(audio.len() / channels as usize);

    // Iterate over the audio slice in chunks, each containing `channels` samples
    for chunk in audio.chunks(channels as usize) {
        // Sum the samples from all channels in the current chunk
        let sum: f32 = chunk.iter().sum();

        // Calculate the averagechannelsono sample
        let mono_sample = sum / channels as f32;

        // Store the computed mono sample
        mono_samples.push(mono_sample);
    }

    mono_samples
}

#[derive(Debug, Clone)]
pub struct AudioInput {
    pub data: Arc<Vec<f32>>,
    pub sample_rate: u32,
    pub channels: u16,
    pub device: Arc<AudioDevice>,
    pub output_path: Arc<PathBuf>,
}

// impl default for audio input
impl Default for AudioInput {
    fn default() -> Self {
        AudioInput {
            data: Arc::new(Vec::new()),
            sample_rate: 0,
            channels: 0,
            device: Arc::new(AudioDevice::default()),
            output_path: Arc::new(PathBuf::new()),
        }
    }
}

pub fn audio_frames_to_speech_frames(
    data: &[f32],
    sample_rate: u32,
    vad_engine: &mut Box<dyn VadEngine + Send>,
) -> Result<Option<Vec<f32>>> {
    let audio_data = if sample_rate != m::SAMPLE_RATE as u32 {
        resample(data.as_ref(), sample_rate, m::SAMPLE_RATE as u32)?
    } else {
        data.to_vec()
    };

    let audio_data = normalize_v2(&audio_data);
    let mut all_speech_data = Vec::new();
    let mut speech_detected = false;

    for chunk in audio_data.chunks(CONFIG.frame_size) {
        vad_engine.buffer().add_frame(chunk.to_vec());
        let is_speech = vad_engine.process_frame(chunk)?;

        match vad_engine.buffer().process_speech(is_speech) {
            SpeechBoundary::Start => {
                speech_detected = true;
            }
            SpeechBoundary::End => {
                if speech_detected {
                    let speech_data = vad_engine.buffer().get_speech_buffer().to_vec();
                    all_speech_data.extend(speech_data);
                    vad_engine.buffer().clear_speech_buffer();
                    speech_detected = false;
                }
            }
            SpeechBoundary::Continuing if speech_detected => {}
            _ => {}
        }
    }

    // After the main processing loop, check if we have any remaining speech data
    if vad_engine.buffer().is_speech_active() {
        println!("end of audio reached while speech was active, finalizing segment");
        let speech_data = vad_engine.buffer().get_speech_buffer().to_vec();
        all_speech_data.extend(speech_data);
        vad_engine.buffer().clear_speech_buffer();
    }

    if all_speech_data.is_empty() {
        Ok(None)
    } else {
        Ok(Some(all_speech_data))
    }
}

fn resample(input: &[f32], from_sample_rate: u32, to_sample_rate: u32) -> Result<Vec<f32>> {
    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };

    let mut resampler = SincFixedIn::<f32>::new(
        to_sample_rate as f64 / from_sample_rate as f64,
        2.0,
        params,
        input.len(),
        1,
    )?;

    let waves_in = vec![input.to_vec()];
    let waves_out = resampler.process(&waves_in, None)?;
    Ok(waves_out.into_iter().next().unwrap())
}
