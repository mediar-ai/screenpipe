use reqwest::Client;
use serde_json::{json, Value};
use uuid::Uuid;
use chrono::Utc;
use log::debug;

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

#[allow(dead_code)]
fn decode_from_uuid(uuid: Uuid) -> (String, String) {
    let combined = String::from_utf8_lossy(uuid.as_bytes()).to_string();
    let parts: Vec<&str> = combined.splitn(2, '-').collect();
    let source = match parts[0] {
        "a" => "audio",
        "s" => "screen",
        _ => "unknown",
    };
    (source.to_string(), parts.get(1).unwrap_or(&"").to_string())
}

pub async fn send_data_to_friend_wearable(
    memory_source: String,
    memory_id: String,
    memory_text: String,
    uid: &str,
) -> Result<Value, Box<dyn std::error::Error>> {
    let request_id = encode_to_uuid(&memory_source, &memory_id);
    
    let friend_user_id = uid.to_string();
    let endpoint = "https://webhook-test.com/c46d38536e2851a100e3c230386ae238";

    let memory_timestamp = Utc::now().to_rfc3339();

    let payload = json!({
        "request_id": request_id.to_string(),
        "memory_source": memory_source,
        "memory_id": memory_id,
        "memory_timestamp": memory_timestamp,
        "memory_text": memory_text,
        "friend_user_id": friend_user_id
    });

    debug!("Sending request to friend endpoint: {}", payload);

    let client = Client::new();
    let response = client.post(endpoint)
        .json(&payload)
        .send()
        .await?;

    let status = response.status();
    let response_body = response.text().await?;

    match status.as_u16() {
        200 => {
            let response_json: Value = serde_json::from_str(&response_body)?;
            Ok(response_json)
        },
        400 => Err("Bad Request: Invalid data sent".into()),
        401 => Err("Unauthorized: Authentication failed".into()),
        500 => Err("Server Error: Please try again later".into()),
        _ => Err(format!("Unexpected response: {}", response_body).into()),
    }
}