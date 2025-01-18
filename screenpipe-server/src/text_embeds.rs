use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info};

#[derive(Debug, Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
}

#[derive(Debug, Deserialize)]
struct OllamaResponse {
    embedding: Vec<f32>,
}

/// Generates embeddings for text using Ollama's nomic-embed-text model
pub async fn generate_embedding(text: &str, frame_id: i64) -> Result<Vec<f32>> {
    let client = Client::new();
    
    debug!("generating embedding for frame_id: {}, text: {}", frame_id, text);

    // Check if Ollama server is running
    if let Err(e) = client.get("http://localhost:11434/api/version").send().await {
        error!("ollama server not running: {}", e);
        return Err(anyhow::anyhow!("ollama server not running"));
    }

    let request = OllamaRequest {
        model: "nomic-embed-text".to_string(),
        prompt: text.to_string(),
    };

    let response = client
        .post("http://localhost:11434/api/embeddings")
        .json(&request)
        .send()
        .await?;

    if !response.status().is_success() {
        error!("failed to generate embedding: {}", response.status());
        return Err(anyhow::anyhow!("failed to generate embedding"));
    }

    let embedding = response.json::<OllamaResponse>().await?;
    info!("generated embedding for frame_id: {}", frame_id);
    
    Ok(embedding.embedding)
}
