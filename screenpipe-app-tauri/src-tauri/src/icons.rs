use serde::{Deserialize, Serialize};

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
    use base64::{engine::general_purpose::STANDARD, Engine};
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
                // Release the NSString we created
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
    // Windows: Extract icon from exe using Shell32
    // Convert to base64
    // Return AppIcon struct
    Ok(None)
}

#[tauri::command]
#[cfg(target_os = "linux")]
pub async fn get_app_icon(
    app_name: &str,
    app_path: Option<String>,
) -> Result<Option<AppIcon>, String> {
    // Linux: Check XDG icon themes
    // Convert to base64
    // Return AppIcon struct
    Ok(None)
}
