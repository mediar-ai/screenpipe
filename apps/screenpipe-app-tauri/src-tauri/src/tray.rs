use crate::commands::show_main_window;
use crate::health::{get_recording_status, RecordingStatus};
use crate::recording::RecordingState;
use crate::store::{get_store, OnboardingStore};
use crate::updates::is_source_build;
use crate::window_api::ShowRewindWindow;
use anyhow::Result;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::Emitter;
use tauri::{
    menu::{MenuBuilder, MenuItem, MenuItemBuilder, PredefinedMenuItem},
    AppHandle, Manager, Wry,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;

use tracing::{debug, error, info};

/// Flag set by the "quit screenpipe" menu item so that the ExitRequested
/// handler in main.rs knows this is an intentional quit (not just a window close).
pub static QUIT_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Global storage for the update menu item so we can recreate the tray
/// without needing to pass the update_item through every call chain.
static UPDATE_MENU_ITEM: Lazy<Mutex<Option<MenuItem<Wry>>>> = Lazy::new(|| Mutex::new(None));

// Track last known state to avoid unnecessary updates
static LAST_MENU_STATE: Lazy<Mutex<MenuState>> = Lazy::new(|| Mutex::new(MenuState::default()));

#[derive(Default, PartialEq, Clone)]
struct MenuState {
    shortcuts: HashMap<String, String>,
    recording_status: Option<RecordingStatus>,
    onboarding_completed: bool,
    has_permission_issue: bool,
}

pub fn setup_tray(app: &AppHandle, update_item: &tauri::menu::MenuItem<Wry>) -> Result<()> {
    // Store update_item globally so recreate_tray can use it
    if let Ok(mut guard) = UPDATE_MENU_ITEM.lock() {
        *guard = Some(update_item.clone());
    }

    if let Some(main_tray) = app.tray_by_id("screenpipe_main") {
        // Initial menu setup with empty state
        let menu = create_dynamic_menu(app, &MenuState::default(), update_item)?;
        main_tray.set_menu(Some(menu))?;

        // Setup click handlers
        setup_tray_click_handlers(&main_tray)?;

        // Set autosaveName so macOS remembers position after user Cmd+drags it
        set_autosave_name();

        // Start menu updater
        setup_tray_menu_updater(app.clone(), update_item);
    }
    Ok(())
}

/// Destroy and recreate the tray icon to get a fresh rightmost position.
/// On MacBook Pro models with a notch, the tray icon can get pushed behind
/// the notch when there are many status bar items. Recreating it assigns
/// the rightmost (most visible) position.
///
/// IMPORTANT: NSStatusBar operations must happen on the main thread.
/// This function dispatches the work to the main thread automatically.
pub fn recreate_tray(app: &AppHandle) {
    let app_for_thread = app.clone();
    let _ = app.run_on_main_thread(move || {
        let app = app_for_thread;
        let update_item = match UPDATE_MENU_ITEM.lock() {
            Ok(guard) => guard.clone(),
            Err(_) => {
                error!("failed to lock UPDATE_MENU_ITEM for tray recreation");
                return;
            }
        };

        let update_item = match update_item {
            Some(item) => item,
            None => {
                debug!("update_item not yet stored, skipping tray recreation");
                return;
            }
        };

        // Remove the old tray icon (must be on main thread for NSStatusBar)
        let _old = app.remove_tray_by_id("screenpipe_main");
        // Drop the old tray icon explicitly on main thread
        drop(_old);

        // Create a new tray icon — macOS assigns it the rightmost position
        let icon = match app.path().resolve("assets/screenpipe-logo-tray-white.png", tauri::path::BaseDirectory::Resource) {
            Ok(path) => tauri::image::Image::from_path(path).ok(),
            Err(_) => tauri::image::Image::from_path("assets/screenpipe-logo-tray-white.png").ok(),
        };

        let mut builder = TrayIconBuilder::<Wry>::with_id("screenpipe_main")
            .icon_as_template(true)
            .show_menu_on_left_click(true);

        if let Some(icon) = icon {
            builder = builder.icon(icon);
        } else {
            error!("failed to load tray icon for recreation");
        }

        match builder.build(&app) {
            Ok(new_tray) => {
                // Setup menu
                if let Ok(menu) = create_dynamic_menu(&app, &MenuState::default(), &update_item) {
                    let _ = new_tray.set_menu(Some(menu));
                }
                // NOTE: do NOT re-register click handlers here.
                // The handler from setup_tray() is keyed by tray ID and persists
                // across tray icon recreation. Re-registering causes double-firing.

                // Set autosaveName so macOS remembers user's Cmd+drag position
                set_autosave_name();

                info!("tray icon recreated at rightmost position");
            }
            Err(e) => {
                error!("failed to recreate tray icon: {}", e);
            }
        }
    });
}

fn set_autosave_name() {
    // no-op: removed due to crash from objc interop
}

fn create_dynamic_menu(
    app: &AppHandle,
    _state: &MenuState,
    update_item: &tauri::menu::MenuItem<Wry>,
) -> Result<tauri::menu::Menu<Wry>> {
    let store = get_store(app, None)?;
    let mut menu_builder = MenuBuilder::new(app);

    // Check if onboarding is completed
    let onboarding_completed = OnboardingStore::get(app)
        .ok()
        .flatten()
        .map(|o| o.is_completed)
        .unwrap_or(false);

    // During onboarding: show minimal menu (version + quit only)
    if !onboarding_completed {
        menu_builder = menu_builder
            .item(
                &MenuItemBuilder::with_id("version", format!("version {}", app.package_info().version))
                    .enabled(false)
                    .build(app)?,
            )
            .item(&PredefinedMenuItem::separator(app)?)
            .item(&MenuItemBuilder::with_id("quit", "quit screenpipe").build(app)?);

        return menu_builder.build().map_err(Into::into);
    }

    // Full menu after onboarding is complete
    // Get the show shortcut from store (must match frontend defaults in use-settings.tsx)
    let default_shortcut = if cfg!(target_os = "windows") {
        "Alt+S"
    } else {
        "Control+Super+S"
    };
    let show_shortcut = store
        .get("showScreenpipeShortcut")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| default_shortcut.to_string());

    // Show item with formatted shortcut in label
    menu_builder = menu_builder.item(
        &MenuItemBuilder::with_id(
            "show",
            format!("show screenpipe ({})", format_shortcut(&show_shortcut)),
        )
        .build(app)?,
    );

    // Recording status indicator
    let status_text = match get_recording_status() {
        RecordingStatus::Starting => "○ starting…",
        RecordingStatus::Recording => "● recording",
        RecordingStatus::Stopped => "○ stopped",
        RecordingStatus::Error => "○ error",
    };
    menu_builder = menu_builder.item(
        &MenuItemBuilder::with_id("recording_status", status_text)
            .enabled(false)
            .build(app)?,
    );

    // Show "fix permissions" item when recording is in error state and permissions are denied
    if get_recording_status() == RecordingStatus::Error {
        let perms = crate::permissions::do_permissions_check(false);
        let has_permission_issue = !perms.screen_recording.permitted()
            || !perms.microphone.permitted();
        if has_permission_issue {
            menu_builder = menu_builder.item(
                &MenuItemBuilder::with_id("fix_permissions", "⚠ fix permissions")
                    .build(app)?,
            );
        }
    }

    // Version and update items
    let is_beta = app.config().identifier.contains("beta");
    let version_text = if is_beta {
        format!("version {} (beta)", app.package_info().version)
    } else {
        format!("version {}", app.package_info().version)
    };
    menu_builder = menu_builder
        .item(&PredefinedMenuItem::separator(app)?)
        .item(
            &MenuItemBuilder::with_id("version", version_text)
                .enabled(false)
                .build(app)?,
        )
        .item(update_item)
        .item(&MenuItemBuilder::with_id("releases", "changelog").build(app)?);

    // Only show recording controls if not in dev mode
    let dev_mode = store
        .get("devMode")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !dev_mode {
        menu_builder = menu_builder
            .item(&PredefinedMenuItem::separator(app)?)
            .item(&MenuItemBuilder::with_id("start_recording", "start recording").build(app)?)
            .item(&MenuItemBuilder::with_id("stop_recording", "stop recording").build(app)?);
    }

    // Settings, feedback and quit
    menu_builder = menu_builder
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("settings", "settings").build(app)?)
        .item(&MenuItemBuilder::with_id("feedback", "send feedback").build(app)?)
        .item(&MenuItemBuilder::with_id("book_call", "book a call with founder").build(app)?)
        .item(&MenuItemBuilder::with_id("onboarding", "onboarding").build(app)?)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("quit", "quit screenpipe").build(app)?);

    menu_builder.build().map_err(Into::into)
}

