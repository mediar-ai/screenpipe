use std::{
    collections::HashMap, fs, io, net::SocketAddr, ops::Deref, path::PathBuf, sync::{atomic::AtomicBool, Arc}, time::Duration, env, io::Write
};

use clap::Parser;
#[allow(unused_imports)]
use colored::Colorize;
use crossbeam::queue::SegQueue;
use dirs::home_dir;
use futures::{pin_mut, stream::FuturesUnordered, StreamExt};
use screenpipe_audio::{
    default_input_device, default_output_device, list_audio_devices, parse_audio_device, AudioDevice, DeviceControl
};
use screenpipe_core::find_ffmpeg_path;
use screenpipe_server::{
    cli::{Cli, CliAudioTranscriptionEngine, CliOcrEngine, Command, PipeCommand}, start_continuous_recording, watch_pid, DatabaseManager, PipeControl, PipeManager, ResourceMonitor, Server, highlight::{Highlight,HighlightConfig}
};
use screenpipe_vision::{monitor::list_monitors};
#[cfg(target_os = "macos")]
use screenpipe_vision::run_ui;
use serde_json::{json, Value};
use tokio::{runtime::Runtime, signal, sync::broadcast};
use tracing_subscriber::prelude::__tracing_subscriber_SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{fmt, EnvFilter};
use tracing::{info, debug, error};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_appender::non_blocking::WorkerGuard;

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

    let base_dir = custom_path.as_ref().map(PathBuf::from).unwrap_or(default_path);
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
        .add_directive("symphonia=error".parse().unwrap());

    let env_filter = env::var("SCREENPIPE_LOG")
        .unwrap_or_default()
        .split(',')
        .filter(|s| !s.is_empty())
        .fold(env_filter, |filter, module_directive| {
            match module_directive.parse() {
                Ok(directive) => filter.add_directive(directive),
                Err(e) => {
                    eprintln!("warning: invalid log directive '{}': {}", module_directive, e);
                    filter
                }
            }
        });

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

