use crate::kill_all_sreenpipes;
use crate::SidecarState;
use anyhow::Error;
use log::{error, info};
use std::sync::Arc;
use std::time::Duration;
use tauri::menu::{MenuItem, MenuItemBuilder};
use tauri::{Manager, Wry};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_dialog::MessageDialogButtons;
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::oneshot;
use tokio::sync::Mutex;
use tokio::time::interval;

pub struct UpdatesManager {
    interval: Duration,
    update_available: Arc<Mutex<bool>>,
    app: tauri::AppHandle,
    update_menu_item: MenuItem<Wry>,
    update_installed: Arc<Mutex<bool>>,
}

impl UpdatesManager {
    pub fn new(app: &tauri::AppHandle, interval_minutes: u64) -> Result<Self, Error> {
        Ok(Self {
            interval: Duration::from_secs(interval_minutes * 60),
            update_available: Arc::new(Mutex::new(false)),
            update_installed: Arc::new(Mutex::new(false)),
            app: app.clone(),
            update_menu_item: MenuItemBuilder::with_id("update_now", "screenpipe is up to date")
                .enabled(false)
                .build(app)?,
        })
    }

    pub async fn check_for_updates(
        &self,
        show_dialog: bool,
    ) -> Result<bool, Box<dyn std::error::Error>> {
        if let Some(update) = self.app.updater()?.check().await? {
            *self.update_available.lock().await = true;

            #[cfg(target_os = "windows")]
            {
                self.update_menu_item.set_enabled(true)?;
                self.update_menu_item.set_text("update now")?;
            }

            #[cfg(not(target_os = "windows"))]
            {
                self.update_menu_item.set_enabled(false)?;
                self.update_menu_item
                    .set_text("downloading latest version of screenpipe")?;
            }

            if let Some(tray) = self.app.tray_by_id("screenpipe_main") {
                let path = self.app.path().resolve(
                    "assets/update-logo-black.png",
                    tauri::path::BaseDirectory::Resource,
                )?;

                if let Ok(image) = tauri::image::Image::from_path(path) {
                    tray.set_icon(Some(image))?;
                    tray.set_icon_as_template(true)?;
                }
            }

            #[cfg(not(target_os = "windows"))]
            {
                update.download_and_install(|_, _| {}, || {}).await?;
                *self.update_installed.lock().await = true;
                self.update_menu_item.set_enabled(true)?;
                self.update_menu_item.set_text("update now")?;
            }

            if show_dialog {
                let (tx, rx) = oneshot::channel();
                let update_dialog = self
                    .app
                    .dialog()
                    .message("update available")
                    .title("screenpipe update")
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "update now".to_string(),
                        "later".to_string(),
                    ))
                    .parent(&self.app.get_webview_window("main").unwrap());

                update_dialog.show(move |answer| {
                    let _ = tx.send(answer);
                });

                if rx.await? {
                    #[cfg(target_os = "windows")]
                    {
                        use crate::llm_sidecar::stop_ollama_sidecar;

                        self.update_menu_item.set_enabled(false)?;
                        self.update_menu_item
                            .set_text("downloading latest version of screenpipe")?;

                        if let Err(err) =
                            kill_all_sreenpipes(self.app.state::<SidecarState>(), self.app.clone())
                                .await
                        {
                            error!("Failed to kill sidecar: {}", err);
                        }
                        // llm sidecar only need to kill in windows
                        if let Err(err) = stop_ollama_sidecar(self.app.clone()).await {
                            error!("Failed to stop ollama: {}", err);
                        }

                        update.download_and_install(|_, _| {}, || {}).await?;
                        *self.update_installed.lock().await = true;

                        self.update_menu_item.set_enabled(true)?;
                        self.update_menu_item.set_text("update now")?;
                    }
                    // Proceed with the update

                    // i think it shouldn't kill if we're in dev mode (on macos, windows need to kill)
                    // bad UX: i use CLI and it kills my CLI because i updated app

                    #[cfg(not(target_os = "windows"))]
                    {
                        if let Err(err) =
                            kill_all_sreenpipes(self.app.state::<SidecarState>(), self.app.clone())
                                .await
                        {
                            error!("Failed to kill sidecar: {}", err);
                        }
                    }
                    self.update_screenpipe();
                }
            }

            return Result::Ok(true);
        }

        Result::Ok(false)
    }

    pub fn update_now_menu_item_ref(&self) -> &MenuItem<Wry> {
        &self.update_menu_item
    }

    pub fn update_screenpipe(&self) -> Option<Error> {
        self.app.restart();
    }

    pub async fn start_periodic_event(&self) {
        let mut interval = interval(self.interval);

        loop {
            interval.tick().await;
            if !*self.update_available.lock().await {
                if let Err(e) = self.check_for_updates(true).await {
                    error!("Failed to check for updates: {}", e);
                }
            }
        }
    }
}

pub fn start_update_check(
    app: &tauri::AppHandle,
    interval_minutes: u64,
) -> Result<Arc<UpdatesManager>, Box<dyn std::error::Error>> {
    let updates_manager = Arc::new(UpdatesManager::new(app, interval_minutes)?);

    // Check for updates at boot
    tokio::spawn({
        let updates_manager = updates_manager.clone();
        async move {
            if let Err(e) = updates_manager.check_for_updates(false).await {
                error!("Failed to check for updates: {}", e);
            }
            info!("Update check started");
        }
    });

    // Start periodic events
    tokio::spawn({
        let updates_manager = updates_manager.clone();
        async move {
            updates_manager.start_periodic_event().await;
        }
    });

    Ok(updates_manager)
}