fn setup_tray_click_handlers(main_tray: &TrayIcon) -> Result<()> {
    main_tray.on_menu_event(move |app_handle, event| {
        handle_menu_event(app_handle, event);
    });

    Ok(())
}

fn handle_menu_event(app_handle: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "show" => {
            show_main_window(app_handle, false);
        }
        "start_recording" => {
            let _ = app_handle.emit("shortcut-start-recording", ());
        }
        "stop_recording" => {
            let _ = app_handle.emit("shortcut-stop-recording", ());
        }
        "fix_permissions" => {
            let _ = ShowRewindWindow::PermissionRecovery.show(app_handle);
        }
        "releases" => {
            let _ = app_handle.opener().open_url("https://screenpi.pe/changelog", None::<&str>);
        }
        "update_now" => {
            // For source builds, show info dialog about updates
            if is_source_build(app_handle) {
                let app = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let dialog = app
                        .dialog()
                        .message(
                            "auto-updates are only available in the pre-built version.\n\n\
                            source builds require manual updates from github.",
                        )
                        .title("source build detected")
                        .buttons(MessageDialogButtons::OkCancelCustom(
                            "download pre-built".to_string(),
                            "view on github".to_string(),
                        ));

                    dialog.show(move |clicked_download| {
                        if clicked_download {
                            let _ = app.opener().open_url("https://screenpi.pe/download", None::<&str>);
                        } else {
                            let _ = app.opener().open_url("https://github.com/screenpipe/screenpipe/releases", None::<&str>);
                        }
                    });
                });
            } else {
                // For production builds, emit event to trigger update
                let _ = app_handle.emit("update-now-clicked", ());
            }
        }
        "settings" => {
            let _ = ShowRewindWindow::Settings { page: None }.show(app_handle);
        }
        "feedback" => {
            let _ = ShowRewindWindow::Settings { page: Some("feedback".to_string()) }.show(app_handle);
        }
        "book_call" => {
            let _ = app_handle.opener().open_url("https://cal.com/louis030195/screenpipe-onboarding", None::<&str>);
        }
        "onboarding" => {
            // Reset onboarding state so it shows even if previously completed
            let _ = OnboardingStore::update(app_handle, |onboarding| {
                onboarding.reset();
            });
            let _ = ShowRewindWindow::Onboarding.show(app_handle);
        }
        "quit" => {
            debug!("Quit requested");

            // Signal that this is an intentional quit so the ExitRequested
            // handler in main.rs won't prevent it.
            QUIT_REQUESTED.store(true, Ordering::SeqCst);

            // Stop recording before exiting
            let app_handle_clone = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                info!("Stopping screenpipe recording before quit...");
                if let Some(recording_state) = app_handle_clone.try_state::<RecordingState>() {
                    let mut handle_guard = recording_state.0.lock().await;
                    if let Some(handle) = handle_guard.take() {
                        handle.shutdown();
                        info!("Screenpipe recording stopped successfully");
                    } else {
                        debug!("No recording running to stop");
                    }
                }
                app_handle_clone.exit(0);
            });
        }
        _ => debug!("Unhandled menu event: {:?}", event.id()),
    }
}