#[tokio::main]
async fn main() -> anyhow::Result<()> {

    debug!("starting screenpipe server");
    let cli = Cli::parse();

    let local_data_dir = get_base_dir(&cli.data_dir)?;
    let local_data_dir_clone = local_data_dir.clone();

    let _log_guard = setup_logging(&local_data_dir, &cli)?;

    let h = Highlight::init(HighlightConfig {
        project_id:String::from("82688"),
        ..Default::default()
    })
    .expect("Failed to initialize Highlight.io");

    let (pipe_manager, mut pipe_control_rx) = PipeManager::new(local_data_dir_clone.clone());
    let pipe_manager = Arc::new(pipe_manager);

    // Check if Screenpipe is present in PATH
    match ensure_screenpipe_in_path().await {
        Ok(_) => info!("screenpipe is available and properly set in the PATH"),
        Err(e) => {
            error!("screenpipe PATH check failed: {}", e);
            error!("please ensure screenpipe is installed correctly and is in your PATH");
            h.capture_error("please ensure screenpipe is installed correctly and is in your PATH");
            // do not crash
        }
    }

    if let Some(pipe_command) = cli.command {
        match pipe_command {
            Command::Pipe { subcommand } => {
                handle_pipe_command(subcommand, &pipe_manager).await?;
                return Ok(());
            }
            #[allow(unused_variables)]
            Command::Setup { enable_beta } => {
                #[cfg(feature = "beta")]
                if enable_beta {
                    use screenpipe_actions::type_and_animate::trigger_keyboard_permission;

                    // Trigger keyboard permission request
                    if let Err(e) = trigger_keyboard_permission() {
                        error!("Failed to trigger keyboard permission: {:?}", e);
                        error!("Please grant keyboard permission manually in System Preferences.");
                        h.capture_error("Please grant keyboard permission manually in System Preferences.");
                    } else {
                        info!("Keyboard permission requested. Please grant permission if prompted.");
                    }
                }
                use screenpipe_audio::{trigger_audio_permission, vad_engine::SileroVad, whisper::WhisperModel};
                use screenpipe_vision::core::trigger_screen_capture_permission;

                // Trigger audio permission request
                if let Err(e) = trigger_audio_permission() {
                    error!("Failed to trigger audio permission: {:?}", e);
                    error!("Please grant microphone permission manually in System Preferences.");
                    h.capture_error("Please grant microphone permission manually in System Preferences.");
                } else {
                    info!("Audio permission requested. Please grant permission if prompted.");
                }

                // Trigger screen capture permission request
                if let Err(e) = trigger_screen_capture_permission() {
                    error!("Failed to trigger screen capture permission: {:?}", e);
                    error!("Please grant screen recording permission manually in System Preferences.");
                    h.capture_error("Please grant microphone permission manually in System Preferences.");
                } else {
                    info!("Screen capture permission requested. Please grant permission if prompted.");
                }

                // this command just download models and stuff (useful to have specific step to display in UI)

                // ! should prob skip if deepgram?
                WhisperModel::new(&cli.audio_transcription_engine.into()).unwrap();
                // ! assuming silero is used
                SileroVad::new().await.unwrap();

                // Check if FFmpeg is working properly
                if let Some(ffmpeg_path) = find_ffmpeg_path() {
                    println!("ffmpeg found at: {:?}", ffmpeg_path);
                } else {
                    eprintln!("failed to find or install ffmpeg.");
                    return Err(anyhow::anyhow!("ffmpeg installation failed"));
                }

                match check_ffmpeg().await {
                    Ok(_) => info!("FFmpeg is working properly"),
                    Err(e) => {
                        error!("FFmpeg check failed: {}", e);
                        error!("Please ensure FFmpeg is installed correctly and is in your PATH");
                        h.capture_error("Please ensure FFmpeg is installed correctly and is in your PATH");
                        return Err(e.into());
                    }
                }

                info!("screenpipe setup complete");
                return Ok(());
            }
        }
    }

    if find_ffmpeg_path().is_none() {
        eprintln!("ffmpeg not found. please install ffmpeg and ensure it is in your path.");
        std::process::exit(1);
    }

    let all_audio_devices = list_audio_devices().await?;
    let mut devices_status = HashMap::new();
    if cli.list_audio_devices {
        print_devices(&all_audio_devices);
        return Ok(());
    }
    let all_monitors = list_monitors().await;
    if cli.list_monitors {
        println!("available monitors:");
        for monitor in all_monitors.iter() {
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
            // audio output only on macos <15.0 atm ?
            // see https://github.com/mediar-ai/screenpipe/pull/106
            if let Ok(output_device) = default_output_device() {
                audio_devices.push(Arc::new(output_device.clone()));
                let device_control = DeviceControl {
                    is_running: true,
                    is_paused: false,
                };
                devices_status.insert(output_device, device_control);
            }
        } else {
            // Use specified devices
            for d in &cli.audio_device {
                let device = parse_audio_device(d).expect("failed to parse audio device");
                audio_devices.push(Arc::new(device.clone()));
                let device_control = DeviceControl {
                    is_running: true,
                    is_paused: false,
                };
                devices_status.insert(device, device_control);
            }
        }

        if audio_devices.is_empty() {
            eprintln!("no audio devices available. audio recording will be disabled.");
        } else {
            for device in &audio_devices {

                let device_control = DeviceControl {
                    is_running: true,
                    is_paused: false,
                };
                let device_clone = device.deref().clone();
                let sender_clone = audio_devices_control.clone();
                // send signal after everything started
                tokio::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(15)).await;
                    sender_clone.push((device_clone, device_control));
                });
            }
        }
    }

    let resource_monitor = ResourceMonitor::new();
    resource_monitor.start_monitoring(Duration::from_secs(10));

    let db = Arc::new(
        DatabaseManager::new(&format!("{}/db.sqlite", local_data_dir.to_string_lossy()))
            .await
            .map_err(|e| {
                eprintln!("failed to initialize database: {:?}", e);
                e
            })?,
    );

    let db_server = db.clone();

    // Channel for controlling the recorder ! TODO RENAME SHIT
    let vision_control = Arc::new(AtomicBool::new(true));

    let vision_control_server_clone = vision_control.clone();

    // Before the loop starts, clone friend_wearable_uid
    let friend_wearable_uid = cli.friend_wearable_uid.clone();

    let warning_ocr_engine_clone = cli.ocr_engine.clone();
    let warning_audio_transcription_engine_clone = cli.audio_transcription_engine.clone();
    let monitor_ids = if cli.monitor_id.is_empty() {
        all_monitors.iter().map(|m| m.id()).collect::<Vec<_>>()
    } else {
        cli.monitor_id.clone()
    };

    let languages = cli.unique_languages().unwrap();
    let languages_clone = languages.clone();

    let ocr_engine_clone = cli.ocr_engine.clone();
    let vad_engine = cli.vad_engine.clone();
    let vad_engine_clone = vad_engine.clone();
    let vad_sensitivity_clone = cli.vad_sensitivity.clone();
    let (shutdown_tx, _) = broadcast::channel::<()>(1);

    let audio_runtime = Runtime::new().unwrap();
    let vision_runtime = Runtime::new().unwrap();

    let audio_handle = audio_runtime.handle().clone();
    let vision_handle = vision_runtime.handle().clone();

    let db_clone = Arc::clone(&db);
    let output_path_clone = Arc::new(local_data_dir.join("data").to_string_lossy().into_owned());
    let vision_control_clone = Arc::clone(&vision_control);
    let shutdown_tx_clone = shutdown_tx.clone();
    let friend_wearable_uid_clone: Option<String> = friend_wearable_uid.clone(); // Clone here
    let monitor_ids_clone = monitor_ids.clone();
    let ignored_windows_clone = cli.ignored_windows.clone();
    let included_windows_clone = cli.included_windows.clone();

    let fps = if cli.fps.is_finite() && cli.fps > 0.0 {
        cli.fps
    } else {
        eprintln!("invalid fps value: {}. using default of 1.0", cli.fps);
        1.0
    };

    let audio_chunk_duration = Duration::from_secs(cli.audio_chunk_duration);

    let handle = {
        let runtime = &tokio::runtime::Handle::current();
        runtime.spawn(async move {
            loop {
                let vad_engine_clone = vad_engine.clone(); // Clone it here for each iteration
                let mut shutdown_rx = shutdown_tx_clone.subscribe();
                let recording_future = start_continuous_recording(
                    db_clone.clone(),
                    output_path_clone.clone(),
                    fps,
                    audio_chunk_duration, // use the new setting
                    Duration::from_secs(cli.video_chunk_duration),
                    vision_control_clone.clone(),
                    audio_devices_control.clone(),
                    cli.disable_audio,
                    cli.save_text_files,
                    Arc::new(cli.audio_transcription_engine.clone().into()),
                    Arc::new(cli.ocr_engine.clone().into()),
                    friend_wearable_uid_clone.clone(),
                    monitor_ids_clone.clone(),
                    cli.use_pii_removal,
                    cli.disable_vision,
                    vad_engine_clone,
                    &vision_handle,
                    &audio_handle,
                    &cli.ignored_windows,
                    &cli.included_windows,
                    cli.deepgram_api_key.clone(),
                    cli.vad_sensitivity.clone(),
                    languages.clone(),
                );

                let result = tokio::select! {
                    result = recording_future => result,
                    _ = shutdown_rx.recv() => {
                        info!("received shutdown signal for recording");
                        break;
                    }
                };

                if let Err(e) = result {
                    error!("continuous recording error: {:?}", e);
                }
            }

            drop(vision_runtime);
            drop(audio_runtime);
        })
    };

    let local_data_dir_clone_2 = local_data_dir_clone.clone();
    #[cfg(feature = "llm")]
    debug!("LLM initializing");

    #[cfg(feature = "llm")]
    let llm = {
        match cli.enable_llm {
            true => Some(screenpipe_core::LLM::new(screenpipe_core::ModelName::Llama)?),
            false => None,
        }
        }; 

    #[cfg(feature = "llm")]
    debug!("LLM initialized");

    let api_plugin = |req: &axum::http::Request<axum::body::Body>| {
        if req.uri().path() == "/search" {
            // Track search requests
        }
    };
    let server = Server::new(
        db_server,
        SocketAddr::from(([127, 0, 0, 1], cli.port)),
        vision_control_server_clone,
        audio_devices_control_server,
        local_data_dir_clone_2,
        pipe_manager.clone(),
        cli.disable_vision,
        cli.disable_audio,
        cli.enable_ui_monitoring,
    );

    let pipe_futures = Arc::new(tokio::sync::Mutex::new(FuturesUnordered::new()));
    let pipe_futures_clone = pipe_futures.clone();

    // print screenpipe in gradient
    println!("\n\n{}", DISPLAY.truecolor(147, 112, 219).bold());
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

    println!("┌─────────────────────┬────────────────────────────────────┐");
    println!("│ setting             │ value                              │");
    println!("├─────────────────────┼────────────────────────────────────┤");
    println!("│ fps                 │ {:<34} │", cli.fps);
    println!(
        "│ audio chunk duration│ {:<34} │",
        format!("{} seconds", cli.audio_chunk_duration)
    );
    println!(
        "│ video chunk duration│ {:<34} │",
        format!("{} seconds", cli.video_chunk_duration)
    );
    println!("│ port                │ {:<34} │", cli.port);
    println!("│ audio disabled      │ {:<34} │", cli.disable_audio);
    println!("│ vision disabled     │ {:<34} │", cli.disable_vision);
    println!("│ save text files     │ {:<34} │", cli.save_text_files);
    println!(
        "│ audio engine        │ {:<34} │",
        format!("{:?}", warning_audio_transcription_engine_clone)
    );
    println!(
        "│ ocr engine          │ {:<34} │",
        format!("{:?}", ocr_engine_clone)
    );
    println!(
        "│ vad engine          │ {:<34} │",
        format!("{:?}", vad_engine_clone)
    );
    println!(
        "│ vad sensitivity     │ {:<34} │",
        format!("{:?}", vad_sensitivity_clone)
    );
    println!(
        "│ data directory      │ {:<34} │",
        local_data_dir_clone.display()
    );
    println!("│ debug mode          │ {:<34} │", cli.debug);
    println!("│ telemetry           │ {:<34} │", !cli.disable_telemetry);
    println!("│ local llm           │ {:<34} │", cli.enable_llm);

    println!("│ use pii removal     │ {:<34} │", cli.use_pii_removal);
    println!(
        "│ ignored windows     │ {:<34} │",
        format_cell(&format!("{:?}", &ignored_windows_clone), VALUE_WIDTH)
    );
    println!(
        "│ included windows    │ {:<34} │",
        format_cell(&format!("{:?}", &included_windows_clone), VALUE_WIDTH)
    );
    println!(
        "│ friend wearable uid │ {:<34} │",
        cli.friend_wearable_uid.as_deref().unwrap_or("not set")
    );
    println!("│ ui monitoring       │ {:<34} │", cli.enable_ui_monitoring);
    println!("│ frame cache         │ {:<34} │", cli.enable_frame_cache);

    const VALUE_WIDTH: usize = 34;

    // Function to truncate and pad strings
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

    // Add languages section
    println!("├─────────────────────┼────────────────────────────────────┤");
    println!("│ languages           │                                    │");
    const MAX_ITEMS_TO_DISPLAY: usize = 5;

    if cli.language.is_empty() {
        println!("│ {:<19} │ {:<34} │", "", "all languages");
    } else {
        let total_languages = cli.language.len();
        for (_, language) in languages_clone.iter().enumerate().take(MAX_ITEMS_TO_DISPLAY) {
            let language_str = format!("id: {}", language);
            let formatted_language = format_cell(&language_str, VALUE_WIDTH);
            println!("│ {:<19} │ {:<34} │", "", formatted_language);
        }
        if total_languages > MAX_ITEMS_TO_DISPLAY {
            println!(
                "│ {:<19} │ {:<34} │",
                "",
                format!("... and {} more", total_languages - MAX_ITEMS_TO_DISPLAY)
            );
        }
    }

    // Add monitors section
    println!("├─────────────────────┼────────────────────────────────────┤");
    println!("│ monitors            │                                    │");

    if cli.disable_vision {
        println!("│ {:<19} │ {:<34} │", "", "vision disabled");
    } else if monitor_ids.is_empty() {
        println!("│ {:<19} │ {:<34} │", "", "no monitors available");
    } else {
        let total_monitors = monitor_ids.len();
        for (_, monitor) in monitor_ids.iter().enumerate().take(MAX_ITEMS_TO_DISPLAY) {
            let monitor_str = format!("id: {}", monitor);
            let formatted_monitor = format_cell(&monitor_str, VALUE_WIDTH);
            println!("│ {:<19} │ {:<34} │", "", formatted_monitor);
        }
        if total_monitors > MAX_ITEMS_TO_DISPLAY {
            println!(
                "│ {:<19} │ {:<34} │",
                "",
                format!("... and {} more", total_monitors - MAX_ITEMS_TO_DISPLAY)
            );
        }
    }

    // Audio devices section
    println!("├─────────────────────┼────────────────────────────────────┤");
    println!("│ audio devices       │                                    │");

    if cli.disable_audio {
        println!("│ {:<19} │ {:<34} │", "", "disabled");
    } else if audio_devices.is_empty() {
        println!("│ {:<19} │ {:<34} │", "", "no devices available");
    } else {
        let total_devices = audio_devices.len();
        for (_, device) in audio_devices.iter().enumerate().take(MAX_ITEMS_TO_DISPLAY) {
            let device_str = device.deref().to_string();
            let formatted_device = format_cell(&device_str, VALUE_WIDTH);

            println!("│ {:<19} │ {:<34} │", "", formatted_device);
        }
        if total_devices > MAX_ITEMS_TO_DISPLAY {
            println!(
                "│ {:<19} │ {:<34} │",
                "",
                format!("... and {} more", total_devices - MAX_ITEMS_TO_DISPLAY)
            );
        }
    }

    // Pipes section
    println!("├─────────────────────┼────────────────────────────────────┤");
    println!("│ pipes               │                                    │");
    let pipes = pipe_manager.list_pipes().await;
    if pipes.is_empty() {
        println!("│ {:<19} │ {:<34} │", "", "no pipes available");
    } else {
        let total_pipes = pipes.len();
        for (_, pipe) in pipes.iter().enumerate().take(MAX_ITEMS_TO_DISPLAY) {
            let pipe_str = format!(
                "({}) {}",
                if pipe.enabled { "enabled" } else { "disabled" },
                pipe.id,
            );
            let formatted_pipe = format_cell(&pipe_str, VALUE_WIDTH);
            println!("│ {:<19} │ {:<34} │", "", formatted_pipe);
        }
        if total_pipes > MAX_ITEMS_TO_DISPLAY {
            println!(
                "│ {:<19} │ {:<34} │",
                "",
                format!("... and {} more", total_pipes - MAX_ITEMS_TO_DISPLAY)
            );
        }
    }

    println!("└─────────────────────┴────────────────────────────────────┘");

    // Add warning for cloud arguments and telemetry
    if warning_audio_transcription_engine_clone == CliAudioTranscriptionEngine::Deepgram
        || warning_ocr_engine_clone == CliOcrEngine::Unstructured
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

    // Add warning for telemetry
    if !cli.disable_telemetry {
        println!(
            "{}",
            "warning: telemetry is enabled. only error-level data will be sent to highlight.io.\n\
            to disable, use the --disable-telemetry flag."
                .bright_yellow()
        );
    } else {
        h.shutdown();
        println!(
            "{}",
            "telemetry is disabled. no data will be sent to external services."
                .bright_green()
        );
    }

    // Start pipes
    debug!("starting pipes");
    let pipes = pipe_manager.list_pipes().await;
    for pipe in pipes {
        debug!("pipe: {:?}", pipe.id);
        if !pipe.enabled {
            debug!("pipe {} is disabled, skipping", pipe.id);
            continue;
        }
        match pipe_manager.start_pipe(&pipe.id).await {
            Ok(future) => pipe_futures.lock().await.push(future),
            Err(e) => eprintln!("failed to start pipe {}: {}", pipe.id, e),
        }
    }

    let server_future = server.start(devices_status, api_plugin, cli.enable_frame_cache);
    pin_mut!(server_future);

    let pipes_future = async {
        loop {
            if let Some(result) = pipe_futures_clone.lock().await.next().await {
                info!("pipe completed: {:?}", result);
            } else {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    };
    pin_mut!(pipes_future);

    // Add auto-destruct watcher
    if let Some(pid) = cli.auto_destruct_pid {
        info!("watching pid {} for auto-destruction", pid);
        let shutdown_tx_clone = shutdown_tx.clone();
        tokio::spawn(async move {
            // sleep for 5 seconds 
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            if watch_pid(pid).await {
                info!("watched pid {} has stopped, initiating shutdown", pid);
                let _ = shutdown_tx_clone.send(());
            }
        });
    }

    let ctrl_c_future = signal::ctrl_c();
    pin_mut!(ctrl_c_future);

    // only in beta and on macos
    #[cfg(feature = "beta")]
    {
        if cli.enable_beta && cfg!(target_os = "macos") {
            use screenpipe_actions::run;

            info!("beta feature enabled, starting screenpipe actions");

            let shutdown_tx_clone = shutdown_tx.clone();
            tokio::spawn(async move {
                let mut shutdown_rx = shutdown_tx_clone.subscribe();
                
                tokio::select! {
                    result = run() => {
                        if let Err(e) = result {
                            error!("Error running screenpipe actions: {}", e);
                        }
                    }
                    _ = shutdown_rx.recv() => {
                        info!("Received shutdown signal, stopping screenpipe actions");
                    }
                }
            });
        }
    }

    // Start the UI monitoring task
    #[cfg(target_os = "macos")]
    if cli.enable_ui_monitoring {
        let shutdown_tx_clone = shutdown_tx.clone();
        tokio::spawn(async move {
            let mut shutdown_rx = shutdown_tx_clone.subscribe();
            
            loop {
                tokio::select! {
                    result = run_ui() => {
                        match result {
                            Ok(_) => break,
                            Err(e) => {
                                error!("ui monitoring error: {}", e);
                                tokio::time::sleep(Duration::from_secs(5)).await;
                                continue;
                            }
                        }
                    }
                    _ = shutdown_rx.recv() => {
                        info!("received shutdown signal, stopping ui monitoring");
                        break;
                    }
                }
            }
        });
    }

    let pipe_control_future = async {
        while let Some(control) = pipe_control_rx.recv().await {
            match control {
                PipeControl::Enable(pipe_id) => {
                    debug!("enabling pipe: {}", pipe_id);
                    match pipe_manager.start_pipe(&pipe_id).await {
                        Ok(future) => pipe_futures_clone.lock().await.push(future),
                        Err(e) => error!("failed to start pipe {}: {}", pipe_id, e),
                    }
                }
                PipeControl::Disable(pipe_id) => {
                    debug!("disabling pipe: {}", pipe_id);
                }
            }
        }
    };
    pin_mut!(pipe_control_future);

    tokio::select! {
        _ = handle => info!("recording completed"),
        result = &mut server_future => {
            match result {
                Ok(_) => info!("server stopped normally"),
                Err(e) => error!("server stopped with error: {:?}", e),
            }
        }
        _ = &mut pipes_future => {
            info!("all pipes completed, but server is still running");
        }
        _ = &mut pipe_control_future => {
            info!("pipe control channel closed");
        }
        _ = ctrl_c_future => {
            info!("received ctrl+c, initiating shutdown");
            let _ = shutdown_tx.send(());
        }
    }

    h.shutdown();
    info!("shutdown complete");

    Ok(())
}

async fn handle_pipe_command(pipe: PipeCommand, pipe_manager: &PipeManager) -> anyhow::Result<()> {
    // Handle pipe subcommands
    match pipe {
        PipeCommand::List => {
            let pipes = pipe_manager.list_pipes().await;
            println!("available pipes:");
            for pipe in pipes {
                println!("  id: {}, enabled: {}", pipe.id, pipe.enabled);
            }
        }
        PipeCommand::Download { url } => match pipe_manager.download_pipe(&url).await {
            Ok(pipe_id) => println!("pipe downloaded successfully. id: {}. now enable it with `screenpipe pipe enable {}`", pipe_id, pipe_id),
            Err(e) => eprintln!("failed to download pipe: {}", e),
        },
        PipeCommand::Info { id } => match pipe_manager.get_pipe_info(&id).await {
            Some(info) => println!("pipe info: {:?}", info),
            None => eprintln!("pipe not found"),
        },
        PipeCommand::Enable { id } => {
            match pipe_manager
                .update_config(&id, json!({"enabled": true}))
                .await
            {
                Ok(_) => println!("pipe {} enabled. now restart screenpipe with `screenpipe`", id),
                Err(e) => eprintln!("failed to enable pipe: {}", e),
            }
        }
        PipeCommand::Disable { id } => {
            match pipe_manager
                .update_config(&id, json!({"enabled": false}))
                .await
            {
                Ok(_) => println!("pipe {} disabled", id),
                Err(e) => eprintln!("failed to disable pipe: {}", e),
            }
        }
        PipeCommand::Update { id, config } => {
            let config: Value = serde_json::from_str(&config)
                .map_err(|e| anyhow::anyhow!("invalid json: {}", e))?;
            match pipe_manager.update_config(&id, config).await {
                Ok(_) => println!("pipe {} config updated", id),
                Err(e) => eprintln!("failed to update pipe config: {}", e),
            }
        }
        PipeCommand::Purge { yes } => {
            if yes {
                match pipe_manager.purge_pipes().await {
                    Ok(_) => println!("all pipes purged successfully."),
                    Err(e) => eprintln!("failed to purge pipes: {}", e),
                }
            } else {
                print!("are you sure you want to purge all pipes? this action cannot be undone. (y/N): ");
                io::stdout().flush()?;
                
                let mut input = String::new();
                io::stdin().read_line(&mut input)?;
                
                if input.trim().to_lowercase() == "y" {
                    match pipe_manager.purge_pipes().await {
                        Ok(_) => println!("all pipes purged successfully."),
                        Err(e) => eprintln!("failed to purge pipes: {}", e),
                    }
                } else {
                    println!("pipe purge cancelled.");
                }
            }
        },
    }
    Ok(())
}

async fn ensure_screenpipe_in_path() -> anyhow::Result<()> {
    use tokio::process::Command;

    // Check if 'screenpipe' is already in the PATH
    let output = if cfg!(target_os = "windows") {
        Command::new("where").arg("screenpipe").output().await?
    } else {
        Command::new("which").arg("screenpipe").output().await?
    };

    // If 'screenpipe' is found, log and return early
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let screenpipe_path = PathBuf::from(stdout.trim());
        info!("screenpipe already in PATH at: {}", screenpipe_path.display());
        return Ok(());
    }

    // If not found, add 'screenpipe' to the PATH permanently
    let current_exe = env::current_exe()?;
    let current_dir = match current_exe.parent() {
        Some(dir) => dir,
        None => return Err(anyhow::anyhow!("failed to get current executable directory")),
    };
    let screenpipe_bin = current_dir.join("screenpipe");

    let paths = env::split_paths(&env::var("PATH")?).collect::<Vec<_>>();
    if !paths.contains(&current_dir.to_path_buf()) {
        // Platform-specific persistence
        if cfg!(target_os = "windows") {
            persist_path_windows(current_dir.to_path_buf())?;
        } else if cfg!(target_os = "macos") || cfg!(target_os = "linux") {
            persist_path_unix(current_dir.to_path_buf())?;
        }
        info!("added {} to the PATH permanently", screenpipe_bin.display());
    }

    Ok(())
}

