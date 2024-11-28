use std::time::{SystemTime, UNIX_EPOCH};
use byteorder::{LittleEndian, ReadBytesExt};
use std::io::Cursor;
use std::env;

use windows::core::{PCSTR, PWSTR};
use windows::Win32::Foundation::*;
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::System::RemoteDesktop::*;
use windows_sys::Win32::System::StationsAndDesktops::*;
use windows::Win32::UI::WindowsAndMessaging::*;
use image::{ImageBuffer, Rgba};
use tokio::runtime::Runtime;
use windows::Win32::System::RemoteDesktop::{
    WTSVirtualChannelOpenEx
};
use windows::core::Error;

fn capture_remote_screen(server_handle: HANDLE, session_id: u32) {
    unsafe {
        // First check if the session is active
        let mut session_state: u32 = 0;
        let mut bytes_returned: u32 = 0;
        
        // if !WTSQuerySessionInformationW(
        //     server_handle,
        //     session_id,
        //     WTS_INFO_CLASS(5), // WTSConnectState
        //     &mut session_state as *mut u32 as *mut _,
        //     &mut bytes_returned,
        // ).is_ok() {
        //     eprintln!("Failed to query session state: {:?}", Error::from_win32());
        //     return;
        // }

        // // Only proceed if session is active (WTSActive = 0)
        // if session_state != 0 {
        //     println!("Session {} is not in active state", session_id);
        //     return;
        // }

        // Try to open with elevated privileges
        let channel = WTSVirtualChannelOpenEx(
            session_id,
            PCSTR("RDPGFX\0".as_ptr()),
            WTS_CHANNEL_OPTION_DYNAMIC_PRI_HIGH | WTS_CHANNEL_OPTION_DYNAMIC_PRI_REAL
        );

        if channel.is_err() {
            let error = Error::from_win32();
            eprintln!("Failed to open virtual channel: {:?}", error);
            
            // Try alternative channel names
            let channel = WTSVirtualChannelOpenEx(
                session_id,
                PCSTR("RDPDISPLAY\0".as_ptr()),
                WTS_CHANNEL_OPTION_DYNAMIC_PRI_HIGH
            );
            
            if channel.is_err() {
                eprintln!("Failed to open RDPDISPLAY channel: {:?}", Error::from_win32());
                return;
            }
        }

        // Query display info
        let mut buffer_size: u32 = 0;
        let mut buffer: *mut std::ffi::c_void = std::ptr::null_mut();
        
        if WTSVirtualChannelQuery(
            channel.clone().unwrap(),
            WTS_VIRTUAL_CLASS(0),
            &mut buffer,
            &mut buffer_size
        ).is_ok() {
            let buffer_slice = std::slice::from_raw_parts(
                buffer as *const u8,
                buffer_size as usize
            );
            
            // Create a cursor to read the buffer
            let mut cursor = Cursor::new(buffer_slice);
            
            // Read header information
            let header_size = cursor.read_u32::<LittleEndian>().unwrap();
            let width = cursor.read_u32::<LittleEndian>().unwrap();
            let height = cursor.read_u32::<LittleEndian>().unwrap();
            let bpp = cursor.read_u32::<LittleEndian>().unwrap();
            
            println!("Remote display: {}x{} with {} bpp", width, height, bpp);
            
            // Calculate image data size
            let stride = ((width * bpp + 31) / 32) * 4; // 32-bit aligned
            let image_size = (stride * height) as usize;
            
            // Read the actual image data
            let mut image_data = vec![0u8; image_size];
            let start_pos = header_size as usize;
            image_data.copy_from_slice(&buffer_slice[start_pos..start_pos + image_size]);
            
            // Convert to RGBA format if necessary
            let rgba_data = match bpp {
                32 => image_data,
                24 => {
                    let mut rgba = Vec::with_capacity(width as usize * height as usize * 4);
                    for chunk in image_data.chunks(3) {
                        rgba.extend_from_slice(chunk);
                        rgba.push(255); // Alpha channel
                    }
                    rgba
                },
                16 => {
                    let mut rgba = Vec::with_capacity(width as usize * height as usize * 4);
                    for chunk in image_data.chunks(2) {
                        let pixel = u16::from_le_bytes([chunk[0], chunk[1]]);
                        // 16-bit RGB565 to RGBA8888
                        let r = ((pixel >> 11) & 0x1F) as u8 * 8;
                        let g = ((pixel >> 5) & 0x3F) as u8 * 4;
                        let b = (pixel & 0x1F) as u8 * 8;
                        rgba.extend_from_slice(&[r, g, b, 255]);
                    }
                    rgba
                },
                _ => {
                    eprintln!("Unsupported bits per pixel: {}", bpp);
                    return;
                }
            };
            
            // Create image buffer
            let img_buffer = ImageBuffer::<Rgba<u8>, _>::from_raw(
                width,
                height,
                rgba_data,
            ).unwrap();
            
            // Save the image
            let time_now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            
            if let Err(e) = img_buffer.save(format!("rdp_screenshot_{}.png", time_now)) {
                eprintln!("failed to save screenshot: {}", e);
            } else {
                println!("screenshot saved to rdp_screenshot_{}.png", time_now);
            }
            
            WTSFreeMemory(buffer);
        }

        WTSVirtualChannelClose(channel.unwrap());
    }
}

fn main() -> windows::core::Result<()> {


    // Create Tokio runtime
    let rt = Runtime::new().unwrap();
    let _guard = rt.enter();

    unsafe {
        // Enumerate all sessions on the current server
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
    
        for session_info in sessions_slice {
            println!("Session ID: {}", session_info.SessionId);
            
            // Add more session state information
            let mut buffer_size: u32 = 0;
            let mut buffer_ptr: *mut PWSTR = std::ptr::null_mut();
            
           

            let mut winstation_ptr: *mut u16 = std::ptr::null_mut();
            let mut bytes_returned: u32 = 0;

            if WTSQuerySessionInformationW(
                server_handle,
                session_info.SessionId,
                WTS_INFO_CLASS(6), // WTSWinStationName
                &mut winstation_ptr as *mut *mut u16 as *mut _,
                &mut bytes_returned,
            ).is_ok() {
                let winstation = if !winstation_ptr.is_null() {
                    String::from_utf16_lossy(std::slice::from_raw_parts(
                        winstation_ptr,
                        (bytes_returned / 2 - 1) as usize,
                    ))
                } else {
                    "Unknown".to_string()
                };
                
                println!("Session {} winstation: {}", session_info.SessionId, winstation);
                
                
                // Check if it's an RDP session
                if winstation.contains("RDP") || winstation.contains("Tcp") || session_info.State.0 < 7 {
                    println!("Found RDP session: {}", session_info.SessionId);
                    capture_remote_screen(server_handle, session_info.SessionId);
                }

                WTSFreeMemory(winstation_ptr as _);
            }
        }

        // Free the allocated memory
        WTSFreeMemory(sessions as _);
    }

    Ok(())
}
