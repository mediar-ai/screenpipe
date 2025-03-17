use anyhow::Result;
use serde::Deserialize;
use dark_light::Mode;
use tauri::{path::BaseDirectory, Manager};
use tokio::time::{interval, Duration};

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct HealthCheckResponse {
    status: String,
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

pub async fn start_health_check(app: tauri::AppHandle) -> Result<()> {
    let mut interval = interval(Duration::from_secs(1));
    let client = reqwest::Client::new();
    let mut last_status = String::new();
    let mut last_theme = dark_light::detect().unwrap_or(Mode::Dark); // Track the last known theme

    tokio::spawn(async move {
        loop {
            interval.tick().await;

            let theme = dark_light::detect().unwrap_or(Mode::Dark); // Get current theme
            let health_result = check_health(&client).await;
            let current_status = match health_result {
                Ok(health) if health.status == "unhealthy" || health.status == "error" => "unhealthy",
                Ok(_) => "healthy",
                Err(_) => "error",
            };

            // Update icon if either health status OR theme changes
            if current_status != last_status || theme != last_theme {
                last_status = current_status.to_string();
                last_theme = theme;

                if let Some(main_tray) = app.tray_by_id("screenpipe_main") {
                    let icon_path = if current_status == "unhealthy" {
                        if theme == Mode::Light {
                            "assets/screenpipe-logo-tray-black-failed.png"
                        } else {
                            "assets/screenpipe-logo-tray-white-failed.png"
                        }
                    } else {
                        if theme == Mode::Light {
                            "assets/screenpipe-logo-tray-black.png"
                        } else {
                            "assets/screenpipe-logo-tray-white.png"
                        }
                    };

                    let icon_path = app.path()
                        .resolve(icon_path, BaseDirectory::Resource)
                        .expect("failed to resolve icon path");

                    let _ = main_tray
                        .set_icon(Some(tauri::image::Image::from_path(&icon_path).unwrap()))
                        .and_then(|_| main_tray.set_icon_as_template(true));
                }
            }
        }
    });

    Ok(())
}


async fn check_health(client: &reqwest::Client) -> Result<HealthCheckResponse> {
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

    let health = response.json::<HealthCheckResponse>().await?;
    Ok(health)
}
