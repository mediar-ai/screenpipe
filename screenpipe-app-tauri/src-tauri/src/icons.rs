use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct AppIcon {
    pub base64: String,
    pub path: Option<String>,
}

#[tauri::command]
#[cfg(target_os = "macos")]
pub async fn get_app_icon(
    app_name: &str,
    app_path: Option<String>,
) -> Result<Option<AppIcon>, String> {
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSAutoreleasePool, NSData, NSString};
    use objc::{class, msg_send, sel, sel_impl};
    
    unsafe {
        // Create autorelease pool
        let pool = NSAutoreleasePool::new(nil);
        
        let result = (|| {
            let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];

            let path = if let Some(path) = app_path {
                path
            } else {
                let ns_app_name = NSString::alloc(nil).init_str(app_name);
                let path: id = msg_send![workspace, fullPathForApplication: ns_app_name];
                let _: () = msg_send![ns_app_name, release];
                
                if path == nil {
                    return Ok(None);
                }
                let path: id = msg_send![path, UTF8String];
                std::ffi::CStr::from_ptr(path as *const _)
                    .to_string_lossy()
                    .into_owned()
            };

            let ns_path = NSString::alloc(nil).init_str(&path);
            let icon: id = msg_send![workspace, iconForFile:ns_path];
            let _: () = msg_send![ns_path, release];

            if icon == nil {
                return Ok(None);
            }

            // Rest of the conversion logic remains the same
            let tiff_data: id = msg_send![icon, TIFFRepresentation];
            let image_rep: id = msg_send![class!(NSBitmapImageRep), imageRepWithData: tiff_data];
            let png_data: id = msg_send![image_rep, representationUsingType:4 properties:nil];

            let length = NSData::length(png_data);
            let bytes = NSData::bytes(png_data);
            let data = std::slice::from_raw_parts(bytes as *const u8, length as usize);

            let base64 = STANDARD.encode(data);

            Ok(Some(AppIcon {
                base64,
                path: Some(path),
            }))
        })();

        // Drain the autorelease pool
        let _: () = msg_send![pool, drain];
        
        result
    }
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub async fn get_app_icon(
    app_name: &str,
    app_path: Option<String>,
) -> Result<Option<AppIcon>, String> {
    use std::path::Path;
    use winapi::um::shellapi::ExtractIconExW;
    use winapi::um::winuser::LoadIconW;
    use winapi::shared::windef::HICON;
    use image::DynamicImage;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    fn to_wide_string(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    let path = app_path.unwrap_or_else(|| format!("{}.exe", app_name));
    let wide_path = to_wide_string(&path);

    unsafe {
        let mut icon_handle: HICON = std::ptr::null_mut();
        let icons_extracted = ExtractIconExW(wide_path.as_ptr(), 0, std::ptr::null_mut(), &mut icon_handle, 1);
        
        if icons_extracted == 0 || icon_handle.is_null() {
            return Err("Failed to extract icon".into());
        }

        // Convert icon handle to a PNG (you would need to write this conversion part)
        let dynamic_image = DynamicImage::from_hicon(icon_handle)?;
        let mut buffer = vec![];
        dynamic_image.write_to(&mut buffer, image::ImageOutputFormat::Png)?;

        let base64 = STANDARD.encode(buffer);

        Ok(Some(AppIcon {
            base64,
            path: Some(path),
        }))
    }
}

#[tauri::command]
#[cfg(target_os = "linux")]
pub async fn get_app_icon(
    app_name: &str,
    app_path: Option<String>,
) -> Result<Option<AppIcon>, String> {
    use std::process::Command;

    let icon_name = app_name.to_lowercase();

    let possible_icon_paths = [
        format!("/usr/share/icons/hicolor/128x128/apps/{}.png", icon_name),
        format!("/usr/share/pixmaps/{}.png", icon_name),
    ];

    for icon_path in possible_icon_paths.iter() {
        if Path::new(icon_path).exists() {
            let icon_data = fs::read(icon_path)
                .map_err(|_| format!("Failed to read icon file: {}", icon_path))?;

            let base64 = STANDARD.encode(icon_data);

            return Ok(Some(AppIcon {
                base64,
                path: Some(icon_path.clone()),
            }));
        }
    }

    Err(format!("Icon for '{}' not found", app_name))
}