async fn update_menu_if_needed(
    app: &AppHandle,
    update_item: &tauri::menu::MenuItem<Wry>,
) -> Result<()> {
    // Get current state including onboarding status
    let onboarding_completed = OnboardingStore::get(app)
        .ok()
        .flatten()
        .map(|o| o.is_completed)
        .unwrap_or(false);

    // Check permission status for tray tooltip
    let has_permission_issue = if onboarding_completed {
        #[cfg(target_os = "macos")]
        {
            let perms = crate::permissions::do_permissions_check(false);
            !perms.screen_recording.permitted() || !perms.microphone.permitted()
        }
        #[cfg(not(target_os = "macos"))]
        { false }
    } else {
        false
    };

    let new_state = MenuState {
        shortcuts: get_current_shortcuts(app)?,
        recording_status: Some(get_recording_status()),
        onboarding_completed,
        has_permission_issue,
    };

    // Compare with last state
    let should_update = {
        let mut last_state = LAST_MENU_STATE.lock().unwrap();
        if *last_state != new_state {
            *last_state = new_state.clone();
            true
        } else {
            false
        }
    };

    if should_update {
        // IMPORTANT: All NSStatusItem/TrayIcon operations must happen on the main thread.
        // If the TrayIcon is dropped on a tokio thread (e.g., after recreate_tray removed
        // the old one from the manager), NSStatusBar _removeStatusItem fires on the wrong
        // thread and crashes.
        let app_for_thread = app.clone();
        let update_item = update_item.clone();
        let has_perm_issue = new_state.has_permission_issue;
        let _ = app.run_on_main_thread(move || {
            if let Some(tray) = app_for_thread.tray_by_id("screenpipe_main") {
                if let Ok(menu) = create_dynamic_menu(&app_for_thread, &new_state, &update_item) {
                    let _ = tray.set_menu(Some(menu));
                }
                // Update tooltip to show permission status
                let tooltip = if has_perm_issue {
                    "screenpipe — ⚠️ permissions needed"
                } else {
                    "screenpipe"
                };
                let _ = tray.set_tooltip(Some(tooltip));
            }
        });
    }

    Ok(())
}

