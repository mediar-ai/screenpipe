#[cfg(target_os = "windows")]
use windows::Win32::System::RemoteDesktop::{
    WTSActive, WTSEnumerateSessionsW, WTSQuerySessionInformationW, WTS_CURRENT_SERVER_HANDLE,
    WTS_INFO_CLASS, WTS_SESSION_INFOW, WTSVirtualChannelQuery, WTSFreeMemory, WTSQueryUserToken,
};

#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateDCA, DeleteDC, DeleteObject,
    GetDIBits, SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, SRCCOPY,
};

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HANDLE;

#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

#[cfg(target_os = "windows")]
use windows::Win32::Security::{
    GetTokenInformation, LookupPrivilegeNameW, TokenPrivileges, SE_PRIVILEGE_ENABLED,
    TOKEN_PRIVILEGES, TOKEN_QUERY,
};

#[cfg(target_os = "windows")]
use windows::Win32::System::Memory::{LocalAlloc, LPTR};

#[cfg(target_os = "windows")]
use windows::core::PWSTR;

#[cfg(target_os = "windows")]
use windows::Win32::Security::{ImpersonateLoggedOnUser, RevertToSelf};

use std::ffi::c_void;
use std::fs;
use std::path::Path;

#[cfg(target_os = "windows")]
use windows::Win32::Security::{
    AdjustTokenPrivileges, LookupPrivilegeValueW, TOKEN_ADJUST_PRIVILEGES,
    LUID_AND_ATTRIBUTES
};

#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
    Security::{
        DuplicateTokenEx, SecurityImpersonation, SecurityIdentification,
        TokenPrimary, TOKEN_ALL_ACCESS,
    },
};


#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Gdi::{
    EnumDisplaySettingsW, DEVMODEW, ENUM_CURRENT_SETTINGS,
};

use std::env;

#[cfg(target_os = "windows")]
fn check_privilege(privilege_name: &str) -> bool {
    use windows::core::PCWSTR;

    unsafe {
        let mut token = HANDLE::default();
        let mut has_privilege = false;

        if OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_QUERY,
            &mut token,
        ).is_ok() {
            let mut luid = windows::Win32::Foundation::LUID::default();
            let privilege_name_wide: Vec<u16> = format!("{}\0", privilege_name).encode_utf16().collect();
            
            if LookupPrivilegeValueW(
                None,
                PCWSTR(privilege_name_wide.as_ptr()),
                &mut luid,
            ).is_ok() {
                let mut tp = TOKEN_PRIVILEGES::default();
                let mut return_length = 0u32;

                if GetTokenInformation(
                    token,
                    TokenPrivileges,
                    Some(&mut tp as *mut _ as *mut c_void),
                    std::mem::size_of::<TOKEN_PRIVILEGES>() as u32,
                    &mut return_length,
                ).is_ok() {
                    has_privilege = true;
                    println!("privilege {} is already enabled", privilege_name);
                }
            }
            CloseHandle(token);
        }
        has_privilege
    }
}

#[cfg(target_os = "windows")]
fn enable_privilege(privilege_name: &str) -> anyhow::Result<()> {
    use windows::core::PCWSTR;

    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
            &mut token,
        ).is_ok() {
            let mut luid = windows::Win32::Foundation::LUID::default();
            let privilege_name_wide: Vec<u16> = format!("{}\0", privilege_name).encode_utf16().collect();
            
            if LookupPrivilegeValueW(
                None,
                PCWSTR(privilege_name_wide.as_ptr()),
                &mut luid,
            ).is_ok() {
                let mut tp = TOKEN_PRIVILEGES {
                    PrivilegeCount: 1,
                    Privileges: [LUID_AND_ATTRIBUTES {
                        Luid: luid,
                        Attributes: SE_PRIVILEGE_ENABLED,
                    }],
                };

                if AdjustTokenPrivileges(
                    token,
                    false,
                    Some(&tp),
                    0,
                    None,
                    None,
                ).is_ok() {
                    println!("successfully enabled privilege: {}", privilege_name);
                } else {
                    println!("failed to adjust token privileges: {:?}", windows::core::Error::from_win32());
                }
            } else {
                println!("failed to lookup privilege value: {:?}", windows::core::Error::from_win32());
            }
            CloseHandle(token);
        }
    }
    Ok(())
}


