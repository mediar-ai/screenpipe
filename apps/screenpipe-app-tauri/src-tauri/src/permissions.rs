use serde::{Deserialize, Serialize};
use specta::Type;
use tracing::{info, warn, error};

#[derive(Serialize, Deserialize, Type, Clone)]
#[serde(rename_all = "camelCase")]
pub enum OSPermission {
    ScreenRecording,
    Microphone,
    Accessibility,
}

#[tauri::command(async)]
#[specta::specta]
pub fn open_permission_settings(permission: OSPermission) {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        match permission {
            OSPermission::ScreenRecording => Command::new("open")
                .arg(
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
                )
                .spawn()
                .expect("Failed to open Screen Recording settings"),
            OSPermission::Microphone => Command::new("open")
                .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
                .spawn()
                .expect("Failed to open Microphone settings"),
            OSPermission::Accessibility => Command::new("open")
                .arg(
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
                )
                .spawn()
                .expect("Failed to open Accessibility settings"),
        };
    }
}

#[tauri::command]
#[specta::specta]
pub async fn request_permission(permission: OSPermission) {
    #[cfg(target_os = "macos")]
    {
        use nokhwa_bindings_macos::AVMediaType;
        match permission {
            OSPermission::ScreenRecording => {
                use core_graphics_helmer_fork::access::ScreenCaptureAccess;
                if !ScreenCaptureAccess.preflight() {
                    // Try request() first — on macOS this opens System Settings for
                    // screen recording (there's no modal prompt for screen capture).
                    // If the app is already in the TCC list as denied, request() may
                    // silently no-op, so we also open settings directly as fallback.
                    ScreenCaptureAccess.request();
                    // Also open System Settings directly to ensure the user sees it
                    open_permission_settings(OSPermission::ScreenRecording);
                }
            }
            OSPermission::Microphone => {
                use nokhwa_bindings_macos::AVAuthorizationStatus;
                use objc::*;
                let cls = objc::class!(AVCaptureDevice);
                let status: AVAuthorizationStatus =
                    unsafe { msg_send![cls, authorizationStatusForMediaType:AVMediaType::Audio.into_ns_str()] };
                match status {
                    AVAuthorizationStatus::Authorized => {
                        // Already granted, nothing to do
                    }
                    AVAuthorizationStatus::NotDetermined => {
                        // First time — show the system prompt
                        request_av_permission(AVMediaType::Audio);
                    }
                    _ => {
                        // Denied or restricted — system won't show prompt again,
                        // open System Settings directly so user can toggle it on
                        info!("microphone permission denied/restricted, opening system settings");
                        open_permission_settings(OSPermission::Microphone);
                    }
                }
            }
            OSPermission::Accessibility => {
                // Request accessibility permission (shows system prompt)
                // AXIsProcessTrustedWithOptions with kAXTrustedCheckOptionPrompt
                // handles both NotDetermined and Denied cases on macOS
                request_accessibility_permission();
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn request_av_permission(media_type: nokhwa_bindings_macos::AVMediaType) {
    use objc::{runtime::*, *};
    use tauri_nspanel::block::ConcreteBlock;

    let callback = move |_: BOOL| {};
    let cls = class!(AVCaptureDevice);
    let objc_fn_block: ConcreteBlock<(BOOL,), (), _> = ConcreteBlock::new(callback);
    let objc_fn_pass = objc_fn_block.copy();
    unsafe {
        let _: () = msg_send![cls, requestAccessForMediaType:media_type.into_ns_str() completionHandler:objc_fn_pass];
    };
}

// Accessibility permission APIs using ApplicationServices framework
#[cfg(target_os = "macos")]
mod accessibility {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::string::CFString;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXIsProcessTrustedWithOptions(options: *const std::ffi::c_void) -> bool;
        static kAXTrustedCheckOptionPrompt: *const std::ffi::c_void;
    }

    /// Check if the app has accessibility permission (without prompting)
    pub fn is_trusted() -> bool {
        unsafe { AXIsProcessTrusted() }
    }

    /// Check accessibility permission and show system prompt if not granted
    pub fn request_with_prompt() -> bool {
        unsafe {
            let key = CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt as *const _);
            let value = CFBoolean::true_value();
            let dict = CFDictionary::from_CFType_pairs(&[(key, value)]);
            AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef() as *const _)
        }
    }
}

#[cfg(target_os = "macos")]
fn check_accessibility_permission() -> OSPermissionStatus {
    if accessibility::is_trusted() {
        OSPermissionStatus::Granted
    } else {
        OSPermissionStatus::Denied
    }
}

#[cfg(target_os = "macos")]
fn request_accessibility_permission() {
    accessibility::request_with_prompt();
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Type)]
#[serde(rename_all = "camelCase")]
pub enum OSPermissionStatus {
    // This platform does not require this permission
    NotNeeded,
    // The user has neither granted nor denied permission
    Empty,
    // The user has explicitly granted permission
    Granted,
    // The user has denied permission, or has granted it but not yet restarted
    Denied,
}

