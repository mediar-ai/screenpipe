use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tokio::time::sleep;
use tracing::{error, info};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddedLLMSettings {
    pub enabled: bool,
    pub model: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OllamaStatus {
    Idle,
    Running,
    Error,
}

pub struct LLMSidecar {
    settings: EmbeddedLLMSettings,
    status: OllamaStatus,
}

impl LLMSidecar {
    pub fn new(settings: EmbeddedLLMSettings) -> Self {
        Self {
            settings,
            status: OllamaStatus::Idle,
        }
    }

    pub async fn start(&mut self, app: tauri::AppHandle) -> Result<String> {
        self.status = OllamaStatus::Running;
        app.emit("ollama_status", &self.status)?;

        info!("Starting Ollama serve command...");
        let serve_command = app.shell().sidecar("ollama").unwrap();
        let serve_command = serve_command.args(&["serve"]).env(
            "OLLAMA_HOST",
            &format!("http://localhost:{}", self.settings.port),
        );
        let (_, _child) = serve_command
            .spawn()
            .map_err(|e| {
                error!("Failed to spawn sidecar: {}", e);
                e.to_string()
            })
            .unwrap();

        info!("Waiting for Ollama server to start...");
        self.wait_for_server().await?;

        // now ollama run the model

        let model_command = app.shell().sidecar("ollama").unwrap();
        let model_command = model_command.args(&["run", &self.settings.model]);
        let (_, _child) = model_command
            .spawn()
            .map_err(|e| {
                error!("Failed to spawn sidecar: {}", e);
                e.to_string()
            })
            .unwrap();

        info!("Testing Ollama model...");
        let test_result = self.test_model().await?;

        Ok(test_result)
    }

    async fn wait_for_server(&self) -> Result<()> {
        let max_retries = 30;
        let retry_interval = Duration::from_secs(1);

        for _ in 0..max_retries {
            if let Ok(response) = reqwest::get(&format!(
                "http://localhost:{}/api/version",
                self.settings.port
            ))
            .await
            {
                if response.status().is_success() {
                    info!("Ollama server started successfully");
                    return Ok(());
                }
            }
            sleep(retry_interval).await;
        }

        Err(anyhow!(
            "Ollama server failed to start after maximum retries"
        ))
    }

    async fn test_model(&self) -> Result<String> {
        const MAX_RETRIES: u32 = 3;
        const RETRY_DELAY: Duration = Duration::from_secs(2);

        for attempt in 1..=MAX_RETRIES {
            match self.attempt_model_test().await {
                Ok(result) => {
                    info!("model test successful on attempt {}: {}", attempt, result);
                    return Ok(result);
                }
                Err(e) => {
                    if attempt == MAX_RETRIES {
                        return Err(anyhow!(
                            "failed to test model after {} attempts: {}",
                            MAX_RETRIES,
                            e
                        ));
                    }
                    error!("model test failed on attempt {}: {}", attempt, e);
                    sleep(RETRY_DELAY).await;
                }
            }
        }

        unreachable!()
    }

    async fn attempt_model_test(&self) -> Result<String> {
        let client = reqwest::Client::new();
        let response = client
            .post(&format!(
                "http://localhost:{}/v1/chat/completions",
                self.settings.port
            ))
            .json(&serde_json::json!({
                "model": self.settings.model,
                "messages": [
                    {
                        "role": "user",
                        "content": "say a one sentence joke about screen recording, all lower case"
                    }
                ],
                "max_tokens": 50,
                "stream": false
            }))
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!("failed to get response from model"));
        }

        let data: serde_json::Value = response.json().await?;
        let result = data["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| anyhow!("unexpected response format"))?
            .trim()
            .to_string();

        Ok(result)
    }

    pub async fn stop(&mut self, app: tauri::AppHandle) -> Result<()> {
        self.status = OllamaStatus::Idle;
        app.emit("ollama_status", &self.status)?;

        #[cfg(target_os = "windows")]
        {
            app.shell()
                .command("taskkill")
                .args(&["/F", "/IM", "ollama.exe"])
                .spawn()
                .unwrap();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let output = app
                .shell()
                .command("pkill")
                .arg("ollama")
                .output()
                .await
                .unwrap();
            info!("Ollama stopped: {:?}", output);
        }

        Ok(())
    }
}

#[tauri::command]
pub async fn start_ollama_sidecar(
    app: tauri::AppHandle,
    settings: EmbeddedLLMSettings,
) -> Result<String, String> {
    let mut llm_sidecar = LLMSidecar::new(settings);
    llm_sidecar
        .start(app)
        .await
        .map_err(|e| format!("Failed to start Ollama: {}", e))
}

#[tauri::command]
pub async fn stop_ollama_sidecar(app: tauri::AppHandle) -> Result<(), String> {
    let mut llm_sidecar = LLMSidecar::new(EmbeddedLLMSettings {
        enabled: false,
        model: String::new(),
        port: 0,
    });
    llm_sidecar
        .stop(app)
        .await
        .map_err(|e| format!("Failed to stop Ollama: {}", e))
}