#[cfg(target_os = "windows")]
async fn capture_all_sessions() -> anyhow::Result<()> {
    // Only enable privileges if we don't already have them
    let required_privileges = [
        "SeSecurityPrivilege",
        "SeBackupPrivilege",
        "SeRestorePrivilege",
        "SeImpersonatePrivilege",
        "SeAssignPrimaryTokenPrivilege",
        "SeTcbPrivilege",
        "SeIncreaseQuotaPrivilege"
    ];

    for privilege in required_privileges {
        if !check_privilege(privilege) {
            enable_privilege(privilege)?;
        }
    }

    use windows::Win32::System::{RemoteDesktop::{WTSCloseServer, WTSOpenServerW, WTS_CONNECTSTATE_CLASS}, WindowsProgramming::GetComputerNameW};


    
    // Create screenshots directory if it doesn't exist
    let screenshots_dir = Path::new("screenshots");
    if !screenshots_dir.exists() {
        println!("creating screenshots directory...");
        fs::create_dir_all(screenshots_dir)?;
    }

    // Get the computer name
    let mut computer_name: Vec<u16> = vec![0; 256];
    let mut size = computer_name.len() as u32;
    
    unsafe {
        if GetComputerNameW(PWSTR(computer_name.as_mut_ptr()), &mut size).is_err() {
            println!("Failed to get computer name: {:?}", windows::core::Error::from_win32());
        }
    }

    let mut session_count: u32 = 0;
    let mut sessions: *mut WTS_SESSION_INFOW = std::ptr::null_mut();

    let server_handle = unsafe {
        let server_url = env::var("RDP_SERVER_URL")
            .unwrap_or_else(|_| {
                println!("warning: RDP_SERVER_URL not set, using localhost");
                "localhost".to_string()
            });
        
        let server_url_wide: Vec<u16> = format!("{}\0", server_url).encode_utf16().collect();
        let server_handle = WTSOpenServerW(PWSTR(server_url_wide.as_ptr() as *mut u16));
        // ... existing code ...
        if server_handle.is_invalid() {
            println!("Failed to open server: {:?}", windows::core::Error::from_win32());
            return Ok(());
        }

        WTSEnumerateSessionsW(
            server_handle,
            0,
            1,
            &mut sessions,
            &mut session_count,
        )?;

        // Don't forget to close the server handle
        // WTSCloseServer(server_handle);
        server_handle
    };

    let sessions_slice = unsafe { std::slice::from_raw_parts(sessions, session_count as usize) };

    println!("found {} sessions", session_count);

    for session in sessions_slice {
        // In the sessions loop, before checking winstation
        println!("Session {}: State={} ({:?})", 
            session.SessionId, 
            session.State.0,
            session.State
        );
        let mut username_ptr: *mut u16 = std::ptr::null_mut();
        let mut winstation_ptr: *mut u16 = std::ptr::null_mut();
        let mut client_name_ptr: *mut u16 = std::ptr::null_mut();
        let mut bytes_returned: u32 = 0;

        unsafe {
            // Get WinStation name to check if it's RDP
            match WTSQuerySessionInformationW(
                server_handle,
                session.SessionId,
                WTS_INFO_CLASS(6),
                &mut winstation_ptr as *mut *mut u16 as *mut _,
                &mut bytes_returned,
            ) {
                Ok(_) => {
                    let winstation = if !winstation_ptr.is_null() {
                        String::from_utf16_lossy(std::slice::from_raw_parts(
                            winstation_ptr,
                            (bytes_returned / 2 - 1) as usize,
                        ))
                    } else {
                        "Unknown".to_string()
                    };
                    
                    println!("winstation: {}", winstation);
                    // Modified RDP session check to include more variants
                    if winstation.contains("RDP") || winstation.contains("Tcp") {
                        println!("Found RDP session {}: {}", session.SessionId, winstation);
                        
                        // Get username
                        if let Ok(_) = WTSQuerySessionInformationW(
                            server_handle,
                            session.SessionId,
                            WTS_INFO_CLASS(5),
                            &mut username_ptr as *mut *mut u16 as *mut _,
                            &mut bytes_returned,
                        ) {
                            let username = if !username_ptr.is_null() {
                                String::from_utf16_lossy(std::slice::from_raw_parts(
                                    username_ptr,
                                    (bytes_returned / 2 - 1) as usize,
                                ))
                            } else {
                                "Unknown".to_string()
                            };

                            println!("RDP Session {}: username={}, state={:?}", 
                                session.SessionId, 
                                username, 
                                session.State
                            );

                            // Modified session state check - accept more states
                            // WTS_CONNECTSTATE_CLASS values:
                            // 0 = Active
                            // 1 = Connected 
                            // 2 = ConnectQuery
                            // 3 = Shadow
                            // 4 = Disconnected
                            // 5 = Idle
                            // 6 = Listen
                            // 7 = Reset
                            // 8 = Down
                            // 9 = Init
                            if session.State.0 > 7 { // Only skip truly inactive states
                                println!("Skipping inactive session {} (state={})", session.SessionId, session.State.0);
                                continue;
                            }

                            // Skip if no username (system or listener sessions)
                            if username.is_empty() {
                                println!("Skipping session {} with no username", session.SessionId);
                                continue;
                            }

                            
                                
                                // Try to get user token for the session
                                let mut token = HANDLE::default();
                                if let Err(e) = WTSQueryUserToken(session.SessionId, &mut token) {
                                    println!("Failed to get token directly for session {}, trying alternative method...", session.SessionId);
                                    
                                    unsafe {
                                        let mut process_token = HANDLE::default();
                                        if OpenProcessToken(
                                            GetCurrentProcess(),
                                            TOKEN_ALL_ACCESS,
                                            &mut process_token,
                                        ).is_ok() {
                                            println!("Successfully opened process token with full access");
                                            
                                            // Create a new token via duplication
                                            let mut duplicated_token = HANDLE::default();
                                            if DuplicateTokenEx(
                                                process_token,
                                                TOKEN_ALL_ACCESS,
                                                None,
                                                SecurityImpersonation,
                                                TokenPrimary,
                                                &mut duplicated_token,
                                            ).is_ok() {
                                                println!("Successfully duplicated token");
                                                token = duplicated_token;
                                            } else {
                                                println!("Failed to duplicate token: {:?}", windows::core::Error::from_win32());
                                                CloseHandle(process_token);
                                                continue;
                                            }
                                            CloseHandle(process_token);
                                        }
                                    }
                                }

                                // Validate token before using it
                                if token.is_invalid() || token == INVALID_HANDLE_VALUE {
                                    println!("Invalid token for session {}", session.SessionId);
                                    continue;
                                }

                                // Now try to impersonate
                                if unsafe { ImpersonateLoggedOnUser(token) }.is_ok() {
                                    println!("Successfully impersonated user for session {}", session.SessionId);
                                    
                                    
                                    
                                    if let Err(e) = capture_session_screen(session.SessionId, &screenshots_dir) {
                                        println!("Failed to capture RDP session: {:?}", e);
                                    }
                                    
                                    // Make sure to revert when done
                                    unsafe { RevertToSelf() };
                                } else {
                                    println!(
                                        "Failed to impersonate user for session {}: {:?}", 
                                        session.SessionId,
                                        windows::core::Error::from_win32()
                                    );
                                }
                                // Always clean up the token
                                unsafe { CloseHandle(token) };
                        }
                    } else {
                        println!("Skipping non-RDP session {}: {}", session.SessionId, winstation);
                    }
                }
                Err(e) => println!("Failed to get winstation name: {:?}", e),
            }

            // Cleanup
            if !username_ptr.is_null() { WTSFreeMemory(username_ptr as *mut _); }
            if !winstation_ptr.is_null() { WTSFreeMemory(winstation_ptr as *mut _); }
            if !client_name_ptr.is_null() { WTSFreeMemory(client_name_ptr as *mut _); }
        }
    }
    unsafe {
        WTSCloseServer(server_handle);
    }

    // Add delay between captures
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

    Ok(())
}