impl OSPermissionStatus {
    pub fn permitted(&self) -> bool {
        matches!(self, Self::NotNeeded | Self::Granted)
    }
}

#[derive(Serialize, Deserialize, Debug, Type)]
#[serde(rename_all = "camelCase")]
pub struct OSPermissionsCheck {
    pub screen_recording: OSPermissionStatus,
    pub microphone: OSPermissionStatus,
    pub accessibility: OSPermissionStatus,
}

impl OSPermissionsCheck {
    pub fn necessary_granted(&self) -> bool {
        self.screen_recording.permitted()
    }
}

/// Check only microphone permission (no screen recording check)
/// Use this for polling to avoid triggering macOS screen capture permission dialogs
#[tauri::command(async)]
#[specta::specta]
pub fn check_microphone_permission() -> OSPermissionStatus {
    #[cfg(target_os = "macos")]
    {
        use nokhwa_bindings_macos::AVMediaType;
        use nokhwa_bindings_macos::AVAuthorizationStatus;
        use objc::*;

        let cls = objc::class!(AVCaptureDevice);
        let status: AVAuthorizationStatus =
            unsafe { msg_send![cls, authorizationStatusForMediaType:AVMediaType::Audio.into_ns_str()] };
        match status {
            AVAuthorizationStatus::NotDetermined => OSPermissionStatus::Empty,
            AVAuthorizationStatus::Authorized => OSPermissionStatus::Granted,
            _ => OSPermissionStatus::Denied,
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        OSPermissionStatus::NotNeeded
    }
}

/// Check only accessibility permission
/// Use this for polling to check if user has granted accessibility permission
#[tauri::command(async)]
#[specta::specta]
pub fn check_accessibility_permission_cmd() -> OSPermissionStatus {
    #[cfg(target_os = "macos")]
    {
        check_accessibility_permission()
    }

    #[cfg(not(target_os = "macos"))]
    {
        OSPermissionStatus::NotNeeded
    }
}

/// Reset a permission using tccutil and re-request it
/// This removes the app from the TCC database and triggers a fresh permission request
#[tauri::command(async)]
#[specta::specta]
pub async fn reset_and_request_permission(
    app: tauri::AppHandle,
    permission: OSPermission,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        use tokio::time::{sleep, Duration};

        let service = match &permission {
            OSPermission::ScreenRecording => "ScreenCapture",
            OSPermission::Microphone => "Microphone",
            OSPermission::Accessibility => "Accessibility",
        };

        // Get bundle identifier from Tauri config (handles dev/beta/prod automatically)
        let bundle_id = app.config().identifier.as_str();

        info!("resetting permission for service: {} (bundle: {})", service, bundle_id);

        // Reset permission using tccutil - ONLY for this app's bundle ID
        let output = Command::new("tccutil")
            .args(["reset", service, bundle_id])
            .output()
            .map_err(|e| format!("failed to run tccutil: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            warn!("tccutil reset returned non-zero: {}", stderr);
            // Don't fail - tccutil might return non-zero even when it works
        }

        info!("tccutil reset completed for {} (bundle: {}), waiting before re-request", service, bundle_id);

        // Wait for TCC database to update
        sleep(Duration::from_millis(500)).await;

        // Re-request the permission
        request_permission(permission).await;

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, permission);
        Ok(())
    }
}

/// Check all permissions and return which ones are missing
#[tauri::command(async)]
#[specta::specta]
pub fn get_missing_permissions() -> Vec<OSPermission> {
    #[cfg(target_os = "macos")]
    {
        let mut missing = Vec::new();
        let check = do_permissions_check(false);

        if !check.screen_recording.permitted() {
            missing.push(OSPermission::ScreenRecording);
        }
        if !check.microphone.permitted() {
            missing.push(OSPermission::Microphone);
        }
        if !check.accessibility.permitted() {
            missing.push(OSPermission::Accessibility);
        }

        missing
    }

    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}

