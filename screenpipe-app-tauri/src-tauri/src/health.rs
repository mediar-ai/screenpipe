use anyhow::Result;
use serde::{Deserialize, Serialize};
use tauri::{path::BaseDirectory, Manager};
use tokio::time::{interval, Duration};
use tokio::sync::broadcast;

#[derive(Debug, Deserialize, Serialize, Clone)]
#[allow(dead_code)]
pub struct HealthCheckResponse {
    status: String,
    status_code: u16,
    #[serde(rename = "last_frame_timestamp")]
    last_frame_timestamp: Option<String>,
    #[serde(rename = "last_audio_timestamp")]
    last_audio_timestamp: Option<String>,
    #[serde(rename = "last_ui_timestamp")]
    last_ui_timestamp: Option<String>,
    frame_status: String,
    audio_status: String,
    ui_status: String,
    message: String,
    #[serde(rename = "verbose_instructions")]
    verbose_instructions: Option<String>,
}

pub async fn set_health_icon_in_tray(
    app: tauri::AppHandle, 
    tx: broadcast::Sender<HealthCheckResponse>
) -> Result<()> {
    let mut interval = interval(Duration::from_secs(2));
    let client = reqwest::Client::new();
    let mut last_status = String::new();

    tokio::spawn(async move {
        loop {
            interval.tick().await;

            match check_health(&client).await {
                Ok(health) => {
                    let current_status = 
                        if health.status == "unhealthy" || health.status == "error" { "unhealthy" } else { "healthy" };

                    if current_status != last_status {
                        last_status = current_status.to_string();
                        if let Some(main_tray) = app.tray_by_id("screenpipe_main") {
                            let icon_path = if current_status == "unhealthy" {
                                app.path()
                                    .resolve(
                                        "assets/screenpipe-logo-tray-failed.png",
                                        BaseDirectory::Resource,
                                    )
                                    .expect("failed to resolve icon path")
                            } else {
                                app.path()
                                    .resolve(
                                        "assets/screenpipe-logo-tray-black.png",
                                        BaseDirectory::Resource,
                                    )
                                    .expect("failed to resolve icon path")
                            };
                            let _ = main_tray
                                .set_icon(Some(tauri::image::Image::from_path(&icon_path).unwrap()))
                                .and_then(|_| main_tray.set_icon_as_template(true));
                        }
                    }
                    let _ = tx.send(health.clone());
                }
                Err(e) => {
                    if last_status != "error" {
                        println!("health check failed: {}", e);
                        last_status = "error".to_string();
                        if let Some(main_tray) = app.tray_by_id("screenpipe_main") {
                            let icon_path = app
                                .path()
                                .resolve(
                                    "assets/screenpipe-logo-tray-failed.png",
                                    BaseDirectory::Resource,
                                )
                                .expect("failed to resolve icon path");
                            let _ = main_tray
                                .set_icon(Some(tauri::image::Image::from_path(&icon_path).unwrap()))
                                .and_then(|_| main_tray.set_icon_as_template(true));
                        }
                    }
                    let error_health = HealthCheckResponse {
                        status: "error".to_string(),
                        last_frame_timestamp: None,
                        last_audio_timestamp: None,
                        last_ui_timestamp: None,
                        frame_status: "error".to_string(),
                        audio_status: "error".to_string(),
                        ui_status: "error".to_string(),
                        message: format!("health check failed: {}", e),
                        status_code: 500,
                        verbose_instructions: None,
                    };
                    let _ = tx.send(error_health);
                }
            }
        }
    });

    Ok(())
}

pub async fn check_health(client: &reqwest::Client) -> Result<HealthCheckResponse> {
    let response = client
        .get("http://localhost:3030/health")
        .header("Cache-Control", "no-cache")
        .header("Pragma", "no-cache")
        .timeout(Duration::from_secs(5)) // on windows it never times out
        .send()
        .await?;

    if !response.status().is_success() {
        anyhow::bail!("health check failed with status: {}", response.status());
    }

    let status_code = response.status().as_u16();
    let mut health = response.json::<HealthCheckResponse>().await?;
    health.status_code = status_code;

    Ok(health)
}

