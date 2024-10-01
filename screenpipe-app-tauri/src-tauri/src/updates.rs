use anyhow::Error;
use log::{error, info};
use std::sync::Arc;
use std::time::Duration;
use tauri::menu::{MenuItem, MenuItemBuilder};
use tauri::Wry;
use tauri_plugin_updater::UpdaterExt;
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
    pub fn new(app: &tauri::AppHandle, interval_hours: u64) -> Result<Self, Error> {
        Ok(Self {
            interval: Duration::from_secs(interval_hours * 3600),
            update_available: Arc::new(Mutex::new(false)),
            update_installed: Arc::new(Mutex::new(false)),
            app: app.clone(),
            update_menu_item: MenuItemBuilder::with_id("update_now", "Screenpipe is up to date")
                .enabled(false)
                .build(app)?,
        })
    }

    pub async fn check_for_updates(&self) -> Result<bool, Box<dyn std::error::Error>> {
        if let Some(update) = self.app.updater()?.check().await? {
            *self.update_available.lock().await = true;

            self.update_menu_item
                .set_text("Downloading Latest Version of Screenpipe")?;

            if let Some(tray) = self.app.tray_by_id("screenpipe_main") {
                if let Ok(image) = tauri::image::Image::from_path("icons/updates-white.png") {
                    if let Err(err) = tray.set_icon(Some(image)) {
                        error!("Problem setting icon: {}", err);
                    }
                }
            }

            update.download_and_install(|_, _| {}, || {}).await?;

            *self.update_installed.lock().await = true;
            self.update_menu_item.set_enabled(true)?;
            self.update_menu_item.set_text("Update Now")?;

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
                if let Err(e) = self.check_for_updates().await {
                    error!("Failed to check for updates: {}", e);
                }
            }
        }
    }
}

pub fn start_update_check(
    app: &tauri::AppHandle,
    interval_hours: u64,
) -> Result<Arc<UpdatesManager>, Box<dyn std::error::Error>> {
    let updates_manager = Arc::new(UpdatesManager::new(app, interval_hours)?);

    // Send initial event at boot
    tokio::spawn({
        let updates_manager = updates_manager.clone();
        async move {
            if let Err(e) = updates_manager.check_for_updates().await {
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
