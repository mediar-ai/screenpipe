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
                    name: "SC_API_BASE_URL",
                    required: "optional, defaults to **`https://screenpi.pe`**",
                    description: "Sets the base URL for Screenpipe API requests.",
                },
                EnvVar {
                    name: "SCREENPIPE_CUSTOM_OCR_CONFIG",
                    required: "optional, defaults to built-in config",
                    description: "Overrides the default configuration used by **`CliOcrEngine::Custom`** when set.",
                },
                EnvVar {
                    name: "SCREENPIPE_LOG",
                    required: "optional, defaults to **`info`**",
                    description: "Controls CLI logging verbosity. Accepts a global level (`trace`, `debug`, `info`, `warn`, `error`, `off`) or module-specific rules (e.g., **`screenpipe=debug`**). Modules: `screenpipe`, `tokenizers`, `rusty_tesseract`, `symphonia`, `hf_hub`.",
                },
                EnvVar {
                    name: "SAVE_RESOURCE_USAGE",
                    required: "optional, defaults to **`false`**",
                    description: "When set to **`true`**, resource usage will be logged to a timestamped JSON file in your home directory for performance monitoring.",
                },
                EnvVar {
                    name: "HF_ENDPOINT",
                    required: "optional, defaults to **`https://hf-mirror.com`** if Chinese mirror is enabled",
                    description: "Overrides the Hugging Face API endpoint.",
                },
            ],
        },
        Category {
            name: "Deepgram Settings",
            env_vars: vec![
                EnvVar {
                    name: "DEEPGRAM_API_KEY",
                    required: "required if Deepgram engine is selected",
                    description: "Authenticates requests to the Deepgram API.",
                },
                EnvVar {
                    name: "DEEPGRAM_API_URL",
                    required: "optional, defaults to **`https://api.deepgram.com/v1/listen`**",
                    description: "Overrides the HTTP API endpoint for Deepgram services.",
                },
                EnvVar {
                    name: "DEEPGRAM_WEBSOCKET_URL",
                    required: "optional",
                    description: "Overrides the WebSocket endpoint for Deepgram real-time audio transcription.",
                },
            ],
        },
        Category {
            name: "AI Services Credentials",
            env_vars: vec![
                EnvVar {
                    name: "OPENAI_API_KEY",
                    required: "required if OpenAI engine is selected",
                    description: "Authenticates requests to the OpenAI API.",
                },
                EnvVar {
                    name: "ANTHROPIC_API_KEY",
                    required: "required if Anthropic engine is selected",
                    description: "Authenticates requests to the Anthropic API.",
                },
                EnvVar {
                    name: "GEMINI_API_KEY",
                    required: "required if Gemini engine is selected",
                    description: "Authenticates requests to the Gemini API.",
                },
                EnvVar {
                    name: "CLERK_SECRET_KEY",
                    required: "required if Clerk engine is selected",
                    description: "Authenticates requests to the Clerk API.",
                },
                EnvVar {
                    name: "LANGFUSE_PUBLIC_KEY",
                    required: "required if using Langfuse",
                    description: "Authenticates requests to the Langfuse API.",
                },
                EnvVar {
                    name: "LANGFUSE_SECRET_KEY",
                    required: "optional",
                    description: "Authenticates requests to the Langfuse API.",
                },
            ],
        },
        Category {
            name: "Other Settings",
            env_vars: vec![
                EnvVar {
                    name: "NODE_ENV",
                    required: "optional, defaults to **`development`**",
                    description: "Specifies the runtime environment for the CLI: **`development`** or **`production`**.",
                },
            ],
        },
    ]
}
