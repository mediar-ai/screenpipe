use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::env;
use std::process::Stdio;
use std::time::Duration;
use tauri::async_runtime::Receiver;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::process::Command;
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
    serve_process_id: Option<u32>,
    model_process_id: Option<u32>,
}

impl LLMSidecar {
    pub fn new(settings: EmbeddedLLMSettings) -> Self {
        Self {
            settings,
            status: OllamaStatus::Idle,
            serve_process_id: None,
            model_process_id: None,
        }
    }

    pub async fn start(&mut self, app: tauri::AppHandle) -> Result<String> {
        self.status = OllamaStatus::Running;
        app.emit_all("ollama_status", &self.status)?;

        // Get the resource directory path
        let resource_path = app.path().resource_dir().unwrap();

        // Append the resource path to CUDA_PATH
        let cuda_path = env::var("CUDA_PATH").unwrap_or_default();
        let new_cuda_path = format!("{}:{}", cuda_path, resource_path.display());

        info!("Starting Ollama serve command...");
        let mut serve_command = app.shell().sidecar("ollama")?;
        serve_command = serve_command
            .args(&["serve"])
            .env(
                "OLLAMA_HOST",
                &format!("http://localhost:{}", self.settings.port),
            )
            .env("CUDA_PATH", &new_cuda_path);

        #[cfg(target_os = "windows")]
        {
            serve_command = serve_command.env("OLLAMA_ORIGINS", "*");
        }

        let (mut serve_receiver, serve_child) = serve_command.spawn()?;
        self.serve_process_id = Some(serve_child.pid());

        // Stream logs for serve command
        self.stream_logs("ollama-serve", &mut serve_receiver).await?;

        info!("Waiting for Ollama server to start...");
        self.wait_for_server().await?;

        // Now run the model
        info!("Starting Ollama model...");
        let mut model_command = app.shell().sidecar("ollama")?;
        model_command = model_command
            .args(&["run", &self.settings.model])
            .env("CUDA_PATH", &new_cuda_path);

        #[cfg(target_os = "windows")]
        {
            model_command = model_command.env("OLLAMA_ORIGINS", "*");
        }

        let (mut model_receiver, model_child) = model_command.spawn()?;
        self.model_process_id = Some(model_child.pid());

        // Stream logs for model command
        self.stream_logs("ollama-model", &mut model_receiver).await?;

        info!("Testing Ollama model...");
        let test_result = self.test_model().await?;

        Ok(test_result)
    }

    async fn stream_logs(&self, prefix: &str, rx: &mut Receiver<CommandEvent>) -> Result<()> {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    info!("[{}][stdout] {}", prefix, String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    info!("[{}][stderr] {}", prefix, String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(e) => {
                    error!("[{}][error] {}", prefix, e);
                }
                CommandEvent::Terminated(payload) => {
                    info!(
                        "[{}][terminated] code: {:?}, signal: {:?}",
                        prefix, payload.code, payload.signal
                    );
                    break;
                }
                _ => {}
            }
        }
        Ok(())
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
                    info!("Model test successful on attempt {}: {}", attempt, result);
                    return Ok(result);
                }
                Err(e) => {
                    if attempt == MAX_RETRIES {
                        return Err(anyhow!(
                            "Failed to test model after {} attempts: {}",
                            MAX_RETRIES,
                            e
                        ));
                    }
                    error!("Model test failed on attempt {}: {}", attempt, e);
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
            return Err(anyhow!("Failed to get response from model"));
        }

        let data: serde_json::Value = response.json().await?;
        let result = data["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| anyhow!("Unexpected response format"))?
            .trim()
            .to_string();

        Ok(result)
    }

    pub async fn stop(&mut self, app: tauri::AppHandle) -> Result<()> {
        self.status = OllamaStatus::Idle;
        app.emit_all("ollama_status", &self.status)?;

        // Attempt to gracefully terminate the serve process
        if let Some(pid) = self.serve_process_id {
            info!("Terminating ollama-serve process with PID {}", pid);
            #[cfg(target_os = "windows")]
            {
                Command::new("taskkill")
                    .args(&["/PID", &pid.to_string(), "/T", "/F"])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .expect("Failed to execute taskkill");
            }
            #[cfg(not(target_os = "windows"))]
            {
                Command::new("kill")
                    .arg(pid.to_string())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .expect("Failed to execute kill command");
            }
        }

        // Attempt to gracefully terminate the model process
        if let Some(pid) = self.model_process_id {
            info!("Terminating ollama-model process with PID {}", pid);
            #[cfg(target_os = "windows")]
            {
                Command::new("taskkill")
                    .args(&["/PID", &pid.to_string(), "/T", "/F"])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .expect("Failed to execute taskkill");
            }
            #[cfg(not(target_os = "windows"))]
            {
                Command::new("kill")
                    .arg(pid.to_string())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .expect("Failed to execute kill command");
            }
        }

        // Verify that no 'ollama' processes are running
        self.verify_ollama_termination().await?;

        Ok(())
    }

    async fn verify_ollama_termination(&self) -> Result<()> {
        use sysinfo::{ProcessExt, SystemExt};

        let mut system = sysinfo::System::new_all();
        system.refresh_processes();

        let processes = system
            .processes_by_name("ollama")
            .collect::<Vec<_>>();

        if processes.is_empty() {
            info!("All ollama processes have been terminated.");
            Ok(())
        } else {
            Err(anyhow!(
                "Some ollama processes are still running: {:?}",
                processes.iter().map(|p| p.pid()).collect::<Vec<_>>()
            ))
        }
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
