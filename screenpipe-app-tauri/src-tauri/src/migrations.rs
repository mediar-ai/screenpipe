use crate::{get_base_dir, get_data_dir, kill_all_sreenpipes, SidecarState};
use std::fs;
use tauri::Emitter;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_store::StoreBuilder;
use tracing::{error, info};

pub const MIGRATION_20241204_KEY: &str = "migration_20241204_done";

pub async fn handle_database_migration(app: &AppHandle) -> Result<bool, String> {
    let store = {
        let base_dir = get_base_dir(app, None).expect("Failed to ensure local data directory");
        let path = base_dir.join("store.bin");
        StoreBuilder::new(app, path).build()
    };

    // Check if migration already done
    let migration_done = store
        .get(MIGRATION_20241204_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if migration_done {
        return Ok(false);
    }

    // Kill any running sidecar first
    if let Err(e) = kill_all_sreenpipes(app.state::<SidecarState>(), app.clone()).await {
        error!("Failed to kill sidecar during migration: {}", e);
    }

    // Show initial dialog
    let result = app.dialog()
        .message("screenpipe needs to upgrade your database. this may take a between 1 and 30 minutes and use more resources than usual.\n\nwould you like to create a backup first? if something goes wrong, you can restore your data by copying the backup file over the broken database and contacting louis@screenpi.pe")
        .title("database upgrade required")
        .buttons(MessageDialogButtons::YesNo)
        .blocking_show();

    // Create progress window
    let progress_window = tauri::WebviewWindowBuilder::new(
        app,
        "migration",
        tauri::WebviewUrl::App("migration".into()),
    )
    .title("database upgrade")
    .inner_size(400.0, 200.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .build()
    .map_err(|e| e.to_string())?;

    if result {
        // Yes - Backup and upgrade
        if let Some(path) = app.dialog().file().blocking_pick_folder() {
            // Get database path and create backup
            let data_dir = get_data_dir(app).unwrap();
            let db_path = data_dir.join("data").join("db.sqlite");
            let backup_file = path.as_path().unwrap().join("db.sqlite.backup");
            fs::copy(db_path, backup_file).unwrap();
            progress_window
                .emit("progress", "backup created...")
                .unwrap();

            // Create a channel for migration completion
            let (tx, mut rx) = tokio::sync::mpsc::channel(1);

            // Spawn sidecar and monitor its output
            let command = app.shell().sidecar("screenpipe").unwrap().arg("migrate");
            let (mut output_rx, _child) = command.spawn().map_err(|e| e.to_string())?;

            let progress_window = progress_window.clone();
            let tx_clone = tx.clone();
            tokio::spawn(async move {
                while let Some(event) = output_rx.recv().await {
                    if let CommandEvent::Stdout(line) = event {
                        let line = String::from_utf8_lossy(&line);
                        // Emit progress updates
                        progress_window.emit("progress", &line).unwrap();
                        if line.contains("migration completed successfully") {
                            let _ = tx_clone.send(()).await;
                            break;
                        }
                    }
                }
            });

            // Wait for migration completion or timeout
            match tokio::time::timeout(std::time::Duration::from_secs(300), rx.recv()).await {
                Ok(Some(_)) => {
                    info!("Migration completed successfully");
                    store.set(MIGRATION_20241204_KEY.to_string(), true);
                    store.save().unwrap();
                    Ok(true)
                }
                Ok(None) => Err("Migration channel closed unexpectedly".to_string()),
                Err(_) => Err("Migration timed out after 5 minutes".to_string()),
            }
        } else {
            Ok(false)
        }
    } else {
        // No - Upgrade without backup
        // Create a channel for migration completion
        let (tx, mut rx) = tokio::sync::mpsc::channel(1);

        // Spawn sidecar and monitor its output
        let command = app.shell().sidecar("screenpipe").unwrap().arg("migrate");
        let (mut output_rx, _child) = command.spawn().map_err(|e| e.to_string())?;

        let tx_clone = tx.clone();
        tokio::spawn(async move {
            while let Some(event) = output_rx.recv().await {
                if let CommandEvent::Stdout(line) = event {
                    let line = String::from_utf8_lossy(&line);
                    if line.contains("migration completed successfully") {
                        let _ = tx_clone.send(()).await;
                        break;
                    }
                }
            }
        });

        // Wait for migration completion or timeout
        match tokio::time::timeout(std::time::Duration::from_secs(300), rx.recv()).await {
            Ok(Some(_)) => {
                info!("Migration completed successfully");
                store.set(MIGRATION_20241204_KEY.to_string(), true);
                store.save().unwrap();
                Ok(true)
            }
            Ok(None) => Err("Migration channel closed unexpectedly".to_string()),
            Err(_) => Err("Migration timed out after 5 minutes".to_string()),
        }
    }
}
