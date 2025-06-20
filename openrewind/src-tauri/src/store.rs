use super::get_base_dir;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;
use tauri::AppHandle;
use tauri_plugin_store::StoreBuilder;
use tracing::error;

pub fn get_store(
    app: &AppHandle,
    _profile_name: Option<String>, // Keep parameter for API compatibility but ignore it
) -> anyhow::Result<Arc<tauri_plugin_store::Store<tauri::Wry>>> {
    let base_dir = get_base_dir(app, None)?;
    let store_path = base_dir.join("store.bin");

    // Build and return the store wrapped in Arc
    StoreBuilder::new(app, store_path)
        .build()
        .map_err(|e| anyhow::anyhow!(e))
}

#[derive(Serialize, Deserialize, Type, Clone)]
pub struct OnboardingStore {
    #[serde(rename = "isCompleted")]
    pub is_completed: bool,
    #[serde(rename = "completedAt")]
    pub completed_at: Option<String>,
}

impl Default for OnboardingStore {
    fn default() -> Self {
        Self {
            is_completed: false,
            completed_at: None,
        }
    }
}

impl OnboardingStore {
    pub fn get(app: &AppHandle) -> Result<Option<Self>, String> {
        let store = get_store(app, None).map_err(|e| e.to_string())?;

        match store.is_empty() {
            true => Ok(None),
            false => {
                let onboarding = serde_json::from_value(store.get("onboarding").unwrap_or(Value::Null));
                match onboarding {
                    Ok(onboarding) => Ok(onboarding),
                    Err(e) => {
                        error!("Failed to deserialize onboarding: {}", e);
                        Err(e.to_string())
                    }
                }
            }
        }
    }

    pub fn update(app: &AppHandle, update: impl FnOnce(&mut OnboardingStore)) -> Result<(), String> {
        let Ok(store) = get_store(app, None) else {
            return Err("Failed to get onboarding store".to_string());
        };

        let mut onboarding = Self::get(app)?.unwrap_or_default();
        update(&mut onboarding);
        store.set("onboarding", json!(onboarding));
        store.save().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn save(&self, app: &AppHandle) -> Result<(), String> {
        let Ok(store) = get_store(app, None) else {
            return Err("Failed to get onboarding store".to_string());
        };

        store.set("onboarding", json!(self));
        store.save().map_err(|e| e.to_string())
    }

    pub fn complete(&mut self) {
        self.is_completed = true;
        self.completed_at = Some(chrono::Utc::now().to_rfc3339());
    }

    pub fn reset(&mut self) {
        self.is_completed = false;
        self.completed_at = None;
    }
}

#[derive(Serialize, Deserialize,Type,Clone)]
#[serde(default)]
pub struct SettingsStore {
    #[serde(rename = "aiPresets")]
    pub ai_presets: Vec<AIPreset>,
  
    #[serde(rename = "deepgramApiKey")]
    pub deepgram_api_key: String,
    #[serde(rename = "isLoading")]
    pub is_loading: bool,
   
    #[serde(rename = "userId")]
    pub user_id: String,
  
    #[serde(rename = "devMode")]
    pub dev_mode: bool,
    #[serde(rename = "audioTranscriptionEngine")]
    pub audio_transcription_engine: String,
    #[serde(rename = "ocrEngine")]
    pub ocr_engine: String,
    #[serde(rename = "monitorIds")]
    pub monitor_ids: Vec<String>,
    #[serde(rename = "audioDevices")]
    pub audio_devices: Vec<String>,
    #[serde(rename = "usePiiRemoval")]
    pub use_pii_removal: bool,
    #[serde(rename = "restartInterval")]
    pub restart_interval: u32,
    #[serde(rename = "port")]
    pub port: u16,
    #[serde(rename = "dataDir")]
    pub data_dir: String,
    #[serde(rename = "disableAudio")]
    pub disable_audio: bool,
    #[serde(rename = "ignoredWindows")]
    pub ignored_windows: Vec<String>,
    #[serde(rename = "includedWindows")]
    pub included_windows: Vec<String>,
 
