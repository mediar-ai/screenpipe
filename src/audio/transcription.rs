use anyhow::{Context, Result};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use futures_util::{SinkExt, StreamExt};
use url::Url;

pub async fn start_realtime_transcription(
    audio_sender: mpsc::Sender<Vec<f32>>,
) -> Result<()> {
    let ws_url = std::env::var("DEEPGRAM_WEBSOCKET_URL")
        .context("DEEPGRAM_WEBSOCKET_URL not set")?;
    
    let url = Url::parse(&ws_url)
        .context("Failed to parse WebSocket URL")?;

    let (ws_stream, _) = connect_async(url)
        .await
        .context("Failed to connect to WebSocket")?;
    
    let (mut write, mut read) = ws_stream.split();

    // Handle incoming transcription results
    tokio::spawn(async move {
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    tracing::info!("received transcription: {}", text);
                    // Handle the transcription result here
                }
                Ok(Message::Close(_)) => {
                    tracing::warn!("websocket connection closed");
                    break;
                }
                Err(e) => {
                    tracing::error!("websocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }
    });

    // Handle outgoing audio data
    let mut audio_receiver = audio_sender.subscribe();
    while let Ok(audio_data) = audio_receiver.recv().await {
        // Convert audio data to correct format (16-bit PCM)
        let pcm_data: Vec<i16> = audio_data
            .iter()
            .map(|&sample| (sample * 32767.0) as i16)
            .collect();
        
        if let Err(e) = write.send(Message::Binary(pcm_data.into())).await {
            tracing::error!("failed to send audio data: {}", e);
            break;
        }
    }

    Ok(())
} 