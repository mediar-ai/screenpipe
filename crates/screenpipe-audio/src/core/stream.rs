use anyhow::{anyhow, Result};
use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::StreamError;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use tokio::sync::{broadcast, oneshot};
use tokio::task::LocalSet;
use tracing::{error, warn};

use crate::utils::audio::audio_to_mono;

use super::device::{get_cpal_device_and_config, AudioDevice};

#[derive(Clone)]
pub struct AudioStream {
    pub device: Arc<AudioDevice>,
    pub device_config: cpal::SupportedStreamConfig,
    transmitter: Arc<tokio::sync::broadcast::Sender<Vec<f32>>>,
    stream_control: mpsc::Sender<StreamControl>,
    stream_thread: Option<Arc<tokio::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>>,
    pub is_disconnected: Arc<AtomicBool>,
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

        let is_running_weak = Arc::downgrade(&is_running);
        let is_disconnected = Arc::new(AtomicBool::new(false));
        let (stream_control_tx, stream_control_rx) = mpsc::channel();

        let stream_thread = Self::spawn_audio_thread(
            cpal_audio_device,
            config.clone(),
            tx,
            stream_control_rx,
            channels,
            is_running_weak,
            is_disconnected.clone(),
            stream_control_tx.clone(),
        )
        .await?;

        Ok(AudioStream {
            device,
            device_config: config,
            transmitter: Arc::new(tx_clone),
            stream_control: stream_control_tx,
            stream_thread: Some(Arc::new(tokio::sync::Mutex::new(Some(stream_thread)))),
            is_disconnected,
        })
    }

    #[allow(clippy::too_many_arguments)]
    async fn spawn_audio_thread(
        device: cpal::Device,
        config: cpal::SupportedStreamConfig,
        tx: broadcast::Sender<Vec<f32>>,
        stream_control_rx: mpsc::Receiver<StreamControl>,
        channels: u16,
        is_running_weak: std::sync::Weak<AtomicBool>,
        is_disconnected: Arc<AtomicBool>,
        stream_control_tx: mpsc::Sender<StreamControl>,
    ) -> Result<tokio::task::JoinHandle<()>> {
        let device_name = device.name()?;

        Ok(tokio::task::spawn_blocking(move || {
            let error_callback = create_error_callback(
                device_name.clone(),
                is_running_weak,
                is_disconnected,
                stream_control_tx,
            );

            let stream = build_input_stream(&device, &config, channels, tx, error_callback);

            match stream {
                Ok(stream) => {
                    if let Err(e) = stream.play() {
                        error!("failed to play stream for {}: {}", device_name, e);
                        return;
                    }

                    if let Ok(StreamControl::Stop(response)) = stream_control_rx.recv() {
                        stream.pause().ok();
                        drop(stream);
                        response.send(()).ok();
                    }
                }
                Err(e) => {
                    error!("Failed to build input stream: {}", e);
                }
            }
        }))
    }

    pub async fn subscribe(&self) -> broadcast::Receiver<Vec<f32>> {
        self.transmitter.subscribe()
    }

    pub async fn stop(&self) -> Result<()> {
        self.is_disconnected.store(true, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.stream_control.send(StreamControl::Stop(tx))?;
        rx.await?;

        if let Some(thread_arc) = self.stream_thread.as_ref() {
            let thread_arc_clone = thread_arc.clone();
            let thread_handle = tokio::task::spawn_blocking(move || {
                let mut thread_guard = thread_arc_clone.blocking_lock();
                if let Some(join_handle) = thread_guard.take() {
                    join_handle.abort();
                }
            });

            thread_handle.await?;
        }

        Ok(())
    }

    pub fn is_disconnected(&self) -> bool {
        self.is_disconnected.load(Ordering::Relaxed)
    }
}

fn create_error_callback(
    device_name: String,
    is_running_weak: std::sync::Weak<AtomicBool>,
    is_disconnected: Arc<AtomicBool>,
    stream_control_tx: mpsc::Sender<StreamControl>,
) -> impl FnMut(StreamError) + Send + 'static {
    move |err: StreamError| {
        if err
            .to_string()
            .contains("The requested device is no longer available")
        {
            warn!(
                "audio device {} disconnected. stopping recording.",
                device_name
            );
            stream_control_tx
                .send(StreamControl::Stop(oneshot::channel().0))
                .unwrap();
            is_disconnected.store(true, Ordering::Relaxed);
        } else {
            error!("an error occurred on the audio stream: {}", err);
            if err.to_string().contains("device is no longer valid") {
                warn!("audio device disconnected. stopping recording.");
                if let Some(arc) = is_running_weak.upgrade() {
                    arc.store(false, Ordering::Relaxed);
                }
            }
        }
    }
}

fn build_input_stream(
    device: &cpal::Device,
    config: &cpal::SupportedStreamConfig,
    channels: u16,
    tx: broadcast::Sender<Vec<f32>>,
    error_callback: impl FnMut(StreamError) + Send + 'static,
) -> Result<cpal::Stream> {
    match config.sample_format() {
        cpal::SampleFormat::F32 => device
            .build_input_stream(
                &config.config(),
                move |data: &[f32], _: &_| {
                    let mono = audio_to_mono(data, channels);
                    let _ = tx.send(mono);
                },
                error_callback,
                None,
            )
            .map_err(|e| anyhow!(e)),
        cpal::SampleFormat::I16 => device
            .build_input_stream(
                &config.config(),
                move |data: &[i16], _: &_| {
                    let mono = audio_to_mono(bytemuck::cast_slice(data), channels);
                    let _ = tx.send(mono);
                },
                error_callback,
                None,
            )
            .map_err(|e| anyhow!(e)),
        cpal::SampleFormat::I32 => device
            .build_input_stream(
                &config.config(),
                move |data: &[i32], _: &_| {
                    let mono = audio_to_mono(bytemuck::cast_slice(data), channels);
                    let _ = tx.send(mono);
                },
                error_callback,
                None,
            )
            .map_err(|e| anyhow!(e)),
        cpal::SampleFormat::I8 => device
            .build_input_stream(
                &config.config(),
                move |data: &[i8], _: &_| {
                    let mono = audio_to_mono(bytemuck::cast_slice(data), channels);
                    let _ = tx.send(mono);
                },
                error_callback,
                None,
            )
            .map_err(|e| anyhow!(e)),
        _ => Err(anyhow!(
            "unsupported sample format: {}",
            config.sample_format()
        )),
    }
}

impl Drop for AudioStream {
    fn drop(&mut self) {
        let set = LocalSet::new();

        let stream_control = self.stream_control.clone();
        let is_disconnected = self.is_disconnected.clone();

        set.spawn_local(async move {
            let _ = stream_control.send(StreamControl::Stop(oneshot::channel().0));
            is_disconnected.store(true, Ordering::Relaxed);
        });
    }
}
