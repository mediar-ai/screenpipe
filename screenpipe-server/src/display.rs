use colored::Colorize;

const BANNER: &str = r"
                                            _
   __________________  ___  ____     ____  (_____  ___
  / ___/ ___/ ___/ _ \/ _ \/ __ \   / __ \/ / __ \/ _ \
 (__  / /__/ /  /  __/  __/ / / /  / /_/ / / /_/ /  __/
/____/\___/_/   \___/\___/_/ /_/  / .___/_/ .___/\___/
                                 /_/     /_/
";

const WIDTH: usize = 34;
const MAX_ITEMS: usize = 5;

pub struct DisplayConfig {
    pub fps: f64,
    pub audio_chunk_duration: u64,
    pub video_chunk_duration: u64,
    pub port: u16,
    pub realtime_audio: bool,
    pub audio_disabled: bool,
    pub vision_disabled: bool,
    pub audio_engine: String,
    pub ocr_engine: String,
    pub vad_engine: String,
    pub vad_sensitivity: String,
    pub data_dir: String,
    pub debug: bool,
    pub telemetry: bool,
    pub local_llm: bool,
    pub pii_removal: bool,
    pub ignored_windows: Vec<String>,
    pub included_windows: Vec<String>,
    pub frame_cache: bool,
    pub unfocused_windows: bool,
    pub auto_destruct_pid: Option<u32>,
    pub deepgram_key_set: bool,
    pub languages: Vec<String>,
    pub monitor_ids: Vec<u32>,
    pub audio_devices: Vec<String>,
    pub realtime_audio_devices: Vec<String>,
    pub pipes: Vec<(String, bool)>,
    pub use_cloud: bool,
}

pub fn print_startup(cfg: DisplayConfig) {
    println!("\n\n{}", BANNER.truecolor(147, 112, 219).bold());
    println!("\n{}", "build ai apps that have the full context".bright_yellow().italic());
    println!("{}\n\n", "open source | runs locally | developer friendly".bright_green());

    println!("┌────────────────────────┬────────────────────────────────────┐");
    println!("│ setting                │ value                              │");
    println!("├────────────────────────┼────────────────────────────────────┤");

    row("fps", &cfg.fps.to_string());
    row("audio chunk duration", &format!("{} seconds", cfg.audio_chunk_duration));
    row("video chunk duration", &format!("{} seconds", cfg.video_chunk_duration));
    row("port", &cfg.port.to_string());
    row("realtime audio enabled", &cfg.realtime_audio.to_string());
    row("audio disabled", &cfg.audio_disabled.to_string());
    row("vision disabled", &cfg.vision_disabled.to_string());
    row("audio engine", &cfg.audio_engine);
    row("ocr engine", &cfg.ocr_engine);
    row("vad engine", &cfg.vad_engine);
    row("vad sensitivity", &cfg.vad_sensitivity);
    row("data directory", &cfg.data_dir);
    row("debug mode", &cfg.debug.to_string());
    row("telemetry", &cfg.telemetry.to_string());
    row("local llm", &cfg.local_llm.to_string());
    row("use pii removal", &cfg.pii_removal.to_string());
    row("ignored windows", &format!("{:?}", cfg.ignored_windows));
    row("included windows", &format!("{:?}", cfg.included_windows));
    row("frame cache", &cfg.frame_cache.to_string());
    row("capture unfocused wins", &cfg.unfocused_windows.to_string());
    row("auto-destruct pid", &cfg.auto_destruct_pid.unwrap_or(0).to_string());
    row("deepgram key", if cfg.deepgram_key_set { "set (masked)" } else { "not set" });

    section("languages", if cfg.languages.is_empty() {
        vec!["all languages".to_string()]
    } else {
        cfg.languages.iter().map(|l| format!("id: {}", l)).collect()
    });

    section("monitors", if cfg.vision_disabled {
        vec!["vision disabled".to_string()]
    } else if cfg.monitor_ids.is_empty() {
        vec!["no monitors available".to_string()]
    } else {
        cfg.monitor_ids.iter().map(|m| format!("id: {}", m)).collect()
    });

    section("audio devices", if cfg.audio_disabled {
        vec!["disabled".to_string()]
    } else if cfg.audio_devices.is_empty() {
        vec!["no devices available".to_string()]
    } else {
        cfg.audio_devices
    });

    section("realtime audio devices", if cfg.audio_disabled || !cfg.realtime_audio {
        vec!["disabled".to_string()]
    } else if cfg.realtime_audio_devices.is_empty() {
        vec!["no devices available".to_string()]
    } else {
        cfg.realtime_audio_devices
    });

    section("pipes", if cfg.pipes.is_empty() {
        vec!["no pipes available".to_string()]
    } else {
        cfg.pipes.iter().map(|(id, enabled)| format!("({}) {}", if *enabled { "enabled" } else { "disabled" }, id)).collect()
    });

    println!("└────────────────────────┴────────────────────────────────────┘");

    if cfg.use_cloud {
        println!("{}", "warning: you are using cloud now. make sure to understand the data privacy risks.".bright_yellow());
    } else {
        println!("{}", "you are using local processing. all your data stays on your computer.\n".bright_green());
    }

    if cfg.telemetry {
        println!("{}", "warning: telemetry is enabled. only error-level data will be sent.\nto disable, use the --disable-telemetry flag.".bright_yellow());
    } else {
        println!("{}", "telemetry is disabled. no data will be sent to external services.".bright_green());
    }

    println!("\n{}", "check latest changes here: https://github.com/mediar-ai/screenpipe/releases".bright_blue().italic());
}

fn row(label: &str, value: &str) {
    println!("│ {:<22} │ {:<34} │", label, truncate(value, WIDTH));
}

fn section(title: &str, items: Vec<String>) {
    println!("├────────────────────────┼────────────────────────────────────┤");
    println!("│ {:<22} │ {:<34} │", title, "");
    for item in items.iter().take(MAX_ITEMS) {
        println!("│ {:<22} │ {:<34} │", "", truncate(item, WIDTH));
    }
    if items.len() > MAX_ITEMS {
        println!("│ {:<22} │ {:<34} │", "", format!("... and {} more", items.len() - MAX_ITEMS));
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() > max {
        let mut pos = 0;
        for (i, c) in s.char_indices() {
            if i + c.len_utf8() > max - 3 { break; }
            pos = i + c.len_utf8();
        }
        format!("{}...", &s[..pos])
    } else {
        format!("{:<width$}", s, width = max)
    }
}
