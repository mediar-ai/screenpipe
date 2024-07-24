use log::{error, info};
use reqwest::Client;
use serde_json::json;
use std::fs;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::interval;
use uuid::Uuid;
pub struct AnalyticsManager {
    client: Client,
    posthog_api_key: String,
    distinct_id: String,
    interval: Duration,
    enabled: Arc<Mutex<bool>>,
    api_host: String,
}

impl AnalyticsManager {
    pub fn new(posthog_api_key: String, distinct_id: String, interval_hours: u64) -> Self {
        Self {
            client: Client::new(),
            posthog_api_key,
            distinct_id,
            interval: Duration::from_secs(interval_hours * 3600),
            enabled: Arc::new(Mutex::new(true)),
            api_host: "https://eu.i.posthog.com".to_string(),
        }
    }

    pub async fn send_event(
        &self,
        event: &str,
        properties: Option<serde_json::Value>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if !*self.enabled.lock().await {
            return Ok(());
        }

        let posthog_url = format!("{}/capture/", self.api_host);

        let mut payload = json!({
            "api_key": self.posthog_api_key,
            "event": event,
            "properties": {
                "distinct_id": self.distinct_id,
                "$lib": "rust-reqwest",
                "timestamp": chrono::Utc::now().to_rfc3339(),
            },
        });

        if let Some(props) = properties {
            if let Some(payload_props) = payload["properties"].as_object_mut() {
                payload_props.extend(props.as_object().unwrap_or(&serde_json::Map::new()).clone());
            }
        }

        let response = self.client.post(posthog_url).json(&payload).send().await?;

        if !response.status().is_success() {
            return Err(format!("PostHog API error: {}", response.status()).into());
        }

        Ok(())
    }

    pub async fn start_periodic_event(&self) {
        let mut interval = interval(self.interval);

        loop {
            interval.tick().await;
            if *self.enabled.lock().await {
                if let Err(e) = self.send_event("app_still_running", None).await {
                    error!("Failed to send periodic PostHog event: {}", e);
                }
            }
        }
    }
}

pub fn get_or_create_unique_id(app_name: &str) -> Result<String, Box<dyn std::error::Error>> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let app_dir = home_dir.join(format!(".{}", app_name));
    let id_file = app_dir.join("unique_id");

    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)?;
    }

    if id_file.exists() {
        Ok(fs::read_to_string(id_file)?)
    } else {
        let new_id = Uuid::new_v4().to_string();
        fs::write(id_file, &new_id)?;
        Ok(new_id)
    }
}

pub fn start_analytics(
    posthog_api_key: String,
    app_name: &str,
    interval_hours: u64,
) -> Result<Arc<AnalyticsManager>, Box<dyn std::error::Error>> {
    let distinct_id = get_or_create_unique_id(app_name)?;
    let analytics_manager = Arc::new(AnalyticsManager::new(
        posthog_api_key,
        distinct_id,
        interval_hours,
    ));

    // Send initial event at boot
    tokio::spawn({
        let analytics_manager = analytics_manager.clone();
        async move {
            if let Err(e) = analytics_manager.send_event("app_started", None).await {
                error!("Failed to send initial PostHog event: {}", e);
            }
            info!("Analytics started");
        }
    });

    // Start periodic events
    tokio::spawn({
        let analytics_manager = analytics_manager.clone();
        async move {
            analytics_manager.start_periodic_event().await;
        }
    });

    Ok(analytics_manager)
}
