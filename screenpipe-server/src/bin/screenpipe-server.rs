use clap::Parser;
#[allow(unused_imports)]
use colored::Colorize;
use dirs::home_dir;
use futures::pin_mut;
use port_check::is_local_ipv4_port_free;
use screenpipe_audio::{
    audio_manager::AudioManagerBuilder,
    core::device::{default_input_device, default_output_device, parse_audio_device, AudioDevice},
};
use screenpipe_core::find_ffmpeg_path;
use screenpipe_db::DatabaseManager;
use screenpipe_server::{
    analytics,
    cli::{Cli, Command},
    config::{RecordingConfig, ServerConfig, VisionConfig},
    display::{StartupDisplay, StartupDisplayConfig},
    handle_audio_command, handle_index_command, handle_mcp_command, handle_migrate_command,
    handle_pipe_command, handle_vision_command, start_continuous_recording, watch_pid,
    PipeManager, ResourceMonitor, SCServer,
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
use tracing_subscriber::{fmt, EnvFilter};
use tracing_subscriber::{prelude::__tracing_subscriber_SubscriberExt, Layer};

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
            .fold(filter, |filter, module_directive| {
                match module_directive.parse() {
                    Ok(directive) => filter.add_directive(directive),
                    Err(e) => {
                        eprintln!(
                            "warning: invalid log directive '{}': {}",
                            module_directive, e
                        );
                        filter
                    }
                }
            });

        if cli.debug {
            filter.add_directive("screenpipe=debug".parse().unwrap())
        } else {
            filter
        }
    };

    let timer =
        tracing_subscriber::fmt::time::ChronoLocal::new("%Y-%m-%dT%H:%M:%S%.6fZ".to_string());

    let tracing_registry = tracing_subscriber::registry()
        .with(
            fmt::layer()
                .with_writer(std::io::stdout)
                .with_timer(timer.clone())
                .with_filter(make_env_filter()),
        )
        .with(
            fmt::layer()
                .with_writer(file_writer)
                .with_timer(timer)
                .with_filter(make_env_filter()),
        );

    #[cfg(feature = "debug-console")]
    let tracing_registry = tracing_registry.with(
        console_subscriber::spawn().with_filter(
            EnvFilter::from_default_env()
                .add_directive("tokio=trace".parse().unwrap())
                .add_directive("runtime=trace".parse().unwrap()),
        ),
    );

    if !cli.disable_telemetry {
        tracing_registry
            .with(sentry::integrations::tracing::layer())
            .init();
    } else {
        tracing_registry.init();
    };

    Ok(guard)
}

fn should_log(cli: &Cli) -> bool {
    use screenpipe_server::cli::{OutputFormat, PipeCommand};

    match &cli.command {
        Some(Command::Pipe { subcommand }) => {
            matches!(
                subcommand,
                PipeCommand::List {
                    output: OutputFormat::Text,
                    ..
                } | PipeCommand::Install {
                    output: OutputFormat::Text,
                    ..
                } | PipeCommand::Info {
                    output: OutputFormat::Text,
                    ..
                } | PipeCommand::Enable { .. }
                    | PipeCommand::Disable { .. }
                    | PipeCommand::Update { .. }
                    | PipeCommand::Purge { .. }
                    | PipeCommand::Delete { .. }
            )
        }
        Some(Command::Add {
            output: screenpipe_server::cli::OutputFormat::Text,
            ..
        }) => true,
        Some(Command::Migrate {
            output: screenpipe_server::cli::OutputFormat::Text,
            ..
        }) => true,
        _ => true,
    }
}

