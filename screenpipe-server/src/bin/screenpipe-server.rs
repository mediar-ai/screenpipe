use std::{
    collections::HashMap,
    fs::{self, File},
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
use log::{debug, error, info, LevelFilter};
use screenpipe_audio::{
    default_input_device, list_audio_devices, parse_audio_device, DeviceControl,
};
use screenpipe_vision::{monitor::{get_monitor_by_id, list_monitors}, OcrEngine};
use std::io::Write;

use screenpipe_core::find_ffmpeg_path;
use screenpipe_server::logs::MultiWriter;
use screenpipe_server::{start_continuous_recording, DatabaseManager, ResourceMonitor, Server};
use tokio::sync::mpsc::channel;
use screenpipe_vision::utils::OcrEngine as CoreOcrEngine;
use screenpipe_audio::AudioTranscriptionEngine as CoreAudioTranscriptionEngine;

use clap::ValueEnum;

#[derive(Clone, Debug, ValueEnum, PartialEq)]
enum CliAudioTranscriptionEngine {
    Deepgram,
    WhisperTiny,
}

impl From<CliAudioTranscriptionEngine> for CoreAudioTranscriptionEngine {
    fn from(cli_engine: CliAudioTranscriptionEngine) -> Self {
        match cli_engine {
            CliAudioTranscriptionEngine::Deepgram => CoreAudioTranscriptionEngine::Deepgram,
            CliAudioTranscriptionEngine::WhisperTiny => CoreAudioTranscriptionEngine::WhisperTiny,
        }
    }
}

#[derive(Clone, Debug, ValueEnum, PartialEq)]
enum CliOcrEngine {
    Unstructured,
    #[cfg(not(target_os = "macos"))]
    Tesseract,
    #[cfg(target_os = "windows")]
    WindowsNative,
    #[cfg(target_os = "macos")]
    AppleNative,
}

impl From<CliOcrEngine> for CoreOcrEngine {
    fn from(cli_engine: CliOcrEngine) -> Self {
        match cli_engine {
            CliOcrEngine::Unstructured => CoreOcrEngine::Unstructured,
            #[cfg(not(target_os = "macos"))]
            CliOcrEngine::Tesseract => CoreOcrEngine::Tesseract,
            #[cfg(target_os = "windows")]
            CliOcrEngine::WindowsNative => CoreOcrEngine::WindowsNative,
            #[cfg(target_os = "macos")]
            CliOcrEngine::AppleNative => CoreOcrEngine::AppleNative,
        }
    }
}



// keep in mind this is the most important feature ever // TODO: add a pipe and a ⭐️ e.g screen | ⭐️ somehow in ascii ♥️🤓
const DISPLAY: &str = r"
                                            _          
   __________________  ___  ____     ____  (_____  ___ 
  / ___/ ___/ ___/ _ \/ _ \/ __ \   / __ \/ / __ \/ _ \
 (__  / /__/ /  /  __/  __/ / / /  / /_/ / / /_/ /  __/
/____/\___/_/   \___/\___/_/ /_/  / .___/_/ .___/\___/ 
                                 /_/     /_/           

";

#[derive(Parser)]
#[command(
    author, 
    version,
    about, 
    long_about = None,
    name = "screenpipe"
)]
struct Cli {
    /// FPS for continuous recording
    /// 1 FPS = 30 GB / month
    /// 5 FPS = 150 GB / month
    /// Optimise based on your needs.
    /// Your screen rarely change more than 1 times within a second, right?
    #[cfg_attr(not(target_os = "macos"), arg(short, long, default_value_t = 1.0))]
    #[cfg_attr(target_os = "macos", arg(short, long, default_value_t = 0.2))] 
    fps: f64, // ! not crazy about this (unconsistent behaviour across platforms) see https://github.com/louis030195/screen-pipe/issues/173
    
    /// Audio chunk duration in seconds
    #[arg(short, long, default_value_t = 30)]
    audio_chunk_duration: u64,

    /// Port to run the server on
    #[arg(short, long, default_value_t = 3030)]
    port: u16,

    /// Disable audio recording
    #[arg(long, default_value_t = false)]
    disable_audio: bool,

    /// EXPERIMENTAL: Enable self healing when detecting unhealthy state based on /health endpoint.
    /// This feature will automatically restart the recording tasks while keeping the API alive.
    #[arg(long, default_value_t = false)]
    self_healing: bool,

    /// Audio devices to use (can be specified multiple times)
    #[arg(long)]
    audio_device: Vec<String>,

    /// List available audio devices
    #[arg(long)]
    list_audio_devices: bool,

    /// Data directory. Default to $HOME/.screenpipe
    #[arg(long)]
    data_dir: Option<String>,

    /// Enable debug logging for screenpipe modules
    #[arg(long)]
    debug: bool,

    /// Save text files
    #[arg(long, default_value_t = false)]
    save_text_files: bool,

    /// Audio transcription engine to use.
    /// Deepgram is a very high quality cloud-based transcription service (free of charge on us for now).
    /// WhisperTiny is a local, lightweight transcription model.
    #[arg(long, value_enum, default_value_t = CliAudioTranscriptionEngine::WhisperTiny)]
    audio_transcription_engine: CliAudioTranscriptionEngine,

    /// OCR engine to use.
    /// AppleNative is the default local OCR engine for macOS.
    /// WindowsNative is a local OCR engine for Windows.
    /// Unstructured is a cloud OCR engine (free of charge on us for now)
    /// Tesseract is a local OCR engine (not supported on macOS)
    #[cfg_attr(
        target_os = "macos",
        arg(long, value_enum, default_value_t = CliOcrEngine::AppleNative)
    )]
    #[cfg_attr(
        not(target_os = "macos"),
        arg(long, value_enum, default_value_t = CliOcrEngine::Tesseract)
    )]
    ocr_engine: CliOcrEngine,

    /// UID key for sending data to friend wearable (if not provided, data won't be sent)
    #[arg(long)]
    friend_wearable_uid: Option<String>,

    /// List available monitors, then you can use --monitor-id to select one (with the ID)
    #[arg(long)]
    list_monitors: bool,

    /// Monitor ID to use, this will be used to select the monitor to record
    #[arg(long)]
    monitor_id: Option<u32>,
}

