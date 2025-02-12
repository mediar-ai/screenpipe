use anyhow::Result;
use chrono::Utc;
use log::debug;
use realfft::num_complex::{Complex32, ComplexFloat};
use realfft::RealFftPlanner;
use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};
use std::path::PathBuf;

use crate::encode_single_audio;

pub fn normalize_v2(audio: &[f32]) -> Vec<f32> {
    let rms = (audio.iter().map(|&x| x * x).sum::<f32>() / audio.len() as f32).sqrt();
    let peak = audio
        .iter()
        .fold(0.0f32, |max, &sample| max.max(sample.abs()));

    // Return the original audio if it's completely silent
    if rms == 0.0 || peak == 0.0 {
        return audio.to_vec();
    }

    let target_rms = 0.2;
    let target_peak = 0.95;

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
    let window_size = 1600; // 16k sample rate - 100ms
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

pub fn resample(input: &[f32], from_sample_rate: u32, to_sample_rate: u32) -> Result<Vec<f32>> {
    debug!("Resampling audio");
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
    debug!("Performing resampling");
    let waves_out = resampler.process(&waves_in, None)?;
    debug!("Resampling complete");
    Ok(waves_out.into_iter().next().unwrap())
}

pub fn write_audio_to_file(
    audio: &[f32],
    sample_rate: u32,
    output_path: &PathBuf,
    device: &str,
    skip_encoding: bool,
) -> Result<String> {
    let new_file_name = Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let sanitized_device_name = device.replace(['/', '\\'], "_");
    let file_path = PathBuf::from(output_path)
        .join(format!("{}_{}.mp4", sanitized_device_name, new_file_name))
        .to_str()
        .expect("Failed to create valid path")
        .to_string();
    let file_path_clone = file_path.clone();
    // Run FFmpeg in a separate task
    if !skip_encoding {
        encode_single_audio(
            bytemuck::cast_slice(audio),
            sample_rate,
            1,
            &PathBuf::from(file_path),
        )?;
    }
    Ok(file_path_clone)
}

// Audio processing code, adapted from whisper.cpp
// https://github.com/ggerganov/whisper.cpp

use candle::utils::get_num_threads;

pub trait Float:
    num_traits::Float + num_traits::FloatConst + num_traits::NumAssign + Send + Sync
{
}

impl Float for f32 {}
impl Float for f64 {}

// https://github.com/ggerganov/whisper.cpp/blob/4774d2feb01a772a15de81ffc34b34a1f294f020/whisper.cpp#L2357
fn fft<T: Float>(inp: &[T]) -> Vec<T> {
    let n = inp.len();
    let zero = T::zero();
    if n == 1 {
        return vec![inp[0], zero];
    }
    if n % 2 == 1 {
        return dft(inp);
    }
    let mut out = vec![zero; n * 2];

    let mut even = Vec::with_capacity(n / 2);
    let mut odd = Vec::with_capacity(n / 2);

    for (i, &inp) in inp.iter().enumerate() {
        if i % 2 == 0 {
            even.push(inp)
        } else {
            odd.push(inp);
        }
    }

    let even_fft = fft(&even);
    let odd_fft = fft(&odd);

    let two_pi = T::PI() + T::PI();
    let n_t = T::from(n).unwrap();
    for k in 0..n / 2 {
        let k_t = T::from(k).unwrap();
        let theta = two_pi * k_t / n_t;
        let re = theta.cos();
        let im = -theta.sin();

        let re_odd = odd_fft[2 * k];
        let im_odd = odd_fft[2 * k + 1];

        out[2 * k] = even_fft[2 * k] + re * re_odd - im * im_odd;
        out[2 * k + 1] = even_fft[2 * k + 1] + re * im_odd + im * re_odd;

        out[2 * (k + n / 2)] = even_fft[2 * k] - re * re_odd + im * im_odd;
        out[2 * (k + n / 2) + 1] = even_fft[2 * k + 1] - re * im_odd - im * re_odd;
    }
    out
}

// https://github.com/ggerganov/whisper.cpp/blob/4774d2feb01a772a15de81ffc34b34a1f294f020/whisper.cpp#L2337
fn dft<T: Float>(inp: &[T]) -> Vec<T> {
    let zero = T::zero();
    let n = inp.len();
    let two_pi = T::PI() + T::PI();

    let mut out = Vec::with_capacity(2 * n);
    let n_t = T::from(n).unwrap();
    for k in 0..n {
        let k_t = T::from(k).unwrap();
        let mut re = zero;
        let mut im = zero;

        for (j, &inp) in inp.iter().enumerate() {
            let j_t = T::from(j).unwrap();
            let angle = two_pi * k_t * j_t / n_t;
            re += inp * angle.cos();
            im -= inp * angle.sin();
        }

        out.push(re);
        out.push(im);
    }
    out
}

#[allow(clippy::too_many_arguments)]
// https://github.com/ggerganov/whisper.cpp/blob/4774d2feb01a772a15de81ffc34b34a1f294f020/whisper.cpp#L2414
fn log_mel_spectrogram_w<T: Float>(
    ith: usize,
    hann: &[T],
    samples: &[T],
    filters: &[T],
    fft_size: usize,
    fft_step: usize,
    speed_up: bool,
    n_len: usize,
    n_mel: usize,
    n_threads: usize,
) -> Vec<T> {
    let n_fft = if speed_up {
        1 + fft_size / 4
    } else {
        1 + fft_size / 2
    };

    let zero = T::zero();
    let half = T::from(0.5).unwrap();
    let mut fft_in = vec![zero; fft_size];
    let mut mel = vec![zero; n_len * n_mel];
    let n_samples = samples.len();
    let end = std::cmp::min(n_samples / fft_step + 1, n_len);

    for i in (ith..end).step_by(n_threads) {
        let offset = i * fft_step;

        // apply Hanning window
        for j in 0..std::cmp::min(fft_size, n_samples - offset) {
            fft_in[j] = hann[j] * samples[offset + j];
        }

        // fill the rest with zeros
        if n_samples - offset < fft_size {
            fft_in[n_samples - offset..].fill(zero);
        }

        // FFT
        let mut fft_out: Vec<T> = fft(&fft_in);

        // Calculate modulus^2 of complex numbers
        for j in 0..fft_size {
            fft_out[j] = fft_out[2 * j] * fft_out[2 * j] + fft_out[2 * j + 1] * fft_out[2 * j + 1];
        }
        for j in 1..fft_size / 2 {
            let v = fft_out[fft_size - j];
            fft_out[j] += v;
        }

        if speed_up {
            // scale down in the frequency domain results in a speed up in the time domain
            for j in 0..n_fft {
                fft_out[j] = half * (fft_out[2 * j] + fft_out[2 * j + 1]);
            }
        }

        // mel spectrogram
        for j in 0..n_mel {
            let mut sum = zero;
            let mut k = 0;
            // Unroll loop
            while k < n_fft.saturating_sub(3) {
                sum += fft_out[k] * filters[j * n_fft + k]
                    + fft_out[k + 1] * filters[j * n_fft + k + 1]
                    + fft_out[k + 2] * filters[j * n_fft + k + 2]
                    + fft_out[k + 3] * filters[j * n_fft + k + 3];
                k += 4;
            }
            // Handle remainder
            while k < n_fft {
                sum += fft_out[k] * filters[j * n_fft + k];
                k += 1;
            }
            mel[j * n_len + i] = T::max(sum, T::from(1e-10).unwrap()).log10();
        }
    }
    mel
}

pub async fn log_mel_spectrogram_<T: Float + 'static>(
    samples: &[T],
    filters: &[T],
    fft_size: usize,
    fft_step: usize,
    n_mel: usize,
    speed_up: bool,
) -> Vec<T> {
    let zero = T::zero();
    let two_pi = T::PI() + T::PI();
    let half = T::from(0.5).unwrap();
    let one = T::from(1.0).unwrap();
    let four = T::from(4.0).unwrap();
    let fft_size_t = T::from(fft_size).unwrap();

    let hann: Vec<T> = (0..fft_size)
        .map(|i| half * (one - ((two_pi * T::from(i).unwrap()) / fft_size_t).cos()))
        .collect();
    let n_len = samples.len() / fft_step;

    // pad audio with at least one extra chunk of zeros
    let pad = 100 * candle_transformers::models::whisper::CHUNK_LENGTH / 2;
    let n_len = if n_len % pad != 0 {
        (n_len / pad + 1) * pad
    } else {
        n_len
    };
    let n_len = n_len + pad;
    let samples = {
        let mut samples_padded = samples.to_vec();
        let to_add = n_len * fft_step - samples.len();
        samples_padded.extend(std::iter::repeat(zero).take(to_add));
        samples_padded
    };

    // ensure that the number of threads is even and less than 12
    let n_threads = std::cmp::min(get_num_threads() - get_num_threads() % 2, 12);
    let n_threads = std::cmp::max(n_threads, 2);

    // Create owned copies of the input data
    let samples = samples.to_vec();
    let filters = filters.to_vec();

    let mut handles = vec![];
    for thread_id in 0..n_threads {
        // Clone the owned vectors for each task
        let hann = hann.clone();
        let samples = samples.clone();
        let filters = filters.clone();

        handles.push(tokio::task::spawn(async move {
            log_mel_spectrogram_w(
                thread_id, &hann, &samples, &filters, fft_size, fft_step, speed_up, n_len, n_mel,
                n_threads,
            )
        }));
    }

    let all_outputs = futures::future::join_all(handles)
        .await
        .into_iter()
        .map(|res| res.expect("Task failed"))
        .collect::<Vec<_>>();

    let l = all_outputs[0].len();
    let mut mel = vec![zero; l];

    // iterate over mel spectrogram segments, dividing work by threads.
    for segment_start in (0..l).step_by(n_threads) {
        // go through each thread's output.
        for thread_output in all_outputs.iter() {
            // add each thread's piece to our mel spectrogram.
            for offset in 0..n_threads {
                let mel_index = segment_start + offset; // find location in mel.
                if mel_index < mel.len() {
                    // Make sure we don't go out of bounds.
                    mel[mel_index] += thread_output[mel_index];
                }
            }
        }
    }

    let mmax = mel
        .iter()
        .max_by(|&u, &v| u.partial_cmp(v).unwrap_or(std::cmp::Ordering::Greater))
        .copied()
        .unwrap_or(zero)
        - T::from(8).unwrap();
    for m in mel.iter_mut() {
        let v = T::max(*m, mmax);
        *m = v / four + one
    }
    mel
}

pub async fn pcm_to_mel<T: Float + 'static>(
    cfg: &candle_transformers::models::whisper::Config,
    samples: &[T],
    filters: &[T],
) -> Vec<T> {
    log_mel_spectrogram_(
        samples,
        filters,
        candle_transformers::models::whisper::N_FFT,
        candle_transformers::models::whisper::HOP_LENGTH,
        cfg.num_mel_bins,
        false,
    )
    .await
}