#[tauri::command(async)]
#[specta::specta]
pub fn do_permissions_check(initial_check: bool) -> OSPermissionsCheck {
    #[cfg(target_os = "macos")]
    {
        use nokhwa_bindings_macos::AVMediaType;

        fn check_av_permission(media_type: AVMediaType) -> OSPermissionStatus {
            use nokhwa_bindings_macos::AVAuthorizationStatus;
            use objc::*;

            let cls = objc::class!(AVCaptureDevice);
            let status: AVAuthorizationStatus =
                unsafe { msg_send![cls, authorizationStatusForMediaType:media_type.into_ns_str()] };
            match status {
                AVAuthorizationStatus::NotDetermined => OSPermissionStatus::Empty,
                AVAuthorizationStatus::Authorized => OSPermissionStatus::Granted,
                _ => OSPermissionStatus::Denied,
            }
        }

        OSPermissionsCheck {
            screen_recording: {
                use core_graphics_helmer_fork::access::ScreenCaptureAccess;
                let result = ScreenCaptureAccess.preflight();
                match (result, initial_check) {
                    (true, _) => OSPermissionStatus::Granted,
                    (false, true) => OSPermissionStatus::Empty,
                    (false, false) => OSPermissionStatus::Denied,
                }
            },
            microphone: check_av_permission(AVMediaType::Audio),
            accessibility: check_accessibility_permission(),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        OSPermissionsCheck {
            screen_recording: OSPermissionStatus::NotNeeded,
            microphone: OSPermissionStatus::NotNeeded,
            accessibility: OSPermissionStatus::NotNeeded,
        }
    }
}

/// Start background permission monitor that checks permissions periodically
/// and emits an event when any permission is lost
#[cfg(target_os = "macos")]
pub async fn start_permission_monitor(app: tauri::AppHandle) {
    use tokio::time::{interval, Duration};
    use tauri::Emitter;
    use crate::store::OnboardingStore;

    // Wait for onboarding to complete before monitoring permissions
    // During onboarding, permissions haven't been granted yet - monitoring would cause false alarms
    loop {
        tokio::time::sleep(Duration::from_secs(5)).await;
        match OnboardingStore::get(&app) {
            Ok(Some(store)) if store.is_completed => {
                info!("onboarding completed, starting permission monitor");
                break;
            }
            _ => continue,
        }
    }

    // Extra delay after onboarding to let permissions settle
    tokio::time::sleep(Duration::from_secs(5)).await;

    let mut check_interval = interval(Duration::from_secs(10));
    let mut last_screen_ok = true;
    let mut last_mic_ok = true;
    let mut last_accessibility_ok = true;

    // Track consecutive failures to avoid false positives from transient TCC issues
    // macOS preflight() can return false transiently even when permission is granted
    let mut screen_fail_count = 0u32;
    let mut mic_fail_count = 0u32;
    let mut accessibility_fail_count = 0u32;
    const REQUIRED_CONSECUTIVE_FAILURES: u32 = 2; // Require 2 consecutive failures (~20 seconds)

    info!("permission monitor started");

    loop {
        check_interval.tick().await;

        let perms = do_permissions_check(false);
        let screen_ok = perms.screen_recording.permitted();
        let mic_ok = perms.microphone.permitted();
        let accessibility_ok = perms.accessibility.permitted();

        // Update consecutive failure counts
        if screen_ok {
            screen_fail_count = 0;
        } else if last_screen_ok || screen_fail_count > 0 {
            screen_fail_count += 1;
        }

        if mic_ok {
            mic_fail_count = 0;
        } else if last_mic_ok || mic_fail_count > 0 {
            mic_fail_count += 1;
        }

        if accessibility_ok {
            accessibility_fail_count = 0;
        } else if last_accessibility_ok || accessibility_fail_count > 0 {
            accessibility_fail_count += 1;
        }

        // Only trigger when we have REQUIRED_CONSECUTIVE_FAILURES in a row
        // This prevents false positives from transient TCC database issues
        let screen_confirmed_lost = screen_fail_count == REQUIRED_CONSECUTIVE_FAILURES;
        let mic_confirmed_lost = mic_fail_count == REQUIRED_CONSECUTIVE_FAILURES;
        let accessibility_confirmed_lost = accessibility_fail_count == REQUIRED_CONSECUTIVE_FAILURES;

        if screen_confirmed_lost || mic_confirmed_lost || accessibility_confirmed_lost {
            // Double-check: only emit if at least one permission is actually lost right now
            // This prevents phantom events from transient TCC flickers
            if !screen_ok || !mic_ok || !accessibility_ok {
                warn!(
                    "permission confirmed lost after {} consecutive failures - screen: {} (fails: {}), mic: {} (fails: {}), accessibility: {} (fails: {})",
                    REQUIRED_CONSECUTIVE_FAILURES,
                    screen_ok, screen_fail_count,
                    mic_ok, mic_fail_count,
                    accessibility_ok, accessibility_fail_count
                );

                // Emit event to frontend
                if let Err(e) = app.emit("permission-lost", serde_json::json!({
                    "screen_recording": !screen_ok,
                    "microphone": !mic_ok,
                    "accessibility": !accessibility_ok,
                })) {
                    error!("failed to emit permission-lost event: {}", e);
                }
            }
        }

        last_screen_ok = screen_ok;
        last_mic_ok = mic_ok;
        last_accessibility_ok = accessibility_ok;
    }
}

#[cfg(not(target_os = "macos"))]
pub async fn start_permission_monitor(_app: tauri::AppHandle) {
    // No-op on non-macOS platforms
}