    #[serde(rename = "fps")]
    pub fps: f32,
    #[serde(rename = "vadSensitivity")]
    pub vad_sensitivity: String,
    #[serde(rename = "analyticsEnabled")]
    pub analytics_enabled: bool,
    #[serde(rename = "audioChunkDuration")]
    pub audio_chunk_duration: u32,
    #[serde(rename = "useChineseMirror")]
    pub use_chinese_mirror: bool,
    #[serde(rename = "languages")]
    pub languages: Vec<String>,
    #[serde(rename = "embeddedLLM")]
    pub embedded_llm: EmbeddedLLM,
    #[serde(rename = "enableBeta")]
    pub enable_beta: bool,
    #[serde(rename = "isFirstTimeUser")]
    pub is_first_time_user: bool,
    #[serde(rename = "autoStartEnabled")]
    pub auto_start_enabled: bool,
    #[serde(rename = "enableFrameCache")]
    pub enable_frame_cache: bool,
    #[serde(rename = "enableUiMonitoring")]
    pub enable_ui_monitoring: bool,
    #[serde(rename = "platform")]
    pub platform: String,
    #[serde(rename = "disabledShortcuts")]
    pub disabled_shortcuts: Vec<String>,
    #[serde(rename = "user")]
    pub user: User,
    #[serde(rename = "showOpenrewindShortcut")]
    pub show_openrewind_shortcut: String,
    #[serde(rename = "startRecordingShortcut")]
    pub start_recording_shortcut: String,
    #[serde(rename = "stopRecordingShortcut")]
    pub stop_recording_shortcut: String,
    #[serde(rename = "startAudioShortcut")]
    pub start_audio_shortcut: String,
    #[serde(rename = "stopAudioShortcut")]
    pub stop_audio_shortcut: String,
    #[serde(rename = "enableRealtimeAudioTranscription")]
    pub enable_realtime_audio_transcription: bool,
    #[serde(rename = "realtimeAudioTranscriptionEngine")]
    pub realtime_audio_transcription_engine: String,
    #[serde(rename = "disableVision")]
    pub disable_vision: bool,
    #[serde(rename = "useAllMonitors")]
    pub use_all_monitors: bool,
    #[serde(rename = "enableRealtimeVision")]
    pub enable_realtime_vision: bool,
}

#[derive(Serialize, Deserialize, Type,Clone,Default)]
pub enum AIProviderType {
    #[default]
    #[serde(rename = "openai")]
    OpenAI,
    #[serde(rename = "native-ollama")]
    NativeOllama,
    #[serde(rename = "custom")]
    Custom,
    #[serde(rename = "screenpipe-cloud")]
    ScreenpipeCloud,
}

#[derive(Serialize, Deserialize,Type,Clone)]
pub struct AIPreset {
    pub id: String,
    pub prompt: String,
    pub provider: AIProviderType,
    pub url: String,
    pub model: String,
    #[serde(rename = "defaultPreset")]
    pub default_preset: bool,
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,
    #[serde(rename = "maxContextChars")]
    pub max_context_chars: u32,
}

#[derive(Serialize, Deserialize,Type,Clone)]
#[serde(default)]
pub struct User {
    pub id: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
    pub image: Option<String>,
    pub token: Option<String>,
    pub clerk_id: Option<String>,
    pub api_key: Option<String>,
    pub credits: Option<Credits>,
    pub stripe_connected: Option<bool>,
    pub stripe_account_status: Option<String>,
    pub github_username: Option<String>,
    pub bio: Option<String>,
    pub website: Option<String>,
    pub contact: Option<String>,
    pub cloud_subscribed: Option<bool>,
}

impl Default for User {
    fn default() -> Self {
        Self {
            id: None,
            name: None,
            email: None,
            image: None,
            token: None,
            clerk_id: None,
            api_key: None,
            credits: None,
            stripe_connected: None,
            stripe_account_status: None,
            github_username: None,
            bio: None,
            website: None,
            contact: None,
            cloud_subscribed: None,
        }
    }
}

#[derive(Serialize, Deserialize,Type,Clone)]
#[serde(default)]
pub struct Credits {
    pub amount: u32,
}

impl Default for Credits {
    fn default() -> Self {
        Self {
            amount: 0,
        }
    }
}

#[derive(Serialize, Deserialize,Type,Clone)]
#[serde(default)]
pub struct EmbeddedLLM {
    pub enabled: bool,
    pub model: String,
    pub port: u16,
}

impl Default for EmbeddedLLM {
    fn default() -> Self {
        Self {
            enabled: false,
            model: "llama3.2:1b-instruct-q4_K_M".to_string(),
            port: 11434,
        }
    }
}

impl Default for SettingsStore {
    fn default() -> Self {
        // Default ignored windows for all OS
        let mut ignored_windows = vec![
            "bit".to_string(),
            "VPN".to_string(),
            "Trash".to_string(),
            "Private".to_string(),
            "Incognito".to_string(),
            "Wallpaper".to_string(),
            "Settings".to_string(),
            "Keepass".to_string(),
            "Recorder".to_string(),
            "Vaults".to_string(),
            "OBS Studio".to_string(),
            "screenpipe".to_string(),
        ];

        // Add platform-specific ignored windows
        // Note: In a real implementation, you'd detect the actual platform
        // For now, we'll include common ones or you can detect platform here
        #[cfg(target_os = "macos")]
        ignored_windows.extend([
            ".env".to_string(),
            "Item-0".to_string(),
            "App Icon Window".to_string(),
            "Battery".to_string(),
            "Shortcuts".to_string(),
            "WiFi".to_string(),
            "BentoBox".to_string(),
            "Clock".to_string(),
            "Dock".to_string(),
            "DeepL".to_string(),
            "Control Center".to_string(),
        ]);

        #[cfg(target_os = "windows")]
        ignored_windows.extend([
            "Nvidia".to_string(),
            "Control Panel".to_string(),
            "System Properties".to_string(),
        ]);

        #[cfg(target_os = "linux")]
        ignored_windows.extend([
            "Info center".to_string(),
            "Discover".to_string(),
            "Parted".to_string(),
        ]);

        Self {
            ai_presets: vec![],
            deepgram_api_key: "".to_string(),
            is_loading: false,
            user_id: "".to_string(),
         
            dev_mode: false,
            audio_transcription_engine: "whisper-large-v3-turbo".to_string(),
            #[cfg(target_os = "macos")]
            ocr_engine: "apple-native".to_string(),
            #[cfg(target_os = "windows")]
            ocr_engine: "windows-native".to_string(),
            #[cfg(target_os = "linux")]
            ocr_engine: "tesseract".to_string(),
            monitor_ids: vec!["default".to_string()],
            audio_devices: vec!["default".to_string()],
            use_pii_removal: false,
            restart_interval: 0,
            port: 3030,
            data_dir: "default".to_string(),
            disable_audio: false,
            ignored_windows,
            included_windows: vec![],
           
            fps: 0.5,
            vad_sensitivity: "high".to_string(),
            analytics_enabled: true,
            audio_chunk_duration: 30,
            use_chinese_mirror: false,
            languages: vec![],
            embedded_llm: EmbeddedLLM::default(),
            enable_beta: false,
            is_first_time_user: true,
            auto_start_enabled: true,
            enable_frame_cache: true,
            enable_ui_monitoring: false,
            platform: "unknown".to_string(),
            disabled_shortcuts: vec![],
            user: User {
                id: None,
                name: None,
                email: None,
                image: None,
                token: None,
                clerk_id: None,
                api_key: None,
                credits: None,
                stripe_connected: None,
                stripe_account_status: None,
                github_username: None,
                bio: None,
                website: None,
                contact: None,
                cloud_subscribed: None,
            },
            show_openrewind_shortcut: "Super+Ctrl+S".to_string(),
            start_recording_shortcut: "Super+Ctrl+U".to_string(),
            stop_recording_shortcut: "Super+Ctrl+X".to_string(),
            start_audio_shortcut: "".to_string(),
            stop_audio_shortcut: "".to_string(),
            enable_realtime_audio_transcription: false,
            realtime_audio_transcription_engine: "deepgram".to_string(),
            disable_vision: false,
            use_all_monitors: false,
            enable_realtime_vision: true,
        }
    }
}

impl SettingsStore {
    pub fn get(app: &AppHandle) -> Result<Option<Self>, String> {
        let store = get_store(app, None).unwrap();

        match store.is_empty() {
            true => Ok(None),
            false => {
                let settings = serde_json::from_value(store.get("settings").unwrap_or(Value::Null));
                match settings {
                    Ok(settings) => Ok(settings),
                    Err(e) => {
                        error!("Failed to deserialize settings: {}", e);
                        Err(e.to_string())
                    }
                }
            }
        }
    }

