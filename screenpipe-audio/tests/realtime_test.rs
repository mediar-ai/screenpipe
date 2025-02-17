use futures::StreamExt;
use screenpipe_audio::realtime::RealtimeTranscriptionEvent;
use screenpipe_audio::{deepgram::start_deepgram_stream, AudioDevice};
use screenpipe_audio::{pcm_decode, DeviceType};
use screenpipe_events::subscribe_to_event;
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
    let (samples, sample_rate) = pcm_decode("test_data/accuracy1.wav").unwrap_or_else(|e| {
        panic!("Failed to decode audio: {}", e);
    });

    let (stream_tx, stream_rx) = broadcast::channel(sample_rate as usize * 3);
    let device = AudioDevice::new("test".to_string(), DeviceType::Output);
    let is_running = Arc::new(AtomicBool::new(true));

    let deepgram_api_key = std::env::var("CUSTOM_DEEPGRAM_API_KEY").unwrap();

    let is_running_clone = is_running.clone();

    tokio::spawn(async move {
        let _ = start_deepgram_stream(
            stream_rx,
            Arc::new(device),
            sample_rate,
            is_running_clone,
            Some(deepgram_api_key),
        )
        .await;

        println!("Deepgram stream closed");
    });

    let transcription_receiver_handle = tokio::spawn(async move {
        let mut receiver = subscribe_to_event::<RealtimeTranscriptionEvent>("transcription");
        loop {
            tokio::select! {
                    event = receiver.next() => {
                        if let Some(event) = event {
                            println!("Received event: {:?}", event.data.transcription);
                        } else {
                            println!("Receiver closed");
                        }
                },
                _ = tokio::time::sleep(Duration::from_secs(15)) => {
                    println!("Timeout");
                    return;
                }
            }
        }
    });

    tokio::time::sleep(Duration::from_secs(10)).await;

    let tx = stream_tx.clone();
    let samples = samples.clone();

    for sample in samples.chunks(sample_rate as usize * 5) {
        tx.send(sample.to_vec()).unwrap_or_else(|e| {
            panic!("Failed to send sample: {}", e);
        });
        tokio::time::sleep(Duration::from_millis(10)).await;
    }

    transcription_receiver_handle.await.unwrap();
}
