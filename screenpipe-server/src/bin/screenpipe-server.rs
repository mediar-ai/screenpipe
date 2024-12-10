use std::{
    collections::HashMap,
    env, fs,
    io::Write,
    net::SocketAddr,
    ops::Deref,
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc},
    time::Duration,
};

use clap::Parser;
#[allow(unused_imports)]
use colored::Colorize;
use crossbeam::queue::SegQueue;
use dirs::home_dir;
use futures::pin_mut;
use screenpipe_audio::{
    default_input_device, default_output_device, list_audio_devices, parse_audio_device,
    AudioDevice, DeviceControl,
};
use screenpipe_core::find_ffmpeg_path;
use screenpipe_server::{
    cli::{Cli, CliAudioTranscriptionEngine, CliOcrEngine, Command, OutputFormat, PipeCommand},
    highlight::{Highlight, HighlightConfig},
    pipe_manager::PipeInfo,
    start_continuous_recording, watch_pid, DatabaseManager, PipeManager, ResourceMonitor, Server,
};
use screenpipe_vision::monitor::list_monitors;
#[cfg(target_os = "macos")]
use screenpipe_vision::run_ui;
use serde_json::{json, Value};
use tokio::{runtime::Runtime, signal, sync::broadcast};
use tracing::{debug, error, info, warn};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::prelude::__tracing_subscriber_SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{fmt, EnvFilter};

fn print_devices(devices: &[AudioDevice]) {
    println!("available audio devices:");
    for device in devices.iter() {
        println!("  {}", device);
    }

    #[cfg(target_os = "macos")]
    println!("on macos, it's not intuitive but output devices are your displays");
}

const DISPLAY: &str = r"
                                            _          
   __________________  ___  ____     ____  (_____  ___ 
  / ___/ ___/ ___/ _ \/ _ \/ __ \   / __ \/ / __ \/ _ \
 (__  / /__/ /  /  __/  __/ / / /  / /_/ / / /_/ /  __/
/____/\___/_/   \___/\___/_/ /_/  / .___/_/ .___/\___/ 
                                 /_/     /_/           

";

fn get_base_dir(custom_path: &Option<String>) -> anyhow::Result<PathBuf> {
    let default_path = home_dir()
        .ok_or_else(|| anyhow::anyhow!("failed to get home directory"))?
        .join(".screenpipe");

    let base_dir = custom_path
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or(default_path);
    let data_dir = base_dir.join("data");

    fs::create_dir_all(&data_dir)?;
    Ok(base_dir)
}

fn setup_logging(local_data_dir: &PathBuf, cli: &Cli) -> anyhow::Result<WorkerGuard> {
    let file_appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix("screenpipe")
        .filename_suffix("log")
        .max_log_files(5)
        .build(local_data_dir)?;

    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    let env_filter = EnvFilter::from_default_env()
        .add_directive("info".parse().unwrap())
        .add_directive("tokenizers=error".parse().unwrap())
        .add_directive("rusty_tesseract=error".parse().unwrap())
        .add_directive("symphonia=error".parse().unwrap())
        .add_directive("hf_hub=error".parse().unwrap());

    // filtering out xcap::platform::impl_window - Access is denied. (0x80070005)
    // which is noise
    #[cfg(target_os = "windows")]
    let env_filter = env_filter.add_directive("xcap::platform::impl_window=off".parse().unwrap());

    let env_filter = env::var("SCREENPIPE_LOG")
        .unwrap_or_default()
        .split(',')
        .filter(|s| !s.is_empty())
        .fold(
            env_filter,
            |filter, module_directive| match module_directive.parse() {
                Ok(directive) => filter.add_directive(directive),
                Err(e) => {
                    eprintln!(
                        "warning: invalid log directive '{}': {}",
                        module_directive, e
                    );
                    filter
                }
            },
        );

    let env_filter = if cli.debug {
        env_filter.add_directive("screenpipe=debug".parse().unwrap())
    } else {
        env_filter
    };

    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt::layer().with_writer(std::io::stdout))
        .with(fmt::layer().with_writer(non_blocking))
        .init();

    Ok(guard)
}

[Rest of the file remains unchanged...]