use windows::Win32::Graphics::Gdi::HDC;
use windows::Win32::UI::WindowsAndMessaging::GetSystemMetrics;

#[cfg(target_os = "windows")]
fn capture_session_screen(session_id: u32, screenshots_dir: &Path) -> anyhow::Result<()> {
    use windows::{core::PCWSTR, Win32::Graphics::Gdi::RGBQUAD};

    unsafe {
        // First try to enumerate the actual RDP display devices
        let mut dev_num = 0;
        let mut display_device = windows::Win32::Graphics::Gdi::DISPLAY_DEVICEW::default();
        display_device.cb = std::mem::size_of::<windows::Win32::Graphics::Gdi::DISPLAY_DEVICEW>() as u32;
        
        let mut rdp_display = None;
        
        // First enumerate primary display devices
        while windows::Win32::Graphics::Gdi::EnumDisplayDevicesW(
            None, // NULL for primary devices
            dev_num,
            &mut display_device,
            0  // Don't get child devices yet
        ).as_bool() {
            // For each primary device, check its children for RDP displays
            let mut child_num = 0;
            let mut child_device = windows::Win32::Graphics::Gdi::DISPLAY_DEVICEW::default();
            child_device.cb = std::mem::size_of::<windows::Win32::Graphics::Gdi::DISPLAY_DEVICEW>() as u32;
            println!("display_device: {:?}", display_device.DeviceName);

            while windows::Win32::Graphics::Gdi::EnumDisplayDevicesW(
                PCWSTR(display_device.DeviceName.as_ptr()),
                child_num,
                &mut child_device,
                1
            ).as_bool() {
                // Convert device string to readable format for logging
                let device_string = String::from_utf16_lossy(
                    &child_device.DeviceString[..].iter()
                        .take_while(|&&c| c != 0)
                        .map(|&c| c)
                        .collect::<Vec<u16>>()
                );

                println!("checking device: {}", device_string);

                // Check if this is an RDP display
                if device_string.contains("RDPDD") || device_string.contains("RDP") {
                    // Convert device name to string
                    let device_name = String::from_utf16_lossy(
                        &child_device.DeviceName[..].iter()
                            .take_while(|&&c| c != 0)
                            .map(|&c| c)
                            .collect::<Vec<u16>>()
                    );
                    
                    // Check if device is active
                    if (child_device.StateFlags & 0x1) != 0 { // DISPLAY_DEVICE_ACTIVE
                        rdp_display = Some(device_name.clone());
                        println!("found active RDP display: {}", device_name);
                        break;
                    }
                }
                
                child_num += 1;
            }

            if rdp_display.is_some() {
                break;
            }
            dev_num += 1;
        }

        let display_name = if let Some(name) = rdp_display {
            name
        } else {
            // Try fallback display name format
            format!("\\\\.\\DISPLAY1")  // Use local device format
        };

        println!("using display name: {}", display_name);

        // Create DC directly from the display device
        let mut dev_mode = DEVMODEW::default();
        dev_mode.dmSize = std::mem::size_of::<DEVMODEW>() as u16;

        // Convert display name to wide string
        let display_name_w: Vec<u16> = format!("{}\0", display_name).encode_utf16().collect();

        if !EnumDisplaySettingsW(
            PCWSTR(display_name_w.as_ptr()),
            ENUM_CURRENT_SETTINGS,
            &mut dev_mode,
        ).as_bool() {
            println!("failed to get display settings for {}: {:?}", 
                display_name,
                windows::core::Error::from_win32());
            return Ok(());
        }

        let width = dev_mode.dmPelsWidth as i32;
        let height = dev_mode.dmPelsHeight as i32;
        
        println!("found RDP display settings: {}x{} for {}", width, height, display_name);

        // Create a new DC for the remote display
        let remote_dc = CreateDCA(
            windows::core::PCSTR(b"DISPLAY\0".as_ptr()),
            windows::core::PCSTR(display_name.as_bytes().as_ptr()),
            None,
            None,
        );

        if remote_dc.is_invalid() {
            println!("failed to create remote DC: {:?}", windows::core::Error::from_win32());
            return Ok(());
        }

        // Rest of the capture code using remote_dc instead of hdc
        let hdc_mem = CreateCompatibleDC(remote_dc);
        if hdc_mem.is_invalid() {
            DeleteDC(remote_dc);
            println!("failed to create compatible DC: {:?}", windows::core::Error::from_win32());
            return Ok(());
        }

        // ... rest of the code remains the same but use remote_dc instead of hdc ...
        let hbitmap = CreateCompatibleBitmap(remote_dc, width, height);
        if hbitmap.is_invalid() {
            DeleteDC(hdc_mem);
            DeleteDC(remote_dc);
            println!("failed to create compatible bitmap: {:?}", windows::core::Error::from_win32());
            return Ok(());
        }

        // Select bitmap into DC
        let old_obj = SelectObject(hdc_mem, hbitmap);
        
        // Perform the bit block transfer
        if let Err(e) = BitBlt(
            hdc_mem,
            0,
            0,
            width,
            height,
            remote_dc,
            0,
            0,
            SRCCOPY,
        ) {
            SelectObject(hdc_mem, old_obj);
            DeleteObject(hbitmap);
            DeleteDC(hdc_mem);
            DeleteDC(remote_dc);
            println!("failed to perform BitBlt: {:?}", e);
            return Ok(());
        }

        // Prepare buffer for the image data
        let mut buffer = vec![0u8; (width * height * 4) as usize];
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // Top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD::default()],
        };

        // Get the bits from the bitmap
        let scan_lines = GetDIBits(
            hdc_mem,
            hbitmap,
            0,
            height as u32,
            Some(buffer.as_mut_ptr() as *mut c_void),
            &mut info,
            DIB_RGB_COLORS,
        );

        if scan_lines == 0 {
            println!("failed to get DIB bits: {:?}", windows::core::Error::from_win32());
        } else {
            // Create timestamp for filename
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            
            let filename = screenshots_dir.join(format!("session_{}_{}.png", session_id, timestamp));
            
            // Save the buffer as PNG
            if let Err(e) = save_buffer_as_png(&buffer, width as u32, height as u32, filename.to_str().unwrap()) {
                println!("failed to save PNG: {:?}", e);
            } else {
                println!("successfully saved capture for session {}", session_id);
            }
        }

        // Cleanup
        SelectObject(hdc_mem, old_obj);
        DeleteObject(hbitmap);
        DeleteDC(hdc_mem);

        // Additional cleanup
        DeleteDC(remote_dc);

        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn save_buffer_as_png(
    buffer: &[u8],
    width: u32,
    height: u32,
    filename: &str,
) -> anyhow::Result<()> {
    use image::{ImageBuffer, Rgba};

    let mut img = ImageBuffer::new(width, height);

    for (x, y, pixel) in img.enumerate_pixels_mut() {
        let pos = ((y * width + x) * 4) as usize;
        *pixel = Rgba([
            buffer[pos + 2], // B
            buffer[pos + 1], // G
            buffer[pos],     // R
            buffer[pos + 3], // A
        ]);
    }

    img.save(filename)?;
    println!("saved capture to {}", filename);
    Ok(())
}



#[cfg(not(target_os = "windows"))]
async fn capture_all_sessions() -> anyhow::Result<()> {
    println!("rdp capture only available on windows");
    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    println!("starting rdp example...");

    println!("starting continuous capture...");
    capture_all_sessions().await?;

    Ok(())
}
