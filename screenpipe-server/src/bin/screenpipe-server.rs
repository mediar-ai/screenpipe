use clap::Parser;
#[allow(unused_imports)]
use colored::Colorize;
use dirs::home_dir;
use futures::pin_mut;
use port_check::is_local_ipv4_port_free;
use screenpipe_audio::{
    audio_manager::AudioManagerBuilder,
    core::device::{default_input_device, default_output_device, parse_audio_device},
};
use screenpipe_core::find_ffmpeg_path;
use screenpipe_db::DatabaseManager;
use screenpipe_server::{
    analytics,
    cli::{Cli, Command},
    commands::{handle_audio_command, handle_mcp_command, handle_migrate_command, handle_pipe_command, handle_vision_command},
    display::{print_startup, DisplayConfig},
    handle_index_command, start_continuous_recording, watch_pid, PipeManager, ResourceMonitor, SCServer, VisionManager,
};
use screenpipe_vision::monitor::list_monitors;
use std::{
    env, fs,
    net::SocketAddr,
    net::{IpAddr, Ipv4Addr},
    path::PathBuf,
    sync::Arc,
    time::Duration,
};
use tokio::{runtime::Runtime, signal, sync::broadcast};
use tracing::{debug, error, info, warn};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{fmt, prelude::__tracing_subscriber_SubscriberExt, EnvFilter, Layer};

fn get_base_dir(custom_path: &Option<String>) -> anyhow::Result<PathBuf> {
    let default_path = home_dir()
        .ok_or_else(|| anyhow::anyhow!("failed to get home directory"))?
        .join(".screenpipe");
    let base_dir = custom_path.as_ref().map(PathBuf::from).unwrap_or(default_path);
    fs::create_dir_all(base_dir.join("data"))?;
    Ok(base_dir)
}

fn setup_logging(local_data_dir: &PathBuf, cli: &Cli) -> anyhow::Result<WorkerGuard> {
    let file_appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix("screenpipe")
        .filename_suffix("log")
        .max_log_files(5)
        .build(local_data_dir)?;

    let (file_writer, guard) = tracing_appender::non_blocking(file_appender);

    let make_env_filter = || {
        let filter = EnvFilter::from_default_env()
            .add_directive("tokio=debug".parse().unwrap())
            .add_directive("runtime=debug".parse().unwrap())
            .add_directive("info".parse().unwrap())
            .add_directive("tokenizers=error".parse().unwrap())
            .add_directive("rusty_tesseract=error".parse().unwrap())
            .add_directive("symphonia=error".parse().unwrap())
            .add_directive("hf_hub=error".parse().unwrap())
            .add_directive("whisper_rs=error".parse().unwrap());

        #[cfg(target_os = "windows")]
        let filter = filter
            .add_directive("xcap::platform::impl_window=off".parse().unwrap())
            .add_directive("xcap::platform::impl_monitor=off".parse().unwrap())
            .add_directive("xcap::platform::utils=off".parse().unwrap());

        let filter = env::var("SCREENPIPE_LOG")
            .unwrap_or_default()
            .split(',')
            .filter(|s| !s.is_empty())
            .fold(filter, |filter, directive| {
                match directive.parse() {
                    Ok(d) => filter.add_directive(d),
                    Err(e) => { eprintln!("warning: invalid log directive '{}': {}", directive, e); filter }
                }
            });

        if cli.debug { filter.add_directive("screenpipe=debug".parse().unwrap()) } else { filter }
    };

    let timer = tracing_subscriber::fmt::time::ChronoLocal::new("%Y-%m-%dT%H:%M:%S%.6fZ".to_string());

    let registry = tracing_subscriber::registry()
        .with(fmt::layer().with_writer(std::io::stdout).with_timer(timer.clone()).with_filter(make_env_filter()))
        .with(fmt::layer().with_writer(file_writer).with_timer(timer).with_filter(make_env_filter()));

    #[cfg(feature = "debug-console")]
    let registry = registry.with(
        console_subscriber::spawn().with_filter(
            EnvFilter::from_default_env()
                .add_directive("tokio=trace".parse().unwrap())
                .add_directive("runtime=trace".parse().unwrap()),
        ),
    );

    if !cli.disable_telemetry {
        registry.with(sentry::integrations::tracing::layer()).init();
    } else {
        registry.init();
    };

    Ok(guard)
}

