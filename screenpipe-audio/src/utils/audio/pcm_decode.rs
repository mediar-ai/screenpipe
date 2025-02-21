use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::CODEC_TYPE_NULL;
use symphonia::core::conv::FromSample;
use tracing::debug;

/// Converts audio samples from any supported format to f32
fn conv<T>(samples: &mut Vec<f32>, data: std::borrow::Cow<symphonia::core::audio::AudioBuffer<T>>)
where
    T: symphonia::core::sample::Sample,
    f32: symphonia::core::conv::FromSample<T>,
{
    samples.extend(data.chan(0).iter().map(|v| f32::from_sample(*v)))
}

/// Decodes an audio file to PCM format (f32 samples)
///
/// # Arguments
/// * `path` - Path to the audio file
///
/// # Returns
/// * `Ok((Vec<f32>, u32))` - Tuple containing the PCM samples and sample rate
/// * `Err(anyhow::Error)` - If decoding fails
///
/// # Errors
/// Returns an error if:
/// * The file cannot be opened
/// * No supported audio tracks are found
/// * Decoding fails
pub fn pcm_decode<P: AsRef<std::path::Path>>(path: P) -> anyhow::Result<(Vec<f32>, u32)> {
    debug!("Starting PCM decoding for {:?}", path.as_ref());

    let src = std::fs::File::open(&path)?;
    let mss = symphonia::core::io::MediaSourceStream::new(Box::new(src), Default::default());

    // Create a probe hint and use default options
    let hint = symphonia::core::probe::Hint::new();
    let probed = symphonia::default::get_probe().format(
        &hint,
        mss,
        &Default::default(),
        &Default::default(),
    )?;

    let mut format = probed.format;

    // Find the first decodeable audio track
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| anyhow::anyhow!("no supported audio tracks found"))?;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &Default::default())
        .map_err(|_| anyhow::anyhow!("unsupported codec"))?;

    let track_id = track.id;
    let sample_rate = track
        .codec_params
        .sample_rate
        .ok_or_else(|| anyhow::anyhow!("could not determine sample rate"))?;

    let mut pcm_data = Vec::new();
    debug!("Starting decode loop");

    while let Ok(packet) = format.next_packet() {
        // Skip metadata and packets from other tracks
        while !format.metadata().is_latest() {
            format.metadata().pop();
        }
        if packet.track_id() != track_id {
            continue;
        }

        // Decode the packet
        match decoder.decode(&packet)? {
            AudioBufferRef::F32(buf) => pcm_data.extend(buf.chan(0)),
            AudioBufferRef::U8(data) => conv(&mut pcm_data, data),
            AudioBufferRef::U16(data) => conv(&mut pcm_data, data),
            AudioBufferRef::U24(data) => conv(&mut pcm_data, data),
            AudioBufferRef::U32(data) => conv(&mut pcm_data, data),
            AudioBufferRef::S8(data) => conv(&mut pcm_data, data),
            AudioBufferRef::S16(data) => conv(&mut pcm_data, data),
            AudioBufferRef::S24(data) => conv(&mut pcm_data, data),
            AudioBufferRef::S32(data) => conv(&mut pcm_data, data),
            AudioBufferRef::F64(data) => conv(&mut pcm_data, data),
        }
    }

    Ok((pcm_data, sample_rate))
}
