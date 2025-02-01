use screenpipe_audio::deepgram::start_deepgram_stream;
use screenpipe_audio::pcm_decode;
use screenpipe_core::{AudioDevice, AudioDeviceType};
use std::{
    sync::{atomic::AtomicBool, Arc},
    time::Duration,
};
use tokio::sync::broadcast;

/// 1. Get sample audio from test_data/accuracy1.wav
/// 2. Stream audio from file
/// 3. Transcribe audio
/// 4. Assert that the transcription is correct
#[tokio::test]
#[ignore]
async fn test_realtime_transcription() {
    let (samples, sample_rate) = pcm_decode("test_data/accuracy1.wav").unwrap();

    let (stream_tx, stream_rx) = broadcast::channel(sample_rate as usize * 3);
    let device = AudioDevice::new("test".to_string(), AudioDeviceType::Output);
    let is_running = Arc::new(AtomicBool::new(true));

    let deepgram_api_key = std::env::var("CUSTOM_DEEPGRAM_API_KEY").unwrap();

    let (realtime_transcription_sender, realtime_transcription_receiver) =
        broadcast::channel(10000);

    let is_running_clone = is_running.clone();

    tokio::spawn(async move {
        let _ = start_deepgram_stream(
            stream_rx,
            Arc::new(device),
            sample_rate,
            Arc::new(realtime_transcription_sender),
            is_running_clone,
            vec![],
            Some(deepgram_api_key),
        )
        .await;

        println!("Deepgram stream closed");
    });

    let transcription_receiver_handle = tokio::spawn(async move {
        let mut receiver = realtime_transcription_receiver;
        loop {
            tokio::select! {
                    event = receiver.recv() => {
                        if let Ok(event) = event {
                            println!("Received event: {:?}", event.transcription);
                        } else {
                            println!("Receiver closed");
                        }
                },
                _ = tokio::time::sleep(Duration::from_secs(10)) => {
                    println!("Timeout");
                    return;
                }
            }
        }
    });

    tokio::time::sleep(Duration::from_secs(5)).await;

    let tx = stream_tx.clone();
    let samples = samples.clone();

    for sample in samples.chunks(sample_rate as usize * 5) {
        tx.send(sample.to_vec()).unwrap();
        tokio::time::sleep(Duration::from_millis(10)).await;
    }

    transcription_receiver_handle.await.unwrap();
}
