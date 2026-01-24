use crate::cli::{MigrationSubCommand, OutputFormat};
use screenpipe_db::{create_migration_worker, DatabaseManager, MigrationCommand, MigrationConfig, MigrationStatus};
use std::path::PathBuf;
use std::sync::Arc;
use tracing::{error, info};

pub async fn handle_migrate_command(
    migration_name: &str,
    local_data_dir: PathBuf,
    subcommand: &Option<MigrationSubCommand>,
    output: &OutputFormat,
    batch_size: i64,
    batch_delay_ms: u64,
    continue_on_error: bool,
) -> anyhow::Result<()> {
    // Initialize the database
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

    // Create a migration worker config
    let config = MigrationConfig::new(batch_size, batch_delay_ms, continue_on_error);

    // Start the migration worker
    let (cmd_tx, mut status_rx, worker_handle) = create_migration_worker(db, Some(config));

    // Process the specified subcommand or default to status
    let cmd = match subcommand {
        Some(MigrationSubCommand::Start) => MigrationCommand::Start,
        Some(MigrationSubCommand::Pause) => MigrationCommand::Pause,
        Some(MigrationSubCommand::Stop) => MigrationCommand::Stop,
        Some(MigrationSubCommand::Status) | None => MigrationCommand::Status,
    };

    // Send the command to the worker
    if let Err(e) = cmd_tx.send(cmd.clone()).await {
        error!("failed to send command to migration worker: {}", e);
        return Err(anyhow::anyhow!(
            "Failed to send command to migration worker"
        ));
    }

    // If the command is start, we need to track the progress
    if matches!(cmd, MigrationCommand::Start) {
        handle_start_command(&cmd_tx, &mut status_rx, migration_name, output).await?;
    } else {
        // For non-start commands, just get the status once
        if let Some(response) = status_rx.recv().await {
            match output {
                OutputFormat::Json => {
                    println!("{}", serde_json::to_string_pretty(&response.status)?);
                }
                OutputFormat::Text => {
                    info!("Migration status: {:?}", response.status);
                }
            }
        }
    }

    // If we explicitly stopped, wait for the worker to finish
    if matches!(cmd, MigrationCommand::Stop) {
        if let Err(e) = worker_handle.await {
            error!("error waiting for worker to finish: {}", e);
        }
    }

    Ok(())
}

async fn handle_start_command(
    cmd_tx: &tokio::sync::mpsc::Sender<MigrationCommand>,
    status_rx: &mut tokio::sync::mpsc::Receiver<screenpipe_db::MigrationResponse>,
    migration_name: &str,
    output: &OutputFormat,
) -> anyhow::Result<()> {
    // Send the start command and wait for the worker to acknowledge
    if let Some(response) = status_rx.recv().await {
        match output {
            OutputFormat::Json => {
                println!("{}", serde_json::to_string_pretty(&response.status)?);
            }
            OutputFormat::Text => {
                info!("Started migration: {}", migration_name);
                match response.status {
                    MigrationStatus::Running {
                        total_records,
                        processed_records,
                    } => {
                        info!(
                            "Processing records: {}/{} ({:.2}%)",
                            processed_records,
                            total_records,
                            if total_records > 0 {
                                (processed_records as f64 / total_records as f64) * 100.0
                            } else {
                                0.0
                            }
                        );
                    }
                    _ => {
                        info!("Migration status: {:?}", response.status);
                    }
                }
            }
        }
    }

    // Keep checking status periodically until migration completes, fails, or is stopped
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
    loop {
        interval.tick().await;

        // Send status command
        if let Err(e) = cmd_tx.send(MigrationCommand::Status).await {
            error!("failed to send status command: {}", e);
            break;
        }

        // Wait for response
        if let Some(response) = status_rx.recv().await {
            match output {
                OutputFormat::Json => {
                    println!("{}", serde_json::to_string_pretty(&response.status)?);
                }
                OutputFormat::Text => match &response.status {
                    MigrationStatus::Running {
                        total_records,
                        processed_records,
                    } => {
                        info!(
                            "Processing records: {}/{} ({:.2}%)",
                            processed_records,
                            total_records,
                            if *total_records > 0 {
                                (*processed_records as f64 / *total_records as f64) * 100.0
                            } else {
                                0.0
                            }
                        );
                    }
                    MigrationStatus::Completed {
                        total_records,
                        duration_secs,
                    } => {
                        info!(
                            "Migration completed: {} records processed in {} seconds",
                            total_records, duration_secs
                        );
                        break;
                    }
                    MigrationStatus::Paused {
                        total_records,
                        processed_records,
                    } => {
                        info!(
                            "Migration paused: {}/{} ({:.2}%)",
                            processed_records,
                            total_records,
                            if *total_records > 0 {
                                (*processed_records as f64 / *total_records as f64) * 100.0
                            } else {
                                0.0
                            }
                        );
                    }
                    MigrationStatus::Failed {
                        total_records,
                        processed_records,
                        error,
                    } => {
                        error!(
                            "Migration failed: {}/{} records processed. Error: {}",
                            processed_records, total_records, error
                        );
                        break;
                    }
                    _ => {
                        info!("Migration status: {:?}", response.status);
                    }
                },
            }
        } else {
            break;
        }
    }

    Ok(())
}
