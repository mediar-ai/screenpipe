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
fn enable_required_privileges() -> anyhow::Result<()> {
    use windows::Win32::Foundation::CloseHandle;

    unsafe {
        let mut token_handle = HANDLE::default();
        OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_QUERY | TOKEN_ADJUST_PRIVILEGES,
            &mut token_handle,
        )?;

        // List of privileges we need
        let required_privilege_names = [
            "SeTcbPrivilege",
            "SeDebugPrivilege",
            "SeImpersonatePrivilege",
            "SeAssignPrimaryTokenPrivilege",
            "SeIncreaseQuotaPrivilege",
        ];

        for privilege_name in required_privilege_names.iter() {
            let mut tp = TOKEN_PRIVILEGES {
                PrivilegeCount: 1,
                Privileges: [LUID_AND_ATTRIBUTES {
                    Luid: windows::Win32::Foundation::LUID::default(),
                    Attributes: SE_PRIVILEGE_ENABLED,
                }],
            };

            let priv_name = format!("{}\0", privilege_name);
            let utf16_name = priv_name.encode_utf16().collect::<Vec<u16>>();
            
            println!("attempting to enable {}...", privilege_name);
            
            if let Err(e) = LookupPrivilegeValueW(
                None,
                PWSTR(utf16_name.as_ptr() as *mut u16),
                &mut tp.Privileges[0].Luid,
            ) {
                println!("warning: failed to lookup {}: {:?}", privilege_name, e);
                continue;
            }

            match AdjustTokenPrivileges(
                token_handle,
                false,
                Some(&tp),
                0,
                None,
                None,
            ) {
                Ok(_) => {
                    let result = windows::Win32::Foundation::GetLastError();
                    if result == windows::Win32::Foundation::ERROR_SUCCESS {
                        println!("successfully enabled {}", privilege_name);
                    } else {
                        println!("failed to enable {} (error: {:?})", privilege_name, result);
                    }
                }
                Err(e) => println!("failed to adjust privileges for {}: {:?}", privilege_name, e),
            }
        }

        CloseHandle(token_handle);
        Ok(())
    }
}

#[cfg(target_os = "windows")]
async fn capture_all_sessions() -> anyhow::Result<()> {
    use windows::Win32::Foundation::CloseHandle;

    println!("enabling privileges...");
    if let Err(e) = enable_required_privileges() {
        println!("failed to enable privileges: {:?}", e);
    }
    
    // Create screenshots directory if it doesn't exist
    let screenshots_dir = Path::new("screenshots");
    if !screenshots_dir.exists() {
        println!("creating screenshots directory...");
        fs::create_dir_all(screenshots_dir)?;
    }

    loop {
        println!("capturing new round of screenshots...");
        
        // Check privileges before attempting capture
        println!("checking current privileges...");
        check_rdp_permissions().await?;
        
        let mut session_count: u32 = 0;
        let mut sessions: *mut WTS_SESSION_INFOW = std::ptr::null_mut();

        unsafe {
            WTSEnumerateSessionsW(
                WTS_CURRENT_SERVER_HANDLE,
                0,
                1,
                &mut sessions,
                &mut session_count,
            )?;
        }

        let sessions_slice = unsafe { std::slice::from_raw_parts(sessions, session_count as usize) };

        println!("found {} sessions", session_count);

        for session in sessions_slice {
            if session.State == WTSActive {
                println!("processing session {} (state: {:?})", session.SessionId, session.State);

                // Get user token for the session
                let mut user_token = HANDLE::default();
                unsafe {
                    match WTSQueryUserToken(session.SessionId, &mut user_token) {
                        Ok(_) => {
                            println!("successfully got user token for session {}", session.SessionId);
                            // Impersonate the user
                            if let Ok(_) = ImpersonateLoggedOnUser(user_token) {
                                // Now create DC and capture screen
                                let dc_name = format!("DISPLAY#{}\0", session.SessionId);
                                println!("creating DC with name: {}", dc_name.trim_end_matches('\0'));

                                let hdc = unsafe {
                                    CreateDCA(
                                        windows::core::PCSTR(b"DISPLAY\0".as_ptr()),
                                        windows::core::PCSTR(dc_name.as_bytes().as_ptr()),
                                        None,
                                        None,
                                    )
                                };

                                // Create compatible DC and bitmap
                                let hdc_mem = unsafe { CreateCompatibleDC(hdc) };
                                let hbitmap = unsafe {
                                    CreateCompatibleBitmap(
                                        hdc, 1920, // width - you might want to get this from session info
                                        1080, // height - you might want to get this from session info
                                    )
                                };

                                unsafe {
                                    SelectObject(hdc_mem, hbitmap);
                                    BitBlt(hdc_mem, 0, 0, 1920, 1080, hdc, 0, 0, SRCCOPY)?;

                                    // Setup bitmap info
                                    let mut bi = BITMAPINFO {
                                        bmiHeader: BITMAPINFOHEADER {
                                            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                                            biWidth: 1920,
                                            biHeight: -1080, // Negative for top-down
                                            biPlanes: 1,
                                            biBitCount: 32,
                                            biCompression: 0,
                                            biSizeImage: 0,
                                            biXPelsPerMeter: 0,
                                            biYPelsPerMeter: 0,
                                            biClrUsed: 0,
                                            biClrImportant: 0,
                                        },
                                        ..Default::default()
                                    };

                                    // Get the actual pixels
                                    let mut buffer = vec![0u8; (1920 * 1080 * 4) as usize];
                                    GetDIBits(
                                        hdc_mem,
                                        hbitmap,
                                        0,
                                        1080,
                                        Some(buffer.as_mut_ptr() as *mut std::ffi::c_void),
                                        &mut bi,
                                        DIB_RGB_COLORS,
                                    );

                                    // Save the image
                                    let timestamp = std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)?
                                        .as_secs();

                                    let filename = format!(
                                        "screenshots/session_{}_capture_{}.png",
                                        session.SessionId, timestamp
                                    );
                                    save_buffer_as_png(&buffer, 1920, 1080, &filename)?;

                                    // Cleanup
                                    DeleteObject(hbitmap);
                                    DeleteDC(hdc_mem);
                                    DeleteDC(hdc);
                                }

                                // Revert impersonation when done
                                RevertToSelf()?;
                            }
                            CloseHandle(user_token);
                        }
                        Err(e) => {
                            println!(
                                "failed to get user token for session {}: {:?}", 
                                session.SessionId, 
                                e
                            );
                            println!("please ensure you're running as SYSTEM using: psexec -s -i cmd.exe");
                            println!("or try: runas /user:SYSTEM <program>");
                            return Err(anyhow::anyhow!("Access denied - needs to run as SYSTEM"));
                        }
                    }
                }
            } else {
                println!("skipping inactive session {} (state: {:?})", session.SessionId, session.State);
            }
        }

        // Add delay between captures
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }

    Ok(())
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

