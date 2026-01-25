use crate::cli::{MigrationSubCommand, OutputFormat};
use screenpipe_db::{create_migration_worker, DatabaseManager, MigrationCommand, MigrationConfig, MigrationStatus};
use std::path::PathBuf;
use std::sync::Arc;
use tracing::{error, info};

pub async fn handle_migrate_command(
    name: &str, dir: PathBuf, subcmd: &Option<MigrationSubCommand>,
    output: &OutputFormat, batch_size: i64, delay_ms: u64, continue_on_error: bool,
) -> anyhow::Result<()> {
    let db = Arc::new(DatabaseManager::new(&format!("{}/db.sqlite", dir.display())).await?);
    let (tx, mut rx, handle) = create_migration_worker(db, Some(MigrationConfig::new(batch_size, delay_ms, continue_on_error)));

    let cmd = match subcmd {
        Some(MigrationSubCommand::Start) => MigrationCommand::Start,
        Some(MigrationSubCommand::Pause) => MigrationCommand::Pause,
        Some(MigrationSubCommand::Stop) => MigrationCommand::Stop,
        _ => MigrationCommand::Status,
    };

    tx.send(cmd.clone()).await?;

    if matches!(cmd, MigrationCommand::Start) {
        if let Some(r) = rx.recv().await {
            log_status(&r.status, output, name);
        }
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
        loop {
            interval.tick().await;
            if tx.send(MigrationCommand::Status).await.is_err() { break; }
            match rx.recv().await {
                Some(r) => {
                    log_status(&r.status, output, name);
                    if matches!(r.status, MigrationStatus::Completed { .. } | MigrationStatus::Failed { .. }) { break; }
                }
                None => break,
            }
        }
    } else if let Some(r) = rx.recv().await {
        log_status(&r.status, output, name);
    }

    if matches!(cmd, MigrationCommand::Stop) { let _ = handle.await; }
    Ok(())
}

fn log_status(status: &MigrationStatus, output: &OutputFormat, name: &str) {
    match output {
        OutputFormat::Json => { let _ = println!("{}", serde_json::to_string_pretty(status).unwrap_or_default()); }
        OutputFormat::Text => match status {
            MigrationStatus::Running { total_records: t, processed_records: p } =>
                info!("{}: {}/{} ({:.1}%)", name, p, t, if *t > 0 { *p as f64 / *t as f64 * 100.0 } else { 0.0 }),
            MigrationStatus::Completed { total_records: t, duration_secs: d } =>
                info!("completed: {} records in {}s", t, d),
            MigrationStatus::Failed { error, .. } => error!("failed: {}", error),
            s => info!("{:?}", s),
        }
    }
}
