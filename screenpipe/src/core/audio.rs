use chrono::{DateTime, Duration, Utc};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Sample;
use cpal::SampleFormat;
use std::fs::File;
use std::io::BufWriter;
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
pub struct AudioHandle {
    pub is_paused: Arc<Mutex<bool>>,
    pub control_sender: Sender<AudioControl>,
}

pub enum AudioControl {
    Stop,
}

pub fn start_audio_recording(output_file: &str) -> Result<AudioHandle, Box<dyn std::error::Error>> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("No input device available")?;
    let config = device.default_input_config()?;

    println!("Default input config: {:?}", config);

    let spec = wav_spec_from_config(&config);
    let writer = hound::WavWriter::create(output_file, spec)?;
    let writer = Arc::new(Mutex::new(Some(writer)));

    let is_paused = Arc::new(Mutex::new(false));
    let is_paused_clone = is_paused.clone();

    let (control_sender, control_receiver) = mpsc::channel();

    let writer_clone = writer.clone();

    std::thread::spawn(move || {
        let err_fn = |err| eprintln!("An error occurred on the input audio stream: {}", err);

        let stream = match config.sample_format() {
            SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data: &[f32], _: &_| write_input_data(data, &writer_clone, &is_paused_clone),
                err_fn,
                None,
            ),
            SampleFormat::I16 => device.build_input_stream(
                &config.into(),
                move |data: &[i16], _: &_| write_input_data(data, &writer_clone, &is_paused_clone),
                err_fn,
                None,
            ),
            SampleFormat::U16 => device.build_input_stream(
                &config.into(),
                move |data: &[u16], _: &_| write_input_data(data, &writer_clone, &is_paused_clone),
                err_fn,
                None,
            ),
            _ => return,
        };

        if let Ok(stream) = stream {
            stream.play().expect("Failed to play the stream");

            while let Ok(control) = control_receiver.recv() {
                match control {
                    AudioControl::Stop => break,
                }
            }
            drop(stream); // This will stop the stream
        } else {
            eprintln!("Failed to build input stream");
        }

        // Finalize the WAV file
        if let Ok(mut guard) = writer.lock() {
            if let Some(writer) = guard.take() {
                writer.finalize().expect("Failed to finalize WAV file");
            }
        }
    });

    Ok(AudioHandle {
        is_paused,
        control_sender,
    })
}

fn wav_spec_from_config(config: &cpal::SupportedStreamConfig) -> hound::WavSpec {
    hound::WavSpec {
        channels: config.channels() as _,
        sample_rate: config.sample_rate().0 as _,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    }
}

fn write_input_data<T>(
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

// ... existing code ...

pub fn start_chunked_audio_recording(
    local_data_dir: String,
    chunk_duration: Duration,
) -> Result<AudioHandle, Box<dyn std::error::Error>> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("No input device available")?;
    let config = device.default_input_config()?;

    let is_paused = Arc::new(Mutex::new(false));
    let is_paused_clone = is_paused.clone();

    let (control_sender, control_receiver) = mpsc::channel();

    std::thread::spawn(move || {
        let mut current_chunk_start = Utc::now();
        let current_writer = create_wav_writer(&local_data_dir, &current_chunk_start, &config);
        let writer = Arc::new(Mutex::new(Some(current_writer)));
        let writer_clone = writer.clone();
        let config_clone = config.clone();
        let stream = device
            .build_input_stream(
                &config_clone.into(),
                move |data: &[f32], _: &_| {
                    if !*is_paused_clone.lock().unwrap() {
                        let now = Utc::now();
                        if now - current_chunk_start >= chunk_duration {
                            if let Ok(mut guard) = writer.lock() {
                                if let Some(writer) = guard.take() {
                                    writer.finalize().expect("Failed to finalize WAV file");
                                }
                            }
                            current_chunk_start = now;
                            let new_writer =
                                create_wav_writer(&local_data_dir, &current_chunk_start, &config);
                            *writer.lock().unwrap() = Some(new_writer);
                        }
                        write_input_data(data, &writer_clone, &is_paused_clone);
                    }
                },
                |err| eprintln!("An error occurred on the input audio stream: {}", err),
                None,
            )
            .expect("Failed to build input stream");

        stream.play().expect("Failed to play the stream");

        while let Ok(control) = control_receiver.recv() {
            match control {
                AudioControl::Stop => break,
            }
        }
    });

    Ok(AudioHandle {
        is_paused,
        control_sender,
    })
}

fn create_wav_writer(
    local_data_dir: &str,
    timestamp: &DateTime<Utc>,
    config: &cpal::SupportedStreamConfig,
) -> hound::WavWriter<BufWriter<File>> {
    let output_name = format!(
        "{}/audio-{}.wav",
        local_data_dir,
        timestamp.format("%Y%m%d-%H%M%S")
    );
    let spec = wav_spec_from_config(config);
    hound::WavWriter::create(output_name, spec).expect("Failed to create WAV writer")
}

// ... rest of the existing code ...
