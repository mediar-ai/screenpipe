use image::DynamicImage;

// TODO: this file could work for things like macos client connecting on a linux or stuff like that (tmux?)

// TODO: atm ignored windows and included windows not supported in RDP, not sure about multiple monitors

#[allow(unused)]
pub async fn capture_rdp_session(session_id: &str) -> anyhow::Result<DynamicImage> {
    #[cfg(target_os = "windows")]
    {
        use image::{ImageBuffer, Rgba};
        use windows::Win32::Graphics::Gdi::{
            BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateDCA, DeleteDC, DeleteObject,
            GetDIBits, SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, SRCCOPY,
        };

        // Create DC for this session
        let dc_name = format!("DISPLAY#{}\0", session_id);
        println!("creating dc with name: {}", dc_name.trim_end_matches('\0'));

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
                hdc, 1920, // width - you might want to make this configurable
                1080, // height - you might want to make this configurable
            )
        };

        let mut buffer = unsafe {
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

            // Cleanup
            DeleteObject(hbitmap);
            DeleteDC(hdc_mem);
            DeleteDC(hdc);

            buffer
        };

        // Convert buffer to DynamicImage
        let mut img = ImageBuffer::new(1920, 1080);
        for (x, y, pixel) in img.enumerate_pixels_mut() {
            let pos = ((y * 1920 + x) * 4) as usize;
            *pixel = Rgba([
                buffer[pos + 2], // B
                buffer[pos + 1], // G
                buffer[pos],     // R
                buffer[pos + 3], // A
            ]);
        }

        return Ok(DynamicImage::ImageRgba8(img));
    }

    #[cfg(not(target_os = "windows"))]
    {
        anyhow::bail!("rdp capture only supported on windows")
    }
}

#[cfg(target_os = "windows")]
pub async fn list_rdp_sessions() -> anyhow::Result<Vec<(u32, String)>> {
    use windows::core::PWSTR;
    use windows::Win32::System::RemoteDesktop::{
        WTSActive, WTSEnumerateSessionsW, WTSQuerySessionInformationW, WTS_CURRENT_SERVER_HANDLE,
        WTS_INFO_CLASS, WTS_SESSION_INFOW,
    };

    let mut session_count: u32 = 0;
    let mut sessions: *mut WTS_SESSION_INFOW = std::ptr::null_mut();
    let mut result = Vec::new();

    unsafe {
        WTSEnumerateSessionsW(
            WTS_CURRENT_SERVER_HANDLE,
            0,
            1,
            &mut sessions,
            &mut session_count,
        )?;

        let sessions_slice = std::slice::from_raw_parts(sessions, session_count as usize);

        for session in sessions_slice {
            if session.State == WTSActive {
                let mut bytes_returned: u32 = 0;
                let mut username = PWSTR::null();

                match WTSQuerySessionInformationW(
                    WTS_CURRENT_SERVER_HANDLE,
                    session.SessionId,
                    WTS_INFO_CLASS(5), // WTSUserName
                    &mut username,
                    &mut bytes_returned,
                ) {
                    Ok(_) => {
                        let username_str = username.to_string()?;
                        result.push((session.SessionId, username_str));
                    }
                    Err(_) => {
                        result.push((session.SessionId, String::from("unknown")));
                    }
                }
            }
        }
    }

    Ok(result)
}

#[cfg(not(target_os = "windows"))]
pub async fn list_rdp_sessions() -> anyhow::Result<Vec<(u32, String)>> {
    anyhow::bail!("rdp session listing only supported on windows")
}

#[cfg(target_os = "windows")]
pub struct SessionInfo {
    pub session_id: u32,
    pub username: String,
    pub domain: String,
    pub client_name: String,
    pub client_address: String,
    pub connection_state: String,
}

#[cfg(target_os = "windows")]
pub async fn get_session_details(session_id: u32) -> anyhow::Result<SessionInfo> {
    use windows::core::PWSTR;
    use windows::Win32::System::RemoteDesktop::{
        WTSQuerySessionInformationW, WTS_CURRENT_SERVER_HANDLE, WTS_INFO_CLASS,
    };

    unsafe {
        let mut query_info = |info_class: WTS_INFO_CLASS| -> anyhow::Result<String> {
            let mut bytes_returned: u32 = 0;
            let mut buffer = PWSTR::null();

            WTSQuerySessionInformationW(
                WTS_CURRENT_SERVER_HANDLE,
                session_id,
                info_class,
                &mut buffer,
                &mut bytes_returned,
            )?;

            Ok(buffer
                .to_string()
                .unwrap_or_else(|_| String::from("unknown")))
        };

        let info = SessionInfo {
            session_id,
            username: query_info(WTS_INFO_CLASS(5))?, // WTSUserName
            domain: query_info(WTS_INFO_CLASS(7))?,   // WTSDomainName
            client_name: query_info(WTS_INFO_CLASS(10))?, // WTSClientName
            client_address: query_info(WTS_INFO_CLASS(14))?, // WTSClientAddress
            connection_state: query_info(WTS_INFO_CLASS(8))?, // WTSConnectState
        };

        Ok(info)
    }
}

#[cfg(not(target_os = "windows"))]
pub struct SessionInfo {
    pub session_id: u32,
    pub username: String,
    pub domain: String,
    pub client_name: String,
    pub client_address: String,
    pub connection_state: String,
}

#[cfg(not(target_os = "windows"))]
pub async fn get_session_details(_session_id: u32) -> anyhow::Result<SessionInfo> {
    anyhow::bail!("session details only supported on windows")
}
