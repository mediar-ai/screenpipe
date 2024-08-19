use log::{error, info};
use reqwest::Client;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use sysinfo::{System, SystemExt};
use tokio::sync::Mutex;
use tokio::time::interval;
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
            enabled: Arc::new(Mutex::new(!cfg!(debug_assertions))),
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
        let system = System::new_all();

        let mut payload = json!({
            "api_key": self.posthog_api_key,
            "event": event,
            "properties": {
                "distinct_id": self.distinct_id,
                "$lib": "rust-reqwest",
                "os_name": system.name().unwrap_or_default(),
                "os_version": system.os_version().unwrap_or_default(),
                "kernel_version": system.kernel_version().unwrap_or_default(),
                "host_name": system.host_name().unwrap_or_default(),
                "cpu_count": system.cpus().len(),
                "total_memory": system.total_memory(),
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

pub fn start_analytics(
    unique_id: String,
    posthog_api_key: String,
    interval_hours: u64,
) -> Result<Arc<AnalyticsManager>, Box<dyn std::error::Error>> {
    if cfg!(debug_assertions) {
        info!("Skipping analytics in development mode");
        return Ok(Arc::new(AnalyticsManager::new(
            posthog_api_key,
            unique_id,
            interval_hours,
        )));
    }

    let analytics_manager = Arc::new(AnalyticsManager::new(
        posthog_api_key,
        unique_id,
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
