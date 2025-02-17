use anyhow::{anyhow, Result};
use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::StreamError;
use tracing::{error, info, warn};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use tokio::sync::{broadcast, oneshot};

use crate::utils::audio::audio_to_mono;

use super::device::{get_cpal_device_and_config, AudioDevice};

#[derive(Clone)]
pub struct AudioStream {
    pub device: Arc<AudioDevice>,
    pub device_config: cpal::SupportedStreamConfig,
    transmitter: Arc<tokio::sync::broadcast::Sender<Vec<f32>>>,
    stream_control: mpsc::Sender<StreamControl>,
    stream_thread: Option<Arc<tokio::sync::Mutex<Option<thread::JoinHandle<()>>>>>,
    is_disconnected: Arc<AtomicBool>,
}

enum StreamControl {
    Stop(oneshot::Sender<()>),
}

impl AudioStream {
    pub async fn from_device(
        device: Arc<AudioDevice>,
        is_running: Arc<AtomicBool>,
    ) -> Result<Self> {
        let (tx, _) = broadcast::channel::<Vec<f32>>(1000);
        let tx_clone = tx.clone();
        let (cpal_audio_device, config) = get_cpal_device_and_config(&device).await?;
        let channels = config.channels();

        let is_running_weak_2 = Arc::downgrade(&is_running);
        let is_disconnected = Arc::new(AtomicBool::new(false));
        let device_clone = device.clone();
        let config_clone = config.clone();
        let (stream_control_tx, stream_control_rx) = mpsc::channel();

        let is_disconnected_clone = is_disconnected.clone();
        let stream_control_tx_clone = stream_control_tx.clone();
        let stream_thread = Arc::new(tokio::sync::Mutex::new(Some(thread::spawn(move || {
            let device = device_clone;
            let device_name = device.to_string();
            let config = config_clone;
            let error_callback = move |err: StreamError| {
                if err
                    .to_string()
                    .contains("The requested device is no longer available")
                {
                    warn!(
                        "audio device {} disconnected. stopping recording.",
                        device_name
                    );
                    stream_control_tx_clone
                        .send(StreamControl::Stop(oneshot::channel().0))
                        .unwrap();

                    is_disconnected_clone.store(true, Ordering::Relaxed);
                } else {
                    error!("an error occurred on the audio stream: {}", err);
                    if err.to_string().contains("device is no longer valid") {
                        warn!("audio device disconnected. stopping recording.");
                        if let Some(arc) = is_running_weak_2.upgrade() {
                            arc.store(false, Ordering::Relaxed);
                        }
                    }
                }
            };

            let stream = match config.sample_format() {
                cpal::SampleFormat::F32 => cpal_audio_device
                    .build_input_stream(
                        &config.into(),
                        move |data: &[f32], _: &_| {
                            let mono = audio_to_mono(data, channels);
                            let _ = tx.send(mono);
                        },
                        error_callback,
                        None,
                    )
                    .expect("Failed to build input stream"),
                cpal::SampleFormat::I16 => cpal_audio_device
                    .build_input_stream(
                        &config.into(),
                        move |data: &[i16], _: &_| {
                            let mono = audio_to_mono(bytemuck::cast_slice(data), channels);
                            let _ = tx.send(mono);
                        },
                        error_callback,
                        None,
                    )
                    .expect("Failed to build input stream"),
                cpal::SampleFormat::I32 => cpal_audio_device
                    .build_input_stream(
                        &config.into(),
                        move |data: &[i32], _: &_| {
                            let mono = audio_to_mono(bytemuck::cast_slice(data), channels);
                            let _ = tx.send(mono);
                        },
                        error_callback,
                        None,
                    )
                    .expect("Failed to build input stream"),
                cpal::SampleFormat::I8 => cpal_audio_device
                    .build_input_stream(
                        &config.into(),
                        move |data: &[i8], _: &_| {
                            let mono = audio_to_mono(bytemuck::cast_slice(data), channels);
                            let _ = tx.send(mono);
                        },
                        error_callback,
                        None,
                    )
                    .expect("Failed to build input stream"),
                _ => {
                    error!("unsupported sample format: {}", config.sample_format());
                    return;
                }
            };

            if let Err(e) = stream.play() {
                error!("failed to play stream for {}: {}", device.to_string(), e);
            }

            if let Ok(StreamControl::Stop(response)) = stream_control_rx.recv() {
                info!("stopped recording audio stream");
                stream.pause().ok();
                drop(stream);
                response.send(()).ok();
            }
        }))));

        Ok(AudioStream {
            device,
            device_config: config,
            transmitter: Arc::new(tx_clone),
            stream_control: stream_control_tx,
            stream_thread: Some(stream_thread),
            is_disconnected,
        })
    }

    pub async fn subscribe(&self) -> broadcast::Receiver<Vec<f32>> {
        self.transmitter.subscribe()
    }

    pub async fn stop(mut self) -> Result<()> {
        self.is_disconnected.store(true, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.stream_control.send(StreamControl::Stop(tx))?;
        rx.await?;

        if let Some(thread_arc) = self.stream_thread.take() {
            let thread_handle = tokio::task::spawn_blocking(move || {
                let mut thread_guard = thread_arc.blocking_lock();
                if let Some(join_handle) = thread_guard.take() {
                    join_handle
                        .join()
                        .map_err(|_| anyhow!("failed to join stream thread"))
                } else {
                    Ok(())
                }
            });

            thread_handle.await??;
        }

        Ok(())
    }

    pub fn is_disconnected(&self) -> bool {
        self.is_disconnected.load(Ordering::Relaxed)
    }
}
