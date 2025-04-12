pub const SCREENPIPE_CUSTOM_OCR_CONFIG: &str = "SCREENPIPE_CUSTOM_OCR_CONFIG";
pub const SCREENPIPE_LOG: &str = "SCREENPIPE_LOG";
pub const SAVE_RESOURCE_USAGE: &str = "SAVE_RESOURCE_USAGE";
pub const DEEPGRAM_API_KEY: &str = "DEEPGRAM_API_KEY";
pub const CUSTOM_DEEPGRAM_API_KEY: &str = "CUSTOM_DEEPGRAM_API_KEY";
pub const CUSTOM_DEEPGRAM_API_TOKEN: &str = "CUSTOM_DEEPGRAM_API_TOKEN";
pub const DEEPGRAM_API_URL: &str = "DEEPGRAM_API_URL";
pub const DEEPGRAM_WEBSOCKET_URL: &str = "DEEPGRAM_WEBSOCKET_URL";
pub const TAURI_ENV_DEBUG: &str = "TAURI_ENV_DEBUG";
pub const UNSTRUCTURED_API_KEY: &str = "UNSTRUCTURED_API_KEY";

#[derive(Debug)]
pub struct EnvVar<'a> {
    pub name: &'a str,
    pub required: &'a str,
    pub description: &'a str,
}

#[derive(Debug)]
pub struct Category<'a> {
    pub name: &'a str,
    pub env_vars: Vec<EnvVar<'a>>,
}

pub fn get_env_vars() -> Vec<Category<'static>> {
    vec![
        Category {
            name: "Screenpipe Settings",
            env_vars: vec![
                EnvVar {
                    name: SCREENPIPE_CUSTOM_OCR_CONFIG,
                    required: "optional, defaults to built-in config",
                    description: "Overrides the default configuration used by **`CliOcrEngine::Custom`** when set.",
                },
                EnvVar {
                    name: SCREENPIPE_LOG,
                    required: "optional, defaults to **`info`**",
                    description: "Controls CLI logging verbosity. Accepts a global level (`trace`, `debug`, `info`, `warn`, `error`, `off`) or module-specific rules (e.g., **`screenpipe=debug`**). Modules: `screenpipe`, `tokenizers`, `rusty_tesseract`, `symphonia`, `hf_hub`.",
                },
                EnvVar {
                    name: SAVE_RESOURCE_USAGE,
                    required: "optional, defaults to **`false`**",
                    description: "When set to **`true`**, resource usage will be logged to a timestamped JSON file in your home directory for performance monitoring.",
                },
            ],
        },
        Category {
            name: "Deepgram & Other Engines Settings",
            env_vars: vec![
                EnvVar {
                    name: DEEPGRAM_API_KEY,
                    required: "required if Deepgram engine is selected",
                    description: "Authenticates requests to the Deepgram API.",
                },
                EnvVar {
                    name: CUSTOM_DEEPGRAM_API_TOKEN,
                    required: "required if Deepgram engine is selected for real-time audio transcription",
                    description: "Authenticates requests to the Deepgram API for real-time audio transcription."
                },
                EnvVar {
                    name: DEEPGRAM_API_URL,
                    required: "optional, defaults to **`https://api.deepgram.com/v1/listen`**",
                    description: "Overrides the HTTP API endpoint for Deepgram services.",
                },
                EnvVar {
                    name: DEEPGRAM_WEBSOCKET_URL,
                    required: "optional",
                    description: "Overrides the WebSocket endpoint for Deepgram real-time audio transcription.",
                },
                EnvVar {
                    name: UNSTRUCTURED_API_KEY,
                    required: "required if Unstructured engine is selected",
                    description: "Authenticates requests to the Unstructured API.",
                },
            ],
        },
        Category {
            name: "Other Settings",
            env_vars: vec![
                EnvVar {
                    name: TAURI_ENV_DEBUG,
                    required: "optional, defaults to **`false`**",
                    description: "Enables debug mode for Tauri, which may affect performance and logging.",
                }
            ],
        },
    ]
}