fn persist_path_windows(new_path: PathBuf) -> anyhow::Result<()> {
    // Try to read the current PATH environment variable
    let current_path = env::var("PATH").map_err(|e| anyhow::anyhow!("Failed to read current PATH: {}", e))?;

    // Check if the new path is already in the current PATH
    if current_path.contains(new_path.to_str().unwrap_or("")) {
        info!("PATH already contains {}", new_path.display());
        return Ok(());
    }

    // Ensure 'setx' command can handle the new PATH length
    if current_path.len() + new_path.to_str().unwrap_or("").len() + 1 > 1024 {
        return Err(anyhow::anyhow!(
            "the PATH is too long to persist using 'setx'. please shorten the PATH."
        ));
    }

    // Construct the new PATH string
    let new_path_env = format!("{};{}", current_path, new_path.display());

    // Execute the 'setx' command to persist the PATH
    let output = std::process::Command::new("setx")
        .arg("PATH")
        .arg(&new_path_env)
        .output()
        .map_err(|e| anyhow::anyhow!("failed to execute 'setx' command: {}", e))?;

    // Check if the 'setx' command was successful
    if output.status.success() {
        info!("persisted PATH on Windows using setx");
        Ok(())
    } else {
        // Capture the stderr output from 'setx' if the command fails
        let error_message = String::from_utf8_lossy(&output.stderr);
        Err(anyhow::anyhow!(
            "failed to persist PATH using 'setx': {}",
            error_message
        ))
    }
}

