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
    use windows_icons::get_icon_base64_by_path;

    async fn find_exe_path(app_name: &str) -> Option<String> {
        if let Some(path) = get_exe_by_reg_key(app_name) {
            return Some(path);
        }
        if let Some(path) = get_exe_by_appx(app_name).await {
            return Some(path);
        }
        if let Some(path) = get_exe_from_potential_path(app_name).await {
            return Some(path);
        }
        None
    }

    let path = match app_path  {
        Some(p) => p,
        None => find_exe_path(app_name).await.ok_or_else(|| "app_path is None and could not find executable path".to_string())?,
    };

    let base64 = get_icon_base64_by_path(&path).await.map_err(|e| e.to_string())?;

    Ok(Some(AppIcon {
        base64,
        path: Some(path),
    }))
}

#[cfg(target_os = "windows")]
fn get_exe_by_reg_key(
    app_name: &str
) -> Option<String> {
    use winreg::RegKey;
    use winreg::enums::*;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let reg_paths = [
        "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths",
        "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths",
    ];

    for path in &reg_paths {
        let keys = [hklm.open_subkey(path), hkcu.open_subkey(path)];
        for key in keys.iter().filter_map(|k| k.as_ref().ok()) {
            for subkey in key.enum_keys().filter_map(Result::ok) {
                if let Ok(app_key) = key.open_subkey(&subkey) {
                    if let Ok(display_name) = app_key.get_value::<String, _>("DisplayName") {
                        if display_name.to_lowercase().contains(&app_name.to_lowercase()) {
                            if let Ok(path) = app_key.get_value::<String, _>("DisplayIcon") {
                                let cleaned_path = path.split(',').next().unwrap_or(&path).to_string();
                                return Some(cleaned_path);
                            } else if let Ok(path) = app_key.get_value::<String, _>("(default)") {
                                let cleaned_path = path.split(',').next().unwrap_or(&path).to_string();
                                return Some(cleaned_path);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
async fn get_exe_from_potential_path(app_name: &str) -> Option<String>{
    let app_name = app_name.strip_suffix(".exe").unwrap_or(&app_name);
    let potential_paths = [
        (r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs", true),
        (r"C:\Windows\", false),
    ];
    for (path, recursive) in &potential_paths {
        let command = if *recursive {
            format!(
                r#"
                    Get-ChildItem -Path "{}" -Filter "*{}*.exe" -Recurse | ForEach-Object {{ $_.FullName }}
                    "#,
                path, 
                app_name
            )
        } else {
            format!(
                r#"
                    Get-ChildItem -Path "{}" -Filter "*{}*.exe" | ForEach-Object {{ $_.FullName }}
                    "#,
                path, 
                app_name
            )
        };

        let output = tokio::process::Command::new("powershell")
            .arg("-Command")
            .arg(command)
            .output()
            .await
            .ok()?;

        if output.status.success() {
            let stdout = std::str::from_utf8(&output.stdout).ok()?;
            if !stdout.is_empty() {
                return stdout.lines().next().map(str::to_string);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
async fn get_exe_by_appx(
    app_name: &str
) -> Option<String> {
    use std::str;

    let app_name = app_name.strip_suffix(".exe").unwrap_or(&app_name);
    let app_name_withoutspace = app_name.replace(" ", ""); 

    let output = tokio::process::Command::new("powershell")
        .arg("-Command")
        .arg(format!(
            r#"Get-AppxPackage | Where-Object {{ $_.Name -like "*{}*" }}"#,
            app_name_withoutspace
        ))
        .output()
        .await
        .expect("failed to execute powershell command");

    if !output.status.success() {
        return None
    }

    let stdout = str::from_utf8(&output.stdout).ok()?;
    let package_name = stdout
        .lines()
        .find(|line| line.contains("PackageFullName"))
        .and_then(|line| line.split(':').nth(1))
        .map(str::trim)?;

    let exe_output = tokio::process::Command::new("powershell")
        .arg("-Command")
        .arg(format!(
            r#"
                        Get-ChildItem -Path "C:\Program Files\WindowsApps\{}\*" -Filter "*{}*.exe" -Recurse | ForEach-Object {{ $_.FullName }}
                    "#,
            package_name,
            app_name_withoutspace
        ))
        .output()
        .await
        .ok()?;

    if exe_output.status.success() {
        let exe_stdout = str::from_utf8(&exe_output.stdout).ok()?;
        if !exe_stdout.is_empty() {
            return exe_stdout.lines().next().map(str::to_string);
        }
    }
    // second attempt with space if the first attempt couldn't find exe
    let exe_output = tokio::process::Command::new("powershell")
        .arg("-Command")
        .arg(format!(
            r#"
                        Get-ChildItem -Path "C:\Program Files\WindowsApps\{}\*" -Filter "*{}*.exe" -Recurse | ForEach-Object {{ $_.FullName }}
                    "#,
            package_name,
            app_name
        ))
        .output()
        .await
        .ok()?;

    if exe_output.status.success() {
        let exe_stdout = str::from_utf8(&exe_output.stdout).ok()?;
        if !exe_stdout.is_empty() {
            return exe_stdout.lines().next().map(str::to_string);
        }
    }
    None
}

#[tauri::command]
#[cfg(target_os = "linux")]
pub async fn get_app_icon(
    app_name: &str,
    app_path: Option<String>,
) -> Result<Option<AppIcon>, String> {
    use std::fs;
    use gtk::prelude::IconThemeExt;
    use base64::{engine::general_purpose::STANDARD, Engine};

    if gtk::init().is_err() {
        return Err("failed to initialize GTK".to_string());
    }

    fn find_icon_path(app_name: &str) -> Option<String> {
        let icon_theme = gtk::IconTheme::default().unwrap();
        let icon_info = icon_theme.lookup_icon(app_name, 64, gtk::IconLookupFlags::empty())?;
        icon_info.filename().map(|s| s.to_string_lossy().into_owned())
    }

    let path = match app_path {
        Some(p) => p,
        None => find_icon_path(app_name).ok_or_else(|| "could not find icon path".to_string())?,
    };

    // base64 will be in svg!
    let icon_data = fs::read(&path).map_err(|e| e.to_string())?;
    let base64 = STANDARD.encode(&icon_data);

    Ok(Some(AppIcon {
        base64,
        path: Some(path),
    }))
}

