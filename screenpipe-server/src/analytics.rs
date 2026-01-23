use once_cell::sync::Lazy;
use reqwest::Client;
use serde_json::{json, Value};
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use tracing::{debug, error, trace};

const POSTHOG_API_KEY: &str = "phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce";
const POSTHOG_HOST: &str = "https://eu.i.posthog.com";

static TELEMETRY_ENABLED: AtomicBool = AtomicBool::new(false);

static ANALYTICS: Lazy<Analytics> = Lazy::new(Analytics::new);

pub struct Analytics {
    client: Client,
    distinct_id: String,
}

impl Analytics {
    fn new() -> Self {
        // Try to get analytics ID from env var (passed from Tauri app)
        // Fall back to random UUID for standalone CLI usage
        let distinct_id = env::var("SCREENPIPE_ANALYTICS_ID")
            .unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());

        debug!("Analytics initialized with distinct_id: {}", distinct_id);

        Self {
            client: Client::new(),
            distinct_id,
        }
    }

    pub fn distinct_id(&self) -> &str {
        &self.distinct_id
    }
}

/// Initialize analytics with telemetry enabled/disabled
pub fn init(telemetry_enabled: bool) {
    TELEMETRY_ENABLED.store(telemetry_enabled, Ordering::SeqCst);
    // Force lazy initialization
    let _ = &*ANALYTICS;
    debug!(
        "Analytics initialized, telemetry_enabled: {}",
        telemetry_enabled
    );
}

/// Get the current distinct_id
pub fn get_distinct_id() -> &'static str {
    ANALYTICS.distinct_id()
}

/// Capture an analytics event
pub async fn capture_event(event: &str, properties: Value) {
    if !TELEMETRY_ENABLED.load(Ordering::SeqCst) {
        return;
    }

    let mut props = properties;
    if let Some(obj) = props.as_object_mut() {
        obj.insert("distinct_id".to_string(), json!(ANALYTICS.distinct_id));
        obj.insert("$lib".to_string(), json!("screenpipe-server"));
        obj.insert("release".to_string(), json!(env!("CARGO_PKG_VERSION")));
    }

    let payload = json!({
        "api_key": POSTHOG_API_KEY,
        "event": event,
        "properties": props,
    });

    trace!(target: "analytics", "Capturing event: {} {:?}", event, payload);

    let client = &ANALYTICS.client;
    if let Err(e) = client
        .post(format!("{}/capture/", POSTHOG_HOST))
        .json(&payload)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        error!("Failed to send analytics event: {}", e);
    }
}

/// Capture event without blocking (fire and forget)
pub fn capture_event_nonblocking(event: &'static str, properties: Value) {
    if !TELEMETRY_ENABLED.load(Ordering::SeqCst) {
        return;
    }

    tokio::spawn(async move {
        capture_event(event, properties).await;
    });
}
