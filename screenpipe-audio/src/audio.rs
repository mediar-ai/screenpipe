use cpal::Sample;
use std::fs::File;
use std::io::BufWriter;
use std::sync::{Arc, Mutex};

pub fn wav_spec_from_config(config: &cpal::SupportedStreamConfig) -> hound::WavSpec {
    hound::WavSpec {
        channels: config.channels() as _,
        sample_rate: config.sample_rate().0 as _,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    }
}

pub fn write_input_data<T>(
    input: &[T],
    writer: &Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>,
    is_paused: &Arc<Mutex<bool>>,
) where
    T: Sample + SampleToI16,
{
    if !*is_paused.lock().unwrap() {
        if let Ok(mut guard) = writer.try_lock() {
            if let Some(writer) = guard.as_mut() {
                for &sample in input.iter() {
                    let sample_to_write: i16 = sample.to_i16();
                    writer.write_sample(sample_to_write).ok();
                }
            }
        }
    }
}

trait SampleToI16 {
    fn to_i16(&self) -> i16;
}

impl SampleToI16 for f32 {
    fn to_i16(&self) -> i16 {
        (self.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
    }
}

impl SampleToI16 for i16 {
    fn to_i16(&self) -> i16 {
        *self
    }
}

impl SampleToI16 for u16 {
    fn to_i16(&self) -> i16 {
        (*self as i32 - i16::MAX as i32) as i16
    }
}
