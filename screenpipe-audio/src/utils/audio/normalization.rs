/// Normalizes audio samples to target RMS and peak levels while preserving dynamics.
///
/// # Arguments
/// * `audio` - Slice of audio samples in the range [-1.0, 1.0]
///
/// # Returns
/// * `Vec<f32>` - Normalized audio samples
///
/// The function normalizes audio by:
/// 1. Computing RMS (Root Mean Square) and peak values
/// 2. Calculating scaling factors to reach target levels
/// 3. Applying the minimum of RMS and peak scaling to preserve dynamics
pub fn normalize_v2(audio: &[f32]) -> Vec<f32> {
    const TARGET_RMS: f32 = 0.2;
    const TARGET_PEAK: f32 = 0.95;

    let rms = (audio.iter().map(|&x| x * x).sum::<f32>() / audio.len() as f32).sqrt();
    let peak = audio
        .iter()
        .fold(0.0f32, |max, &sample| max.max(sample.abs()));

    // Return the original audio if it's completely silent
    if rms.abs() < f32::EPSILON || peak.abs() < f32::EPSILON {
        return audio.to_vec();
    }

    let rms_scaling = TARGET_RMS / rms;
    let peak_scaling = TARGET_PEAK / peak;
    let scaling_factor = rms_scaling.min(peak_scaling);

    audio
        .iter()
        .map(|&sample| sample * scaling_factor)
        .collect()
}