async fn handle_commands(cli: &Cli, local_data_dir: &PathBuf, pipe_manager: &Arc<PipeManager>) -> anyhow::Result<bool> {
    if let Some(ref command) = cli.command {
        match command {
            Command::Audio { subcommand } => {
                handle_audio_command(subcommand).await?;
                return Ok(true);
            }
            Command::Vision { subcommand } => {
                handle_vision_command(subcommand).await?;
                return Ok(true);
            }
            Command::Completions { shell } => {
                cli.handle_completions(*shell)?;
                return Ok(true);
            }
            Command::Pipe { subcommand } => {
                handle_pipe_command(subcommand, pipe_manager, cli.enable_pipe_manager).await?;
                return Ok(true);
            }
            Command::Migrate {
                migration_name,
                data_dir,
                subcommand,
                output,
                batch_size,
                batch_delay_ms,
                continue_on_error,
            } => {
                let data_dir = get_base_dir(data_dir)?;
                handle_migrate_command(
                    migration_name,
                    data_dir,
                    subcommand,
                    output,
                    *batch_size,
                    *batch_delay_ms,
                    *continue_on_error,
                )
                .await?;
                return Ok(true);
            }
            Command::Add {
                path,
                output,
                data_dir,
                pattern,
                ocr_engine,
                metadata_override,
                copy_videos,
                debug,
                use_embedding,
            } => {
                let local_data_dir = get_base_dir(data_dir)?;

                if *debug {
                    tracing::subscriber::set_global_default(
                        tracing_subscriber::registry()
                            .with(
                                EnvFilter::from_default_env()
                                    .add_directive("screenpipe=debug".parse().unwrap()),
                            )
                            .with(fmt::layer().with_writer(std::io::stdout)),
                    )
                    .ok();
                    debug!("debug logging enabled");
                }

                let db = Arc::new(
                    DatabaseManager::new(&format!(
                        "{}/db.sqlite",
                        local_data_dir.to_string_lossy()
                    ))
                    .await
                    .map_err(|e| {
                        error!("failed to initialize database: {:?}", e);
                        e
                    })?,
                );
                handle_index_command(
                    local_data_dir,
                    path.to_string(),
                    pattern.clone(),
                    db,
                    output.clone(),
                    ocr_engine.clone(),
                    metadata_override.clone(),
                    *copy_videos,
                    *use_embedding,
                )
                .await?;
                return Ok(true);
            }
            Command::Mcp { subcommand } => {
                handle_mcp_command(subcommand, local_data_dir).await?;
                return Ok(true);
            }
        }
    }
    Ok(false)
}

async fn setup_audio_devices(cli: &Cli) -> (Vec<String>, Vec<Arc<AudioDevice>>) {
    let mut audio_devices = Vec::new();
    let mut realtime_audio_devices = Vec::new();

    if !cli.disable_audio {
        if cli.audio_device.is_empty() {
            if let Ok(input_device) = default_input_device() {
                audio_devices.push(input_device.to_string());
            }
            if let Ok(output_device) = default_output_device().await {
                audio_devices.push(output_device.to_string());
            }
        } else {
            for d in &cli.audio_device {
                let device = parse_audio_device(d).expect("failed to parse audio device");
                audio_devices.push(device.to_string());
            }
        }

        if audio_devices.is_empty() {
            warn!("no audio devices available.");
        }

        if cli.enable_realtime_audio_transcription {
            if cli.realtime_audio_device.is_empty() {
                if let Ok(input_device) = default_input_device() {
                    realtime_audio_devices.push(Arc::new(input_device.clone()));
                }
                if let Ok(output_device) = default_output_device().await {
                    realtime_audio_devices.push(Arc::new(output_device.clone()));
                }
            } else {
                for d in &cli.realtime_audio_device {
                    let device = parse_audio_device(d).expect("failed to parse audio device");
                    realtime_audio_devices.push(Arc::new(device.clone()));
                }
            }

            if realtime_audio_devices.is_empty() {
                eprintln!("no realtime audio devices available. realtime audio transcription will be disabled.");
            }
        }
    }

    (audio_devices, realtime_audio_devices)
}

