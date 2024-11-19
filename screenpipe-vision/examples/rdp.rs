#[cfg(target_os = "windows")]
use windows::Win32::System::RemoteDesktop::{
    WTSActive, WTSEnumerateSessionsW, WTSQuerySessionInformationW, WTS_CURRENT_SERVER_HANDLE,
    WTS_INFO_CLASS, WTS_SESSION_INFOW,
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

use std::ffi::c_void;
use std::fs;
use std::path::Path;

#[cfg(target_os = "windows")]
async fn capture_all_sessions() -> anyhow::Result<()> {
    // Create screenshots directory if it doesn't exist
    let screenshots_dir = Path::new("screenshots");
    if !screenshots_dir.exists() {
        println!("creating screenshots directory...");
        fs::create_dir_all(screenshots_dir)?;
    }

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
            println!("processing session {}", session.SessionId);

            // Get session username to verify we have access
            let mut bytes_returned: u32 = 0;
            let mut username = PWSTR::null();

            unsafe {
                match WTSQuerySessionInformationW(
                    WTS_CURRENT_SERVER_HANDLE,
                    session.SessionId,
                    WTS_INFO_CLASS(5), // WTSUserName
                    &mut username,
                    &mut bytes_returned,
                ) {
                    Ok(_) => {
                        let username_str = username.to_string()?;
                        println!(
                            "session {} belongs to user: {}",
                            session.SessionId, username_str
                        );
                    }
                    Err(e) => {
                        println!(
                            "warning: couldn't get username for session {}: {:?}",
                            session.SessionId, e
                        );
                    }
                }
            }

            // Create DC for this session
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
        } else {
            println!("skipping inactive session {}", session.SessionId);
        }
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

    println!("checking permissions...");
    let err = check_rdp_permissions().await;
    if let Err(e) = err {
        println!("error checking permissions: {:?}", e);
    }

    println!("starting capture...");
    let err = capture_all_sessions().await;
    if let Err(e) = err {
        println!("error capturing session: {:?}", e);
    }

    println!("example completed successfully");
    Ok(())
}