fn persist_path_unix(new_path: PathBuf) -> anyhow::Result<()> {
    let home_dir = env::var("HOME")?;
    let shell_config = get_shell_config()?;
    let shell_config_path = PathBuf::from(format!("{}/{}", home_dir, shell_config));

    let new_path_entry = format!("\nexport PATH=\"$PATH:{}\"\n", new_path.display());

    // Check if the new path is already in the config file
    if let Ok(config_content) = fs::read_to_string(&shell_config_path) {
        if config_content.contains(new_path.to_str().unwrap()) {
            info!("PATH is already persisted in {}", shell_config_path.display());
            return Ok(());
        }
    }

    // Create the config file if it doesn't exist
    if !shell_config_path.exists() {
        fs::File::create(&shell_config_path)?;
    }

    // Append the new path entry to the config file
    let mut file = fs::OpenOptions::new().append(true).open(&shell_config_path)?;
    file.write_all(new_path_entry.as_bytes())?;
    info!("persisted PATH in {}", shell_config_path.display());
    info!("please run 'source {}' or restart your shell to apply the changes.", shell_config_path.display());

    Ok(())
}

fn get_shell_config() -> anyhow::Result<&'static str> {
    let shell = env::var("SHELL").unwrap_or_default();
    if shell.contains("zsh") {
        Ok(".zshrc")
    } else if shell.contains("bash") {
        if cfg!(target_os = "macos") {
            Ok(".bash_profile")
        } else {
            Ok(".bashrc")
        }
    } else if shell.contains("fish") {
        Ok(".config/fish/config.fish")
    } else {
        Ok(".profile")
    }
}

// Add this function near the end of the file
async fn check_ffmpeg() -> anyhow::Result<()> {
    // TODO: this should also check if it can properly encode mp4 etc
    use tokio::process::Command;

    let output = Command::new("ffmpeg")
        .arg("-version")
        .output().await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("FFmpeg check failed: {}", stderr));
    }

    Ok(())
}