#[tokio::main]
#[tracing::instrument]
async fn main() -> anyhow::Result<()> {
    debug!("starting screenpipe server");
    let cli = Cli::parse();

    // Initialize Sentry if telemetry enabled
    let _sentry_guard = if !cli.disable_telemetry {
        let append = env::var("SENTRY_RELEASE_NAME_APPEND").unwrap_or_default();
        let release = format!("{}{}", sentry::release_name!().unwrap_or_default(), append);
        Some(sentry::init(("https://123656092b01a72b0417355ebbfb471f@o4505591122886656.ingest.us.sentry.io/4510761360949248",
            sentry::ClientOptions { release: Some(release.into()), traces_sample_rate: 0.1, ..Default::default() })))
    } else { None };

    let local_data_dir = get_base_dir(&cli.data_dir)?;

    // Only log for text output commands
    let should_log = match &cli.command {
        Some(Command::Pipe { subcommand }) => {
            !matches!(subcommand,
                screenpipe_server::cli::PipeCommand::List { output: screenpipe_server::cli::OutputFormat::Json, .. } |
                screenpipe_server::cli::PipeCommand::Install { output: screenpipe_server::cli::OutputFormat::Json, .. } |
                screenpipe_server::cli::PipeCommand::Info { output: screenpipe_server::cli::OutputFormat::Json, .. }
            )
        }
        _ => true,
    };
    let _log_guard = if should_log { Some(setup_logging(&local_data_dir, &cli)?) } else { None };

    let pipe_manager = Arc::new(PipeManager::new(
        if cli.enable_pipe_manager { local_data_dir.clone() } else { PathBuf::from("") }
    ));

    // Handle subcommands
    if let Some(ref command) = cli.command {
        match command {
            Command::Audio { subcommand } => { handle_audio_command(subcommand).await?; return Ok(()); }
            Command::Vision { subcommand } => { handle_vision_command(subcommand).await?; return Ok(()); }
            Command::Completions { shell } => { cli.handle_completions(*shell)?; return Ok(()); }
            Command::Pipe { subcommand } => { handle_pipe_command(subcommand, &pipe_manager, cli.enable_pipe_manager).await?; return Ok(()); }
            Command::Migrate { migration_name, data_dir, subcommand, output, batch_size, batch_delay_ms, continue_on_error } => {
                let dir = get_base_dir(data_dir)?;
                handle_migrate_command(migration_name, dir, subcommand, output, *batch_size, *batch_delay_ms, *continue_on_error).await?;
                return Ok(());
            }
            Command::Add { path, output, data_dir, pattern, ocr_engine, metadata_override, copy_videos, debug, use_embedding } => {
                let dir = get_base_dir(data_dir)?;
                if *debug {
                    tracing::subscriber::set_global_default(
                        tracing_subscriber::registry()
                            .with(EnvFilter::from_default_env().add_directive("screenpipe=debug".parse().unwrap()))
                            .with(fmt::layer().with_writer(std::io::stdout)),
                    ).ok();
                }
                let db = Arc::new(DatabaseManager::new(&format!("{}/db.sqlite", dir.to_string_lossy())).await?);
                handle_index_command(dir, path.to_string(), pattern.clone(), db, output.clone(), ocr_engine.clone(), metadata_override.clone(), *copy_videos, *use_embedding).await?;
                return Ok(());
            }
            Command::Mcp { subcommand } => { handle_mcp_command(subcommand, &local_data_dir).await?; return Ok(()); }
        }
    }

    // Check ffmpeg
    if find_ffmpeg_path().is_none() && find_ffmpeg_path().is_none() {
        eprintln!("ffmpeg not found. please install ffmpeg manually.");
        std::process::exit(1);
    }

    if !is_local_ipv4_port_free(cli.port) {
        error!("port {} already in use - likely another screenpipe instance running", cli.port);
        return Err(anyhow::anyhow!("port already in use"));
    }

    let all_monitors = list_monitors().await;

    // Setup audio devices
    let mut audio_devices = Vec::new();
    let mut realtime_audio_devices = Vec::new();

    if !cli.disable_audio {
        if cli.audio_device.is_empty() {
            if let Ok(d) = default_input_device() { audio_devices.push(d.to_string()); }
            if let Ok(d) = default_output_device().await { audio_devices.push(d.to_string()); }
        } else {
            for d in &cli.audio_device {
                audio_devices.push(parse_audio_device(d).expect("failed to parse audio device").to_string());
            }
        }
        if audio_devices.is_empty() { warn!("no audio devices available"); }

        if cli.enable_realtime_audio_transcription {
            if cli.realtime_audio_device.is_empty() {
                if let Ok(d) = default_input_device() { realtime_audio_devices.push(Arc::new(d)); }
                if let Ok(d) = default_output_device().await { realtime_audio_devices.push(Arc::new(d)); }
            } else {
                for d in &cli.realtime_audio_device {
                    realtime_audio_devices.push(Arc::new(parse_audio_device(d).expect("failed to parse device")));
                }
            }
        }
    }

    let resource_monitor = ResourceMonitor::new(!cli.disable_telemetry);
    resource_monitor.start_monitoring(Duration::from_secs(30), Some(Duration::from_secs(60)));
    analytics::init(!cli.disable_telemetry);

    let db = Arc::new(DatabaseManager::new(&format!("{}/db.sqlite", local_data_dir.to_string_lossy())).await?);

    let monitor_ids: Vec<u32> = if cli.monitor_id.is_empty() {
        all_monitors.iter().map(|m| m.id()).collect()
    } else {
        cli.monitor_id.clone()
    };

    let languages = cli.unique_languages().unwrap();
    let fps = if cli.fps.is_finite() && cli.fps > 0.0 { cli.fps } else { 1.0 };
    let output_path = Arc::new(local_data_dir.join("data").to_string_lossy().into_owned());

    let (shutdown_tx, _) = broadcast::channel::<()>(1);
    let vision_runtime = Runtime::new().unwrap();
    let pipes_runtime = Runtime::new().unwrap();
    let vision_handle = vision_runtime.handle().clone();
    let pipes_handle = pipes_runtime.handle().clone();

    // Build audio manager
    let audio_manager = Arc::new(
        AudioManagerBuilder::new()
            .audio_chunk_duration(Duration::from_secs(cli.audio_chunk_duration))
            .vad_engine(cli.vad_engine.clone().into())
            .vad_sensitivity(cli.vad_sensitivity.clone().into())
            .languages(languages.clone())
            .transcription_engine(cli.audio_transcription_engine.clone().into())
            .realtime(cli.enable_realtime_audio_transcription)
            .enabled_devices(audio_devices.clone())
            .deepgram_api_key(cli.deepgram_api_key.clone())
            .output_path(PathBuf::from(output_path.to_string()))
            .build(db.clone())
            .await?
    );

    // Start recording - use VisionManager if --use-all-monitors is enabled
    let db_clone = db.clone();
    let output_path_clone = output_path.clone();
    let shutdown_tx_clone = shutdown_tx.clone();
    let monitor_ids_clone = monitor_ids.clone();
    let languages_clone = languages.clone();
    let ocr_engine: Arc<screenpipe_vision::OcrEngine> = Arc::new(cli.ocr_engine.clone().into());
    let ignored_windows = cli.ignored_windows.clone();
    let included_windows = cli.included_windows.clone();

    // Create VisionManager if use_all_monitors is enabled
    let vision_manager = if cli.use_all_monitors && !cli.disable_vision {
        let vm = Arc::new(VisionManager::new(
            db_clone.clone(),
            output_path_clone.clone(),
            fps,
            Duration::from_secs(cli.video_chunk_duration),
            ocr_engine.clone(),
            cli.use_pii_removal,
            ignored_windows.clone(),
            included_windows.clone(),
            languages_clone.clone(),
            cli.capture_unfocused_windows,
            false, // realtime_vision
        ));

        let vm_clone = vm.clone();
        let shutdown_tx_vm = shutdown_tx.clone();
        let vision_handle_vm = vision_handle.clone();
        tokio::spawn(async move {
            let mut shutdown_rx = shutdown_tx_vm.subscribe();
            tokio::select! {
                result = vm_clone.start(&vision_handle_vm) => {
                    if let Err(e) = result { error!("VisionManager error: {:?}", e); }
                }
                _ = shutdown_rx.recv() => { info!("VisionManager shutdown signal received"); }
            }
            let _ = vm_clone.stop().await;
        });

        Some(vm)
    } else {
        None
    };

    // Only use traditional recording if use_all_monitors is not enabled
    let handle = if vision_manager.is_none() {
        Some(tokio::spawn(async move {
            loop {
                let mut shutdown_rx = shutdown_tx_clone.subscribe();
                let recording = start_continuous_recording(
                    db_clone.clone(), output_path_clone.clone(), fps,
                    Duration::from_secs(cli.video_chunk_duration), ocr_engine.clone(),
                    monitor_ids_clone.clone(), cli.use_pii_removal, cli.disable_vision,
                    &vision_handle, &ignored_windows, &included_windows,
                    languages_clone.clone(), cli.capture_unfocused_windows,
                    cli.enable_realtime_audio_transcription,
                );
                tokio::select! {
                    result = recording => { if let Err(e) = result { error!("recording error: {:?}", e); } }
                    _ = shutdown_rx.recv() => { info!("shutdown signal received"); break; }
                }
            }
        }))
    } else {
        None
    };

    #[cfg(feature = "llm")]
    let _llm = if cli.enable_llm { Some(screenpipe_core::LLM::new(screenpipe_core::ModelName::Llama)?) } else { None };

    let server = SCServer::new(
        db.clone(),
        SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), cli.port),
        local_data_dir.clone(),
        pipe_manager.clone(),
        cli.disable_vision,
        cli.disable_audio,
        audio_manager.clone(),
        cli.enable_pipe_manager,
    );

    // Print startup display
    let pipes = pipe_manager.list_pipes().await;
    print_startup(DisplayConfig {
        fps: cli.fps,
        audio_chunk_duration: cli.audio_chunk_duration,
        video_chunk_duration: cli.video_chunk_duration,
        port: cli.port,
        realtime_audio: cli.enable_realtime_audio_transcription,
        audio_disabled: cli.disable_audio,
        vision_disabled: cli.disable_vision,
        audio_engine: format!("{:?}", cli.audio_transcription_engine),
        ocr_engine: format!("{:?}", cli.ocr_engine),
        vad_engine: format!("{:?}", cli.vad_engine),
        vad_sensitivity: format!("{:?}", cli.vad_sensitivity),
        data_dir: local_data_dir.display().to_string(),
        debug: cli.debug,
        telemetry: !cli.disable_telemetry,
        local_llm: cli.enable_llm,
        pii_removal: cli.use_pii_removal,
        ignored_windows: cli.ignored_windows.clone(),
        included_windows: cli.included_windows.clone(),
        frame_cache: cli.enable_frame_cache,
        unfocused_windows: cli.capture_unfocused_windows,
        auto_destruct_pid: cli.auto_destruct_pid,
        deepgram_key_set: cli.deepgram_api_key.is_some(),
        use_all_monitors: cli.use_all_monitors,
        languages: languages.iter().map(|l| format!("{}", l)).collect(),
        monitor_ids: monitor_ids.clone(),
        audio_devices: audio_devices.clone(),
        realtime_audio_devices: realtime_audio_devices.iter().map(|d| d.to_string()).collect(),
        pipes: pipes.iter().map(|p| (p.id.clone(), p.enabled)).collect(),
        use_cloud: matches!(cli.audio_transcription_engine, screenpipe_server::cli::CliAudioTranscriptionEngine::Deepgram)
            || matches!(cli.ocr_engine, screenpipe_server::cli::CliOcrEngine::Unstructured),
    });

    // Start audio after delay
    if !cli.disable_audio {
        let am = audio_manager.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(10)).await;
            am.start().await.unwrap();
        });
    }

    // Start enabled pipes
    info!("starting pipes");
    for pipe in pipe_manager.list_pipes().await {
        if !pipe.enabled { continue; }
        match pipe_manager.start_pipe_task(pipe.id.clone()).await {
            Ok(f) => { pipes_handle.spawn(f); }
            Err(e) => error!("failed to start pipe {}: {}", pipe.id, e),
        }
    }

    let server_future = server.start(cli.enable_frame_cache);
    pin_mut!(server_future);

    // Auto-destruct watcher
    if let Some(pid) = cli.auto_destruct_pid {
        info!("watching pid {} for auto-destruction", pid);
        let pm = pipe_manager.clone();
        let tx = shutdown_tx.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(5)).await;
            if watch_pid(pid).await {
                info!("watched pid {} stopped, shutting down", pid);
                let pipes: Vec<_> = pm.list_pipes().await.into_iter().filter(|p| p.enabled).collect();
                let stops = pipes.iter().map(|p| {
                    let pm = pm.clone();
                    let id = p.id.clone();
                    tokio::spawn(async move { pm.stop_pipe(&id).await.ok(); })
                });
                tokio::select! {
                    _ = futures::future::join_all(stops) => info!("pipes stopped"),
                    _ = tokio::time::sleep(Duration::from_secs(10)) => warn!("timeout stopping pipes"),
                }
                let _ = tx.send(());
            }
        });
    }

    let ctrl_c = signal::ctrl_c();
    pin_mut!(ctrl_c);

    // Use async block for optional handle
    let recording_future = async {
        if let Some(h) = handle {
            let _ = h.await;
            info!("recording completed");
        } else {
            // VisionManager is running, just wait forever (will be cancelled by shutdown)
            std::future::pending::<()>().await;
        }
    };
    pin_mut!(recording_future);

    tokio::select! {
        _ = &mut recording_future => {},
        result = &mut server_future => match result {
            Ok(_) => info!("server stopped"),
            Err(e) => error!("server error: {:?}", e),
        },
        _ = ctrl_c => {
            info!("ctrl+c received, shutting down");
            audio_manager.shutdown().await?;
            let _ = shutdown_tx.send(());
        }
    }

    tokio::task::block_in_place(|| {
        drop(pipes_runtime);
        drop(vision_runtime);
        drop(audio_manager);
    });

    info!("shutdown complete");
    Ok(())
}