#[tokio::main]
#[tracing::instrument]
async fn main() -> anyhow::Result<()> {
    debug!("starting screenpipe server");
    let cli = Cli::parse();

    // Initialize Sentry only if telemetry is enabled
    let _sentry_guard = if !cli.disable_telemetry {
        let sentry_release_name_append = env::var("SENTRY_RELEASE_NAME_APPEND").unwrap_or_default();
        let release_name = format!(
            "{}{}",
            sentry::release_name!().unwrap_or_default(),
            sentry_release_name_append
        );
        Some(sentry::init((
            "https://123656092b01a72b0417355ebbfb471f@o4505591122886656.ingest.us.sentry.io/4510761360949248",
            sentry::ClientOptions {
                release: Some(release_name.into()),
                traces_sample_rate: 0.1,
                ..Default::default()
            }
        )))
    } else {
        None
    };

    let local_data_dir = get_base_dir(&cli.data_dir)?;

    // Store the guard in a variable that lives for the entire main function
    let _log_guard = if should_log(&cli) {
        Some(setup_logging(&local_data_dir, &cli)?)
    } else {
        None
    };

    let pipe_manager = if cli.enable_pipe_manager {
        Arc::new(PipeManager::new(local_data_dir.clone()))
    } else {
        Arc::new(PipeManager::new(PathBuf::from("")))
    };

    // Handle subcommands early
    if handle_commands(&cli, &local_data_dir, &pipe_manager).await? {
        return Ok(());
    }

    // Check ffmpeg
    if find_ffmpeg_path().is_none() {
        if find_ffmpeg_path().is_none() {
            eprintln!("ffmpeg not found and installation failed. please install ffmpeg manually.");
            std::process::exit(1);
        }
    }

    // Check port availability
    if !is_local_ipv4_port_free(cli.port) {
        error!(
            "you're likely already running screenpipe instance in a different environment, e.g. terminal/ide, close it and restart or use different port"
        );
        return Err(anyhow::anyhow!("port already in use"));
    }

    // Setup monitors
    let all_monitors = list_monitors().await;
    let monitor_ids = if cli.monitor_id.is_empty() {
        all_monitors.iter().map(|m| m.id()).collect::<Vec<_>>()
    } else {
        cli.monitor_id.clone()
    };

    // Setup audio devices
    let (audio_devices, realtime_audio_devices) = setup_audio_devices(&cli).await;
    let audio_devices_clone = audio_devices.clone();
    let realtime_audio_devices_strings: Vec<String> = realtime_audio_devices
        .iter()
        .map(|d| d.to_string())
        .collect();

    // Start resource monitoring
    let resource_monitor = ResourceMonitor::new(!cli.disable_telemetry);
    resource_monitor.start_monitoring(Duration::from_secs(30), Some(Duration::from_secs(60)));

    // Initialize analytics
    analytics::init(!cli.disable_telemetry);

    // Initialize database
    let db = Arc::new(
        DatabaseManager::new(&format!("{}/db.sqlite", local_data_dir.to_string_lossy()))
            .await
            .map_err(|e| {
                eprintln!("failed to initialize database: {:?}", e);
                e
            })?,
    );

    // Get languages
    let languages = cli.unique_languages().unwrap();

    // Build configs
    let recording_config = RecordingConfig::new(
        cli.fps,
        Duration::from_secs(cli.video_chunk_duration),
        local_data_dir.join("data"),
        cli.use_pii_removal,
        languages.clone(),
    );

    let vision_config = VisionConfig::new(
        !cli.disable_vision,
        monitor_ids.clone(),
        Arc::new(cli.ocr_engine.clone().into()),
        cli.ignored_windows.clone(),
        cli.included_windows.clone(),
        cli.capture_unfocused_windows,
        cli.enable_realtime_audio_transcription,
    );

    let _server_config = ServerConfig::new(
        cli.port,
        !cli.disable_telemetry,
        cli.enable_frame_cache,
        cli.enable_pipe_manager,
        cli.auto_destruct_pid,
    );

    // Setup shutdown channel
    let (shutdown_tx, _) = broadcast::channel::<()>(1);

    // Create runtimes
    let vision_runtime = Runtime::new().unwrap();
    let pipes_runtime = Runtime::new().unwrap();
    let vision_handle = vision_runtime.handle().clone();
    let pipes_handle = pipes_runtime.handle().clone();

    // Build audio manager
    let audio_chunk_duration = Duration::from_secs(cli.audio_chunk_duration);
    let mut audio_manager_builder = AudioManagerBuilder::new()
        .audio_chunk_duration(audio_chunk_duration)
        .vad_engine(cli.vad_engine.clone().into())
        .vad_sensitivity(cli.vad_sensitivity.clone().into())
        .languages(languages.clone())
        .transcription_engine(cli.audio_transcription_engine.clone().into())
        .realtime(cli.enable_realtime_audio_transcription)
        .enabled_devices(audio_devices)
        .deepgram_api_key(cli.deepgram_api_key.clone())
        .output_path(PathBuf::from(recording_config.output_path_str()));

    let audio_manager = match audio_manager_builder.build(db.clone()).await {
        Ok(manager) => Arc::new(manager),
        Err(e) => {
            error!("{e}");
            return Ok(());
        }
    };

    // Start continuous recording
    let db_clone = Arc::clone(&db);
    let output_path_clone = Arc::new(recording_config.output_path_str());
    let shutdown_tx_clone = shutdown_tx.clone();
    let recording_config_clone = recording_config.clone();
    let vision_config_clone = vision_config.clone();

    let handle = {
        let runtime = &tokio::runtime::Handle::current();
        runtime.spawn(async move {
            loop {
                let mut shutdown_rx = shutdown_tx_clone.subscribe();
                let recording_future = start_continuous_recording(
                    db_clone.clone(),
                    output_path_clone.clone(),
                    recording_config_clone.fps,
                    recording_config_clone.video_chunk_duration,
                    vision_config_clone.ocr_engine.clone(),
                    vision_config_clone.monitor_ids.clone(),
                    recording_config_clone.use_pii_removal,
                    !vision_config_clone.enabled,
                    &vision_handle,
                    &vision_config_clone.ignored_windows,
                    &vision_config_clone.included_windows,
                    recording_config_clone.languages.clone(),
                    vision_config_clone.capture_unfocused_windows,
                    vision_config_clone.enable_realtime,
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
        })
    };

    #[cfg(feature = "llm")]
    debug!("LLM initializing");

    #[cfg(feature = "llm")]
    let _llm = {
        match cli.enable_llm {
            true => Some(screenpipe_core::LLM::new(
                screenpipe_core::ModelName::Llama,
            )?),
            false => None,
        }
    };

    #[cfg(feature = "llm")]
    debug!("LLM initialized");

    // Create server
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
    let display_config = StartupDisplayConfig {
        fps: cli.fps,
        audio_chunk_duration: cli.audio_chunk_duration,
        video_chunk_duration: cli.video_chunk_duration,
        port: cli.port,
        enable_realtime_audio_transcription: cli.enable_realtime_audio_transcription,
        disable_audio: cli.disable_audio,
        disable_vision: cli.disable_vision,
        audio_transcription_engine: &cli.audio_transcription_engine,
        ocr_engine: &cli.ocr_engine,
        vad_engine: &cli.vad_engine,
        vad_sensitivity: &cli.vad_sensitivity,
        data_dir: &local_data_dir,
        debug: cli.debug,
        disable_telemetry: cli.disable_telemetry,
        enable_llm: cli.enable_llm,
        use_pii_removal: cli.use_pii_removal,
        ignored_windows: &cli.ignored_windows,
        included_windows: &cli.included_windows,
        enable_frame_cache: cli.enable_frame_cache,
        capture_unfocused_windows: cli.capture_unfocused_windows,
        auto_destruct_pid: cli.auto_destruct_pid,
        deepgram_api_key: &cli.deepgram_api_key,
        languages: &languages,
        monitor_ids: &monitor_ids,
        audio_devices: &audio_devices_clone,
        realtime_audio_devices: &realtime_audio_devices_strings,
        pipes: &pipes,
    };
    StartupDisplay::new(display_config).print();

    // Start audio recording after display
    if !cli.disable_audio {
        let audio_manager_clone = audio_manager.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(10)).await;
            audio_manager_clone.start().await.unwrap();
        });
    }

    // Start pipes
    info!("starting pipes");
    let pipes = pipe_manager.list_pipes().await;
    for pipe in pipes {
        debug!("pipe: {:?}", pipe.id);
        if !pipe.enabled {
            debug!("pipe {} is disabled, skipping", pipe.id);
            continue;
        }
        match pipe_manager.start_pipe_task(pipe.id.clone()).await {
            Ok(future) => {
                pipes_handle.spawn(future);
            }
            Err(e) => {
                error!("failed to start pipe {}: {}", pipe.id, e);
            }
        }
    }

    let server_future = server.start(cli.enable_frame_cache);
    pin_mut!(server_future);

    // Add auto-destruct watcher
    if let Some(pid) = cli.auto_destruct_pid {
        info!("watching pid {} for auto-destruction", pid);
        let shutdown_tx_clone = shutdown_tx.clone();
        let pipe_manager_clone = pipe_manager.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(5)).await;
            if watch_pid(pid).await {
                info!("Watched pid ({}) has stopped, initiating shutdown", pid);

                let pipes = pipe_manager_clone.list_pipes().await;
                let enabled_pipes: Vec<_> = pipes.into_iter().filter(|p| p.enabled).collect();
                let stop_futures = enabled_pipes.iter().map(|pipe| {
                    let pipe_manager = pipe_manager_clone.clone();
                    let pipe_id = pipe.id.clone();
                    tokio::spawn(async move {
                        if let Err(e) = pipe_manager.stop_pipe(&pipe_id).await {
                            error!("failed to stop pipe {}: {}", pipe_id, e);
                        }
                    })
                });

                let timeout = tokio::time::sleep(Duration::from_secs(10));
                tokio::pin!(timeout);
                tokio::select! {
                    _ = futures::future::join_all(stop_futures) => {
                        info!("all pipes stopped successfully");
                    }
                    _ = &mut timeout => {
                        warn!("timeout waiting for pipes to stop");
                    }
                }
                let _ = shutdown_tx_clone.send(());
            }
        });
    }

    let ctrl_c_future = signal::ctrl_c();
    pin_mut!(ctrl_c_future);

    tokio::select! {
        _ = handle => info!("recording completed"),
        result = &mut server_future => {
            match result {
                Ok(_) => info!("server stopped normally"),
                Err(e) => error!("server stopped with error: {:?}", e),
            }
        }
        _ = ctrl_c_future => {
            info!("received ctrl+c, initiating shutdown");
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
