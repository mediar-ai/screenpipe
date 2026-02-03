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
