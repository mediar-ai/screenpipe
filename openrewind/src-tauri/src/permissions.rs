use serde::{Deserialize, Serialize};
use specta::Type;



#[derive(Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum OSPermission {
    ScreenRecording,
    Microphone,
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
                ScreenCaptureAccess.request();
            }
            OSPermission::Microphone => request_av_permission(AVMediaType::Audio),
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
}

impl OSPermissionsCheck {
    pub fn necessary_granted(&self) -> bool {
        self.screen_recording.permitted()
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
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        OSPermissionsCheck {
            screen_recording: OSPermissionStatus::NotNeeded,
            microphone: OSPermissionStatus::NotNeeded,
        }
    }
}
