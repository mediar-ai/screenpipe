// Audio processing code, adapted from whisper.cpp
// https://github.com/ggerganov/whisper.cpp

use candle::utils::get_num_threads;
use std::sync::Arc;
use std::thread;

// Audio parameters.
const N_FFT: usize = 400;
const HOP_LENGTH: usize = 160;
const CHUNK_LENGTH: usize = 30;

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

pub fn log_mel_spectrogram_<T: Float>(
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
    let pad = 100 * CHUNK_LENGTH / 2;
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

    let hann = Arc::new(hann);
    let samples = Arc::new(samples);
    let filters = Arc::new(filters);

    // use scope to allow for non static references to be passed to the threads
    // and directly collect the results into a single vector
    let all_outputs = thread::scope(|s| {
        (0..n_threads)
            // create threads and return their handles
            .map(|thread_id| {
                let hann = Arc::clone(&hann);
                let samples = Arc::clone(&samples);
                let filters = Arc::clone(&filters);
                // spawn new thread and start work
                s.spawn(move || {
                    log_mel_spectrogram_w(
                        thread_id, &hann, &samples, &filters, fft_size, fft_step, speed_up, n_len,
                        n_mel, n_threads,
                    )
                })
            })
            .collect::<Vec<_>>()
            .into_iter()
            // wait for each thread to finish and collect their results
            .map(|handle| handle.join().expect("Thread failed"))
            .collect::<Vec<_>>()
    });

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

pub fn pcm_to_mel<T: Float>(
    cfg: &candle_transformers::models::whisper::Config,
    samples: &[T],
    filters: &[T],
) -> Vec<T> {
    log_mel_spectrogram_(samples, filters, N_FFT, HOP_LENGTH, cfg.num_mel_bins, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fft() {
        let input = vec![0.0, 1.0, 0.0, 0.0];
        let output = fft(&input);
        assert_eq!(
            output,
            vec![
                1.0,
                0.0,
                6.123233995736766e-17,
                -1.0,
                -1.0,
                0.0,
                -6.123233995736766e-17,
                1.0
            ]
        );
    }

    #[test]
    fn test_dft() {
        let input = vec![0.0, 1.0, 0.0, 0.0];
        let output = dft(&input);
        assert_eq!(
            output,
            vec![
                1.0,
                0.0,
                6.123233995736766e-17,
                -1.0,
                -1.0,
                -1.2246467991473532e-16,
                -1.8369701987210297e-16,
                1.0
            ]
        );
    }

    #[test]
    fn test_log_mel_spectrogram() {
        let samples = vec![0.0; 1000];
        let filters = vec![0.0; 1000];
        let output = log_mel_spectrogram_(&samples, &filters, 100, 10, 10, false);
        assert_eq!(output.len(), 30_000);
    }

    #[test]
    fn test_tiny_log_mel_spectrogram() {
        let samples = vec![0.0; 100];
        let filters = vec![0.0; 100];
        let output = log_mel_spectrogram_(&samples, &filters, 20, 2, 2, false);
        assert_eq!(output.len(), 6_000);
    }
}
