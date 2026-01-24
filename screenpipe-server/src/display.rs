use crate::cli::{CliAudioTranscriptionEngine, CliOcrEngine, CliVadEngine, CliVadSensitivity};
use crate::pipe_manager::PipeInfo;
use colored::Colorize;
use std::path::PathBuf;

const DISPLAY_BANNER: &str = r"
                                            _
   __________________  ___  ____     ____  (_____  ___
  / ___/ ___/ ___/ _ \/ _ \/ __ \   / __ \/ / __ \/ _ \
 (__  / /__/ /  /  __/  __/ / / /  / /_/ / / /_/ /  __/
/____/\___/_/   \___/\___/_/ /_/  / .___/_/ .___/\___/
                                 /_/     /_/

";

const VALUE_WIDTH: usize = 34;
const MAX_ITEMS_TO_DISPLAY: usize = 5;

/// Configuration for startup display
pub struct StartupDisplayConfig<'a> {
    pub fps: f64,
    pub audio_chunk_duration: u64,
    pub video_chunk_duration: u64,
    pub port: u16,
    pub enable_realtime_audio_transcription: bool,
    pub disable_audio: bool,
    pub disable_vision: bool,
    pub audio_transcription_engine: &'a CliAudioTranscriptionEngine,
    pub ocr_engine: &'a CliOcrEngine,
    pub vad_engine: &'a CliVadEngine,
    pub vad_sensitivity: &'a CliVadSensitivity,
    pub data_dir: &'a PathBuf,
    pub debug: bool,
    pub disable_telemetry: bool,
    pub enable_llm: bool,
    pub use_pii_removal: bool,
    pub ignored_windows: &'a [String],
    pub included_windows: &'a [String],
    pub enable_frame_cache: bool,
    pub capture_unfocused_windows: bool,
    pub auto_destruct_pid: Option<u32>,
    pub deepgram_api_key: &'a Option<String>,
    pub languages: &'a [screenpipe_core::Language],
    pub monitor_ids: &'a [u32],
    pub audio_devices: &'a [String],
    pub realtime_audio_devices: &'a [String],
    pub pipes: &'a [PipeInfo],
}

/// Handles startup display output
pub struct StartupDisplay<'a> {
    config: StartupDisplayConfig<'a>,
}

impl<'a> StartupDisplay<'a> {
    pub fn new(config: StartupDisplayConfig<'a>) -> Self {
        Self { config }
    }

    /// Print the complete startup display
    pub fn print(&self) {
        self.print_banner();
        self.print_settings_table();
        self.print_languages_section();
        self.print_monitors_section();
        self.print_audio_devices_section();
        self.print_realtime_audio_section();
        self.print_pipes_section();
        self.print_table_footer();
        self.print_warnings();
        self.print_changelog_link();
    }

    fn print_banner(&self) {
        println!("\n\n{}", DISPLAY_BANNER.truecolor(147, 112, 219).bold());
        println!(
            "\n{}",
            "build ai apps that have the full context"
                .bright_yellow()
                .italic()
        );
        println!(
            "{}\n\n",
            "open source | runs locally | developer friendly".bright_green()
        );
    }

    fn print_settings_table(&self) {
        println!("┌────────────────────────┬────────────────────────────────────┐");
        println!("│ setting                │ value                              │");
        println!("├────────────────────────┼────────────────────────────────────┤");
        self.print_row("fps", &self.config.fps.to_string());
        self.print_row(
            "audio chunk duration",
            &format!("{} seconds", self.config.audio_chunk_duration),
        );
        self.print_row(
            "video chunk duration",
            &format!("{} seconds", self.config.video_chunk_duration),
        );
        self.print_row("port", &self.config.port.to_string());
        self.print_row(
            "realtime audio enabled",
            &self.config.enable_realtime_audio_transcription.to_string(),
        );
        self.print_row("audio disabled", &self.config.disable_audio.to_string());
        self.print_row("vision disabled", &self.config.disable_vision.to_string());
        self.print_row(
            "audio engine",
            &format!("{:?}", self.config.audio_transcription_engine),
        );
        self.print_row("ocr engine", &format!("{:?}", self.config.ocr_engine));
        self.print_row("vad engine", &format!("{:?}", self.config.vad_engine));
        self.print_row(
            "vad sensitivity",
            &format!("{:?}", self.config.vad_sensitivity),
        );
        self.print_row("data directory", &self.config.data_dir.display().to_string());
        self.print_row("debug mode", &self.config.debug.to_string());
        self.print_row("telemetry", &(!self.config.disable_telemetry).to_string());
        self.print_row("local llm", &self.config.enable_llm.to_string());
        self.print_row("use pii removal", &self.config.use_pii_removal.to_string());
        self.print_row(
            "ignored windows",
            &format!("{:?}", self.config.ignored_windows),
        );
        self.print_row(
            "included windows",
            &format!("{:?}", self.config.included_windows),
        );
        self.print_row("frame cache", &self.config.enable_frame_cache.to_string());
        self.print_row(
            "capture unfocused wins",
            &self.config.capture_unfocused_windows.to_string(),
        );
        self.print_row(
            "auto-destruct pid",
            &self.config.auto_destruct_pid.unwrap_or(0).to_string(),
        );
        self.print_row(
            "deepgram key",
            if self.config.deepgram_api_key.is_some() {
                "set (masked)"
            } else {
                "not set"
            },
        );
    }

