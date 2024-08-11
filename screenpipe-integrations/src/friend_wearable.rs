use async_trait::async_trait;
use chrono::{DateTime, Duration, FixedOffset, Utc};
use log::{debug, error};
use reqwest::Client;
use serde_json::json;
use std::error::Error as StdError;
use std::sync::Arc;
use uuid::Uuid;

fn encode_to_uuid(memory_source: &str, memory_id: &str) -> Uuid {
    let prefix = match memory_source {
        "audio" => "a",
        "screen" => "s",
        _ => "u",
    };
    let combined = format!("{}-{}", prefix, memory_id);
    let mut bytes = [0u8; 16];
    combined.bytes().enumerate().for_each(|(i, b)| {
        if i < 16 {
            bytes[i] = b
        }
    });
    Uuid::from_bytes(bytes)
}

#[async_trait]
pub trait FriendWearableDatabase {
    async fn get_chunked_data_since_last_request(
        &self,
        memory_source: &str,
        friend_user_id: &str,
    ) -> Result<
        (Vec<String>, i64, i64, DateTime<Utc>, DateTime<Utc>),
        Box<dyn StdError + Send + Sync>,
    >;
    async fn get_chunked_data_since_timestamp(
        &self,
        memory_source: &str,
        friend_user_id: &str,
        since: DateTime<Utc>,
    ) -> Result<
        (Vec<String>, i64, i64, DateTime<Utc>, DateTime<Utc>),
        Box<dyn StdError + Send + Sync>,
    >;
    async fn insert_friend_wearable_request(
        &self,
        request_id: &str,
        memory_source: &str,
        chunk_id_range: &str,
        timestamp_range: &str,
        friend_user_id: &str,
        filtered_text: &str,
        structured_response: &str,
        response_id: &str,
        response_created_at: DateTime<Utc>,
    ) -> Result<(), Box<dyn StdError + Send + Sync>>;
}

pub async fn initialize_friend_wearable_loop<DB: FriendWearableDatabase + Send + Sync + 'static>(
    uid: String,
    db: Arc<DB>,
) {
    tokio::spawn(async move {
        let interval = tokio::time::Duration::from_secs(600); // 10 minutes
        debug!(
            "Friend_wearable: loop started with interval: {:?}",
            interval
        );

        loop {
            let now = Utc::now();
            let ten_minutes_ago = now - Duration::minutes(10);
            debug!("Filtering data since: {}", ten_minutes_ago);

            match filter_and_send_data(&uid, &db, ten_minutes_ago).await {
                Ok(_) => debug!("Friend_wearable: Successfully filtered and sent data"),
                Err(e) => error!("Friend_wearable: Error filtering and sending data: {}", e),
            }

            debug!("Friend_wearable: Sleeping for {:?}", interval);
            tokio::time::sleep(interval).await;
        }
    });
}

async fn filter_and_send_data<DB: FriendWearableDatabase + Send + Sync>(
    uid: &str,
    db: &Arc<DB>,
    since: DateTime<Utc>,
) -> Result<(), Box<dyn StdError + Send + Sync>> {
    for source in &["screen", "audio"] {
        let (texts, min_chunk_id, max_chunk_id, min_timestamp, max_timestamp) = db
            .get_chunked_data_since_timestamp(source, uid, since)
            .await?;

        let memory_text = texts.join(" ");
        if memory_text.is_empty() {
            debug!("Friend_wearable: Skipping empty result for source: {}", source);
            continue;
        }

        let chunk_id_range = format!("{}-{}", min_chunk_id, max_chunk_id);
        let request_id = encode_to_uuid(source, &chunk_id_range);
        debug!("Friend_wearable: Joined text length: {}", memory_text.len());

        let payload = json!({
            "request_id": request_id.to_string(),
            "source": source,
            "text": memory_text,
            "timestamp_range": {
                "start": min_timestamp.timestamp(),
                "end": max_timestamp.timestamp()
            }
        });
        debug!(
            "Friend_wearable: Created payload with request_id: {}",
            request_id
        );

        let response = send_data_to_friend_wearable_with_payload(payload.clone(), uid).await?;
        let structured_response = serde_json::to_string(&response["structured"])?;
        let response_id = response["id"].as_str().unwrap_or("").to_string();
        let response_created_at = DateTime::parse_from_rfc3339(response["created_at"].as_str().unwrap_or(""))
            .unwrap_or_else(|_| DateTime::<FixedOffset>::from_naive_utc_and_offset(Utc::now().naive_utc(), FixedOffset::east_opt(0).unwrap()))
            .with_timezone(&Utc);

        db.insert_friend_wearable_request(
            &request_id.to_string(),
            source,
            &chunk_id_range,
            &format!(
                "{}-{}",
                min_timestamp.timestamp(),
                max_timestamp.timestamp()
            ),
            uid,
            &memory_text,
            &structured_response,
            &response_id,
            response_created_at,
        )
        .await?;
        debug!("Friend_wearable: Inserted friend wearable request");
    }
    Ok(())
}

async fn send_data_to_friend_wearable_with_payload(
    payload: serde_json::Value,
    uid: &str,
) -> Result<serde_json::Value, Box<dyn StdError + Send + Sync>> {
    let endpoint = "https://josancamon19--api-fastapi-app.modal.run/"; // https://camel-lucky-reliably.ngrok-free.app/v1/integrations/screenpipe
    let api_key = "123";

    let client = Client::new();
    let response = client.post(endpoint)
        .header("Content-Type", "application/json")
        .header("api_key", api_key)
        .query(&[("uid", uid)])
        .json(&json!({
            "request_id": payload["request_id"],
            "source": payload["source"],
            "text": payload["text"],
            "timestamp_range": {
                "start": payload["timestamp_range"]["start"].as_str().and_then(|s| s.parse::<i64>().ok()).unwrap_or(0),
                "end": payload["timestamp_range"]["end"].as_str().and_then(|s| s.parse::<i64>().ok()).unwrap_or(0)
            }
        }))
        .send()
        .await?;

    let status = response.status();

    if status.is_success() {
        debug!("Friend_wearable: Successfully sent data to friend wearable");
        let response_body: serde_json::Value = response.json().await?;
        Ok(response_body)
    } else {
        error!(
            "Friend_wearable: Unexpected response from friend wearable API: {}",
            status
        );
        Err(format!("Unexpected response: {}", status).into())
    }
}