fn get_current_shortcuts(app: &AppHandle) -> Result<HashMap<String, String>> {
    let store = get_store(app, None)?;
    let mut shortcuts = HashMap::new();

    // Get the show shortcut from store
    if let Some(shortcut) = store.get("showScreenpipeShortcut").and_then(|v| v.as_str().map(String::from)) {
        shortcuts.insert("show".to_string(), shortcut);
    }

    Ok(shortcuts)
}

pub fn setup_tray_menu_updater(app: AppHandle, update_item: &tauri::menu::MenuItem<Wry>) {
    let update_item = update_item.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            interval.tick().await;
            if let Err(e) = update_menu_if_needed(&app, &update_item).await {
                error!("Failed to update tray menu: {:#}", e);
            }
        }
    });
}

fn format_shortcut(shortcut: &str) -> String {
    // Format shortcut for display in tray menu
    // macOS convention: ⌘ (Command) → ⌃ (Control) → ⌥ (Option) → ⇧ (Shift) → Key

    let parts: Vec<&str> = shortcut.split('+').collect();

    let mut has_cmd = false;
    let mut has_ctrl = false;
    let mut has_alt = false;
    let mut has_shift = false;
    let mut key = String::new();

    for part in parts {
        let lower = part.trim().to_lowercase();
        match lower.as_str() {
            "super" | "command" | "cmd" | "meta" => has_cmd = true,
            "control" | "ctrl" | "commandorcontrol" => has_ctrl = true,
            "alt" | "option" => has_alt = true,
            "shift" => has_shift = true,
            _ => key = part.trim().to_uppercase(),
        }
    }

    if cfg!(target_os = "macos") {
        // macOS: Use symbols in correct order (⌘⌃⌥⇧Key)
        let mut result = String::new();
        if has_cmd { result.push_str("⌘"); }
        if has_ctrl { result.push_str("⌃"); }
        if has_alt { result.push_str("⌥"); }
        if has_shift { result.push_str("⇧"); }
        result.push_str(&key);
        result
    } else {
        // Windows/Linux: Use text with + separator
        let mut parts_out = Vec::new();
        if has_ctrl { parts_out.push("Ctrl"); }
        if has_cmd { parts_out.push("Win"); }
        if has_alt { parts_out.push("Alt"); }
        if has_shift { parts_out.push("Shift"); }
        parts_out.push(&key);
        parts_out.join("+")
    }
}