    fn print_row(&self, label: &str, value: &str) {
        let formatted_value = format_cell(value, VALUE_WIDTH);
        println!("│ {:<22} │ {:<34} │", label, formatted_value);
    }

    fn print_section_header(&self, title: &str) {
        println!("├────────────────────────┼────────────────────────────────────┤");
        println!("│ {:<22} │ {:<34} │", title, "");
    }

    fn print_section_item(&self, value: &str) {
        let formatted = format_cell(value, VALUE_WIDTH);
        println!("│ {:<22} │ {:<34} │", "", formatted);
    }

    fn print_languages_section(&self) {
        self.print_section_header("languages");

        if self.config.languages.is_empty() {
            self.print_section_item("all languages");
        } else {
            self.print_items_list(
                self.config.languages.iter().map(|l| format!("id: {}", l)),
            );
        }
    }

    fn print_monitors_section(&self) {
        self.print_section_header("monitors");

        if self.config.disable_vision {
            self.print_section_item("vision disabled");
        } else if self.config.monitor_ids.is_empty() {
            self.print_section_item("no monitors available");
        } else {
            self.print_items_list(
                self.config.monitor_ids.iter().map(|m| format!("id: {}", m)),
            );
        }
    }

    fn print_audio_devices_section(&self) {
        self.print_section_header("audio devices");

        if self.config.disable_audio {
            self.print_section_item("disabled");
        } else if self.config.audio_devices.is_empty() {
            self.print_section_item("no devices available");
        } else {
            self.print_items_list(self.config.audio_devices.iter().map(|d| d.to_string()));
        }
    }

    fn print_realtime_audio_section(&self) {
        self.print_section_header("realtime audio devices");

        if self.config.disable_audio || !self.config.enable_realtime_audio_transcription {
            self.print_section_item("disabled");
        } else if self.config.realtime_audio_devices.is_empty() {
            self.print_section_item("no devices available");
        } else {
            self.print_items_list(
                self.config
                    .realtime_audio_devices
                    .iter()
                    .map(|d| d.to_string()),
            );
        }
    }

    fn print_pipes_section(&self) {
        self.print_section_header("pipes");

        if self.config.pipes.is_empty() {
            self.print_section_item("no pipes available");
        } else {
            self.print_items_list(self.config.pipes.iter().map(|p| {
                format!(
                    "({}) {}",
                    if p.enabled { "enabled" } else { "disabled" },
                    p.id
                )
            }));
        }
    }

    fn print_items_list<I, S>(&self, items: I)
    where
        I: Iterator<Item = S>,
        S: AsRef<str>,
    {
        let items: Vec<_> = items.collect();
        let total = items.len();

        for item in items.iter().take(MAX_ITEMS_TO_DISPLAY) {
            self.print_section_item(item.as_ref());
        }

        if total > MAX_ITEMS_TO_DISPLAY {
            self.print_section_item(&format!("... and {} more", total - MAX_ITEMS_TO_DISPLAY));
        }
    }

    fn print_table_footer(&self) {
        println!("└────────────────────────┴────────────────────────────────────┘");
    }

    fn print_warnings(&self) {
        // Cloud processing warning
        if *self.config.audio_transcription_engine == CliAudioTranscriptionEngine::Deepgram
            || *self.config.ocr_engine == CliOcrEngine::Unstructured
        {
            println!(
                "{}",
                "warning: you are using cloud now. make sure to understand the data privacy risks."
                    .bright_yellow()
            );
        } else {
            println!(
                "{}",
                "you are using local processing. all your data stays on your computer.\n"
                    .bright_green()
            );
        }

        // Telemetry warning
        if !self.config.disable_telemetry {
            println!(
                "{}",
                "warning: telemetry is enabled. only error-level data will be sent.\n\
                to disable, use the --disable-telemetry flag."
                    .bright_yellow()
            );
        } else {
            println!(
                "{}",
                "telemetry is disabled. no data will be sent to external services.".bright_green()
            );
        }
    }

    fn print_changelog_link(&self) {
        println!(
            "\n{}",
            "check latest changes here: https://github.com/mediar-ai/screenpipe/releases"
                .bright_blue()
                .italic()
        );
    }
}

/// Truncate and pad strings for table cells
fn format_cell(s: &str, width: usize) -> String {
    if s.len() > width {
        let mut max_pos = 0;
        for (i, c) in s.char_indices() {
            if i + c.len_utf8() > width - 3 {
                break;
            }
            max_pos = i + c.len_utf8();
        }
        format!("{}...", &s[..max_pos])
    } else {
        format!("{:<width$}", s, width = width)
    }
}
