use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::conv::FromSample;

fn conv<T>(samples: &mut Vec<f32>, data: std::borrow::Cow<symphonia::core::audio::AudioBuffer<T>>)
where
    T: symphonia::core::sample::Sample,
    f32: symphonia::core::conv::FromSample<T>,
{
    samples.extend(data.chan(0).iter().map(|v| f32::from_sample(*v)))
}

pub(crate) fn pcm_decode<P: AsRef<std::path::Path>>(path: P) -> anyhow::Result<(Vec<f32>, u32)> {
    // Open the media source.
    let src = std::fs::File::open(path)?;

    // Create the media source stream.
    let mss = symphonia::core::io::MediaSourceStream::new(Box::new(src), Default::default());

    // Create a probe hint using the file's extension. [Optional]
    let hint = symphonia::core::probe::Hint::new();

    // Use the default options for metadata and format readers.
    let meta_opts: symphonia::core::meta::MetadataOptions = Default::default();
    let fmt_opts: symphonia::core::formats::FormatOptions = Default::default();

    // Probe the media source.
    let probed = symphonia::default::get_probe().format(&hint, mss, &fmt_opts, &meta_opts)?;
    // Get the instantiated format reader.
    let mut format = probed.format;

    // Find the first audio track with a known (decodeable) codec.
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .expect("no supported audio tracks");

    // Use the default options for the decoder.
    let dec_opts: DecoderOptions = Default::default();

    // Create a decoder for the track.
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &dec_opts)
        .expect("unsupported codec");
    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(0);
    let mut pcm_data = Vec::new();
    // The decode loop.
    while let Ok(packet) = format.next_packet() {
        // Consume any new metadata that has been read since the last packet.
        while !format.metadata().is_latest() {
            format.metadata().pop();
        }

        // If the packet does not belong to the selected track, skip over it.
        if packet.track_id() != track_id {
            continue;
        }
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
