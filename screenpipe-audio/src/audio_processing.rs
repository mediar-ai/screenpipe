pub fn normalize_v2(audio: &[f32]) -> Vec<f32> {
    let rms = (audio.iter().map(|&x| x * x).sum::<f32>() / audio.len() as f32).sqrt();
    let peak = audio
        .iter()
        .fold(0.0f32, |max, &sample| max.max(sample.abs()));

    let target_rms = 0.2; // Adjust as needed
    let target_peak = 0.95; // Adjust as needed

    let rms_scaling = target_rms / rms;
    let peak_scaling = target_peak / peak;

    let scaling_factor = rms_scaling.min(peak_scaling);

    audio
        .iter()
        .map(|&sample| sample * scaling_factor)
        .collect()
}
