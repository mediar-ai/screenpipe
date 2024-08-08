use reqwest::Client;
use serde_json::json;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use log::debug;
use std::sync::Arc;
use async_trait::async_trait;
use std::error::Error as StdError;

fn encode_to_uuid(memory_source: &str, memory_id: &str) -> Uuid {
    let prefix = match memory_source {
        "audio" => "a",
        "screen" => "s",
        _ => "u",
    };
    let combined = format!("{}-{}", prefix, memory_id);
    let mut bytes = [0u8; 16];
    combined.bytes().enumerate().for_each(|(i, b)| {
        if i < 16 { bytes[i] = b }
    });
    Uuid::from_bytes(bytes)
}

#[async_trait]
pub trait FriendWearableDatabase {
    async fn get_chunked_data_since_last_request(&self, memory_source: &str, friend_user_id: &str) -> Result<(Vec<String>, i64, i64, DateTime<Utc>, DateTime<Utc>), Box<dyn StdError + Send + Sync>>;
    async fn insert_friend_wearable_request(&self, request_id: &str, memory_source: &str, chunk_id_range: &str, timestamp_range: &str, friend_user_id: &str) -> Result<(), Box<dyn StdError + Send + Sync>>;
}

pub async fn initialize_friend_wearable_loop<DB: FriendWearableDatabase + Send + Sync + 'static>(uid: String, db: Arc<DB>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(600));
        debug!("initialize_friend_wearable_loop started");
        loop {
            interval.tick().await;

            if let Err(e) = send_recent_data_to_friend_wearable(&uid, &db).await {
                eprintln!("Error sending data to friend wearable: {}", e);
            }
        }
    });
}

async fn send_recent_data_to_friend_wearable<DB: FriendWearableDatabase + Send + Sync>(uid: &str, db: &Arc<DB>) -> Result<(), Box<dyn StdError + Send + Sync>> {
    for memory_source in &["screen", "audio"] {
        let (texts, min_chunk_id, max_chunk_id, min_timestamp, max_timestamp) = 
            db.get_chunked_data_since_last_request(memory_source, uid).await?;

        if !texts.is_empty() {
            let chunk_id_range = format!("{}-{}", min_chunk_id, max_chunk_id);
            let timestamp_range = format!("{}-{}", min_timestamp.to_rfc3339(), max_timestamp.to_rfc3339());
            let request_id = encode_to_uuid(memory_source, &chunk_id_range);
            let memory_text = texts.join(" ");

            let payload = json!({
                "request_id": request_id.to_string(),
                "memory_source": memory_source,
                "memory_id": chunk_id_range,
                "memory_timestamp_range": {
                    "start": min_timestamp.to_rfc3339(),
                    "end": max_timestamp.to_rfc3339()
                },
                "memory_text": memory_text,
                "friend_user_id": uid
            });

            send_data_to_friend_wearable_with_payload(payload).await?;
            db.insert_friend_wearable_request(&request_id.to_string(), memory_source, &chunk_id_range, &timestamp_range, uid).await?;
        }
    }
    Ok(())
}

async fn send_data_to_friend_wearable_with_payload(payload: serde_json::Value) -> Result<(), Box<dyn StdError + Send + Sync>> {
    let endpoint = "https://webhook-test.com/c46d38536e2851a100e3c230386ae238";

    debug!("Sending request to friend endpoint: {}", payload);

    let client = Client::new();
    let response = client.post(endpoint)
        .json(&payload)
        .send()
        .await?;

    let status = response.status();
    
    if status.is_success() {
        Ok(())
    } else {
        Err(format!("Unexpected response: {}", status).into())
    }
}