    pub fn update(app: &AppHandle, update: impl FnOnce(&mut SettingsStore)) -> Result<(), String> {
        let Ok(store) = get_store(app, None) else {
            return Err("Failed to get store".to_string());
        };

        let mut settings = Self::get(app)?.unwrap();
        update(&mut settings);
        store.set("settings", json!(settings));
        Ok(())
    }

    pub fn save(&self,app: &AppHandle) -> Result<(), String> {
        let Ok(store) = get_store(app, None) else {
            return Err("Failed to get store".to_string());
        };

        store.set("settings", json!(self));
        store.save().map_err(|e| e.to_string())
    }
}

pub fn init_store(app: &AppHandle) -> Result<SettingsStore, String> {
    println!("Initializing settings store");

    let store = match SettingsStore::get(app) {
        Ok(Some(store)) => store,
        Ok(None) => SettingsStore::default(),

        Err(e) => {
            error!("Failed to get settings store: {}", e);
            return Err(e);
        }
    };

    store.save(app).unwrap();
    Ok(store)
}

pub fn init_onboarding_store(app: &AppHandle) -> Result<OnboardingStore, String> {
    println!("Initializing onboarding store");

    let onboarding = match OnboardingStore::get(app) {
        Ok(Some(onboarding)) => onboarding,
        Ok(None) => OnboardingStore::default(),

        Err(e) => {
            error!("Failed to get onboarding store: {}", e);
            return Err(e);
        }
    };

    onboarding.save(app).unwrap();
    Ok(onboarding)
}