fn get_base_dir(custom_path: Option<String>) -> anyhow::Result<PathBuf> {
    let default_path = home_dir()
        .ok_or_else(|| anyhow::anyhow!("Failed to get home directory"))?
        .join(".screenpipe");

    let base_dir = custom_path.map(PathBuf::from).unwrap_or(default_path);
    let data_dir = base_dir.join("data");

    fs::create_dir_all(&data_dir)?;
    Ok(base_dir)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if find_ffmpeg_path().is_none() {
        eprintln!("ffmpeg not found. Please install ffmpeg and ensure it is in your PATH.");
        std::process::exit(1);
    }

    // Initialize logging
    let cli = Cli::parse();

    let mut builder = env_logger::Builder::new();
    builder
        .filter(None, LevelFilter::Info)
        .filter_module("tokenizers", LevelFilter::Error)
        .filter_module("rusty_tesseract", LevelFilter::Error)
        .filter_module("symphonia", LevelFilter::Error)
        .filter_module("external_cloud_integrations", LevelFilter::Debug); // Add this line

    if cli.debug {
        builder.filter_module("screenpipe", LevelFilter::Debug);
    }
    // Example usage of the new flag
    if cli.save_text_files {
        debug!("Text files will be saved.");
    }

    // builder.init();
    // tokio-console
    // console_subscriber::init();
    let local_data_dir = get_base_dir(cli.data_dir)?;
    let local_data_dir_clone = local_data_dir.clone();

    let log_file = File::create(format!(
        "{}/screenpipe.log",
        local_data_dir.to_string_lossy()
    ))
    .unwrap();
    let multi_writer = MultiWriter::new(vec![
        Box::new(log_file) as Box<dyn Write + Send>,
        Box::new(std::io::stdout()) as Box<dyn Write + Send>,
    ]);

    builder.target(env_logger::Target::Pipe(Box::new(multi_writer)));
    builder.format_timestamp_secs().init();

    // Add warning for Linux and Windows users
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    {
        use log::warn;
        warn!("Screenpipe hasn't been extensively tested on this OS. We'd love your feedback!");
        println!(
            "{}",
            "Would love your feedback on the UX, let's a 15 min call soon:".bright_yellow()
        );
        println!(
            "{}",
            "https://cal.com/louis030195/screenpipe"
                .bright_blue()
                .underline()
        );
    }
    let all_audio_devices = list_audio_devices()?;
    let mut devices_status = HashMap::new();
    if cli.list_audio_devices {
        println!("Available audio devices:");
        for (i, device) in all_audio_devices.iter().enumerate() {
            println!("  {}. {}", i + 1, device);
        }
        return Ok(());
    }
    let all_monitors = list_monitors().await;
    if cli.list_monitors {
        println!("Available monitors:");
        for (_, monitor) in all_monitors.iter().enumerate() {
            println!("  {}. {:?}", monitor.id(), monitor);
        }
        return Ok(());
    }

    let mut audio_devices = Vec::new();

    let audio_devices_control = Arc::new(SegQueue::new());

    let audio_devices_control_server = audio_devices_control.clone();

    // Add all available audio devices to the controls
    for device in &all_audio_devices {
        let device_control = DeviceControl {
            is_running: false,
            is_paused: false,
        };
        devices_status.insert(device.clone(), device_control);
    }

    if !cli.disable_audio {
        if cli.audio_device.is_empty() {
            // Use default devices
            if let Ok(input_device) = default_input_device() {
                audio_devices.push(Arc::new(input_device.clone()));
                let device_control = DeviceControl {
                    is_running: true,
                    is_paused: false,
                };
                devices_status.insert(input_device, device_control);
            }
            // audio output only supported on linux atm
            // see https://github.com/louis030195/screen-pipe/pull/106
            if cfg!(target_os = "linux") {
                use screenpipe_audio::default_output_device;
                if let Ok(output_device) = default_output_device() {
                    audio_devices.push(Arc::new(output_device.clone()));
                    let device_control = DeviceControl {
                        is_running: true,
                        is_paused: false,
                    };
                    devices_status.insert(output_device, device_control);
                }
            }
        } else {
            // Use specified devices
            for d in &cli.audio_device {
                let device = parse_audio_device(d).expect("Failed to parse audio device");
                audio_devices.push(Arc::new(device.clone()));
                let device_control = DeviceControl {
                    is_running: true,
                    is_paused: false,
                };
                devices_status.insert(device, device_control);
            }
        }

        if audio_devices.is_empty() {
            eprintln!("No audio devices available. Audio recording will be disabled.");
        } else {
            for device in &audio_devices {
                info!("  {}", device);

                let device_control = DeviceControl {
                    is_running: true,
                    is_paused: false,
                };
                let device_clone = device.deref().clone();
                let sender_clone = audio_devices_control.clone();
                // send signal after everything started
                tokio::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(15)).await;
                    let _ = sender_clone.push((device_clone, device_control));
                });
            }
        }
    }

    let (restart_sender, mut restart_receiver) = channel(10);
    let resource_monitor =
        ResourceMonitor::new(cli.self_healing, Duration::from_secs(60), 3, restart_sender);
    resource_monitor.start_monitoring(Duration::from_secs(10));

    let db = Arc::new(
        DatabaseManager::new(&format!("{}/db.sqlite", local_data_dir.to_string_lossy()))
            .await
            .map_err(|e| {
                eprintln!("Failed to initialize database: {:?}", e);
                e
            })?,
    );
    info!(
        "Database initialized, will store files in {}",
        local_data_dir.to_string_lossy()
    );
    let db_server = db.clone();

    // Channel for controlling the recorder ! TODO RENAME SHIT
    let vision_control = Arc::new(AtomicBool::new(true));

    let vision_control_server_clone = vision_control.clone();

    // Before the loop starts, clone friend_wearable_uid
    let friend_wearable_uid = cli.friend_wearable_uid.clone();

    let warning_ocr_engine_clone = cli.ocr_engine.clone();
    let warning_audio_transcription_engine_clone = cli.audio_transcription_engine.clone();
    let monitor_id = cli.monitor_id.unwrap_or(all_monitors.first().unwrap().id());  

    // try to use the monitor selected, if not available throw an error
    get_monitor_by_id(monitor_id).await.unwrap_or_else(|| {
        eprintln!("{}", format!("Monitor with id {} not found. Try 'screenpipe --list-monitors'", monitor_id).red());
        std::process::exit(1);
    });
    let ocr_engine_clone = cli.ocr_engine.clone();

    // Function to start or restart the recording task
    let _start_recording = tokio::spawn(async move {
        // hack
        let mut recording_task = tokio::spawn(async move {});

        loop {
            let db_clone = db.clone();
            let local_data_dir = local_data_dir.clone();
            let vision_control = vision_control.clone();
            let audio_devices_control = audio_devices_control.clone();
            let friend_wearable_uid_clone = friend_wearable_uid.clone(); // Clone for each iteration

            tokio::select! {
                _ = &mut recording_task => {
                    // Recording task completed or errored, restart it
                    debug!("Recording task ended. Restarting...");
                }
                Some(_) = restart_receiver.recv() => {
                    // Received restart signal, cancel the current task and restart
                    info!("Received restart signal. Restarting recording task...");
                    recording_task.abort();
                }
            }
            let core_ocr_engine: CoreOcrEngine = cli.ocr_engine.clone().into();
            let ocr_engine = Arc::new(OcrEngine::from(core_ocr_engine));
            let core_audio_transcription_engine: CoreAudioTranscriptionEngine = cli.audio_transcription_engine.clone().into();
            let audio_transcription_engine = Arc::new(core_audio_transcription_engine);

            recording_task = tokio::spawn(async move {
                let result = start_continuous_recording(
                    db_clone,
                    Arc::new(local_data_dir.join("data").to_string_lossy().into_owned()),
                    cli.fps,
                    Duration::from_secs(cli.audio_chunk_duration),
                    vision_control,
                    audio_devices_control,
                    cli.save_text_files,
                    audio_transcription_engine,
                    ocr_engine,
                    friend_wearable_uid_clone, // Use the cloned version
                    monitor_id
                )
                .await;

                if let Err(e) = result {
                    error!("Continuous recording error: {:?}", e);
                }
            });
            debug!("Recording task started");

            // Short delay before restarting to avoid rapid restarts
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });

    tokio::spawn(async move {
        let api_plugin = |req: &axum::http::Request<axum::body::Body>| {
            // Custom plugin logic here
            // For example, using PostHog for tracking:
            if req.uri().path() == "/search" {
                // Track search requests
                // posthog.capture("search_request", {...})
            }
        };
        let server = Server::new(
            db_server,
            SocketAddr::from(([0, 0, 0, 0], cli.port)),
            vision_control_server_clone,
            audio_devices_control_server,
        );
        server.start(devices_status, api_plugin).await.unwrap();
    });

    // Wait for the server to start
    info!("Server started on http://localhost:{}", cli.port);

    // print screenpipe in gradient
    println!("\n\n{}", DISPLAY.truecolor(147, 112, 219).bold());
    println!(
        "\n{}",
        "Build AI apps that have the full context"
            .bright_yellow()
            .italic()
    );
    println!(
        "{}\n\n",
        "Open source | Runs locally | Developer friendly".bright_green()
    );

    println!("┌─────────────────────┬────────────────────────────────────┐");
    println!("│ Setting             │ Value                              │");
    println!("├─────────────────────┼────────────────────────────────────┤");
    println!("│ FPS                 │ {:<34} │", cli.fps);
    println!("│ Audio Chunk Duration│ {:<34} │", format!("{} seconds", cli.audio_chunk_duration));
    println!("│ Port                │ {:<34} │", cli.port);
    println!("│ Audio Disabled      │ {:<34} │", cli.disable_audio);
    println!("│ Self Healing        │ {:<34} │", cli.self_healing);
    println!("│ Save Text Files     │ {:<34} │", cli.save_text_files);
    println!("│ Audio Engine        │ {:<34} │", format!("{:?}", warning_audio_transcription_engine_clone));
    println!("│ OCR Engine          │ {:<34} │", format!("{:?}", ocr_engine_clone));
    println!("│ Monitor ID          │ {:<34} │", monitor_id);
    println!("│ Data Directory      │ {:<34} │", local_data_dir_clone.display());
    println!("│ Debug Mode          │ {:<34} │", cli.debug);
    const VALUE_WIDTH: usize = 34;

    // Function to truncate and pad strings
    fn format_cell(s: &str, width: usize) -> String {
        if s.len() > width {
            format!("{}...", &s[..width - 3])
        } else {
            format!("{:<width$}", s, width = width)
        }
    }

    // In the main function, replace the audio devices section with:
    println!("├─────────────────────┼────────────────────────────────────┤");
    println!("│ Audio Devices       │                                    │");

    if cli.disable_audio {
        println!("│ {:<19} │ {:<34} │", "", "Disabled");
    } else if audio_devices.is_empty() {
        println!("│ {:<19} │ {:<34} │", "", "No devices available");
    } else {
        for (i, device) in audio_devices.iter().enumerate() {
            let device_str = device.deref().to_string();
            let formatted_device = format_cell(&device_str, VALUE_WIDTH);
            if i == 0 {
                println!("│ {:<19} │ {:<34} │", "", formatted_device);
            } else {
                println!("│ {:<19} │ {:<34} │", "", formatted_device);
            }
        }
    }

    println!("└─────────────────────┴────────────────────────────────────┘");


    // Add warning for cloud arguments
    if warning_audio_transcription_engine_clone == CliAudioTranscriptionEngine::Deepgram || warning_ocr_engine_clone == CliOcrEngine::Unstructured {
        println!(
            "{}",
            "WARNING: You are using cloud now. Make sure to understand the data privacy risks."
                .bright_yellow()
        );
    } else {
        println!(
            "{}",
            "You are using local processing. All your data stays on your computer.\n"
                .bright_yellow()
        );
    }

    // Keep the main thread running
    loop {
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}