#[cfg(target_os = "windows")]
async fn check_rdp_permissions() -> anyhow::Result<()> {
    println!("checking rdp permissions...");

    unsafe {
        let mut token_handle = HANDLE::default();
        OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_QUERY,
            &mut token_handle as *mut HANDLE,
        )?;
        println!("successfully opened process token");

        let mut return_length = 0;
        let result =
            GetTokenInformation(token_handle, TokenPrivileges, None, 0, &mut return_length);

        if result.is_err() {
            println!("got required buffer size: {} bytes", return_length);

            // Allocate the required buffer
            let buffer = LocalAlloc(LPTR, return_length as usize)?;
            let privileges_ptr = buffer.0 as *mut TOKEN_PRIVILEGES;

            // Second call with properly sized buffer
            GetTokenInformation(
                token_handle,
                TokenPrivileges,
                Some(buffer.0 as *mut c_void),
                return_length,
                &mut return_length,
            )?;

            let privileges = &*privileges_ptr;
            println!("found {} privileges", privileges.PrivilegeCount);

            let privilege_array = std::slice::from_raw_parts(
                privileges.Privileges.as_ptr(),
                privileges.PrivilegeCount as usize,
            );

            for privilege in privilege_array {
                // First call to get the required name length
                let mut name_len = 0;
                let name_result =
                    LookupPrivilegeNameW(None, &privilege.Luid, PWSTR::null(), &mut name_len);

                // Ignore the expected error from getting the size
                if name_len > 0 {
                    // Allocate buffer with the correct size (+1 for null terminator)
                    let mut name = vec![0u16; name_len as usize + 1];
                    let mut final_len = name_len;

                    // Second call to actually get the name
                    match LookupPrivilegeNameW(
                        None,
                        &privilege.Luid,
                        PWSTR(name.as_mut_ptr()),
                        &mut final_len,
                    ) {
                        Ok(_) => {
                            let priv_name = String::from_utf16_lossy(&name[..final_len as usize]);
                            println!(
                                "privilege: {} (enabled: {})",
                                priv_name,
                                privilege.Attributes & SE_PRIVILEGE_ENABLED == SE_PRIVILEGE_ENABLED
                            );
                        }
                        Err(e) => {
                            println!("failed to get privilege name: {:?}", e);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
async fn check_rdp_permissions() -> anyhow::Result<()> {
    println!("rdp permissions check only available on windows");
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

    println!("checking permissions before enabling privileges...");
    check_rdp_permissions().await?;

    println!("enabling privileges...");
    enable_required_privileges()?;

    println!("checking permissions after enabling privileges...");
    check_rdp_permissions().await?;

    println!("starting continuous capture...");
    capture_all_sessions().await?;

    Ok(())
}
