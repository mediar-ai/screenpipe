use image::DynamicImage;
use log::{debug, error};
use std::time::{Duration, Instant};
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateDCA, DeleteDC, DeleteObject, GetDIBits, GetDeviceCaps, SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, HORZRES, SRCCOPY, VERTRES
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
};
use windows::Win32::System::ProcessStatus::K32GetModuleFileNameExW;
use windows::Win32::System::Threading::{PROCESS_QUERY_INFORMATION, PROCESS_VM_READ, OpenProcess};
use windows::Win32::System::RemoteDesktop::{
    ProcessIdToSessionId,
};
use std::collections::HashMap;

pub async fn capture_rdp_session(
    session_id: &str,
    ignore_list: &[String],
    include_list: &[String],
) -> anyhow::Result<(
    DynamicImage,
    Vec<(DynamicImage, String, String, bool)>,
    u64,
    Duration,
)> {
    #[cfg(target_os = "windows")]
    {
        use image::{ImageBuffer, Rgba};
        
        let capture_start = Instant::now();

        // Verify session is active
        let session_info = get_session_details(session_id.parse().map_err(|e| {
            debug!("invalid session id '{}': {}", session_id, e);
            anyhow::anyhow!("invalid session id '{}': {}", session_id, e)
        })?).await.map_err(|e| {
            debug!("failed to get session details for '{}': {}", session_id, e);
            anyhow::anyhow!("failed to get session details for '{}': {}", session_id, e)
        })?;

        if session_info.connection_state != "Active" {
            debug!("rdp session '{}' is not active (state: {})", session_id, session_info.connection_state);
            anyhow::bail!("rdp session not active")
        }

        // Capture full screen
        let dc_name = format!("DISPLAY#{}\0", session_id);
        debug!("creating dc with name: {}", dc_name.trim_end_matches('\0'));

        let (full_image, screen_width, screen_height) = unsafe {
            let hdc = CreateDCA(
                windows::core::PCSTR(b"DISPLAY\0".as_ptr()),
                windows::core::PCSTR(dc_name.as_bytes().as_ptr()),
                None,
                None,
            );

            if hdc.is_invalid() {
                error!("failed to create display dc for rdp session '{}' - check if you have the right permissions", session_id);
                anyhow::bail!("failed to create display dc for rdp session '{}' - check if you have the right permissions", session_id);
            }

            let screen_width = GetDeviceCaps(hdc, HORZRES) as usize;
            let screen_height = GetDeviceCaps(hdc, VERTRES) as usize;

            let hdc_mem = CreateCompatibleDC(hdc);
            let hbitmap = CreateCompatibleBitmap(hdc, screen_width as i32, screen_height as i32);

            SelectObject(hdc_mem, hbitmap);
            BitBlt(
                hdc_mem,
                0,
                0,
                screen_width as i32,
                screen_height as i32,
                hdc,
                0,
                0,
                SRCCOPY,
            )?;

            let mut bi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: screen_width as i32,
                    biHeight: -(screen_height as i32),
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

            let buffer_size = screen_width * screen_height * 4;
            let mut buffer = vec![0u8; buffer_size];
            GetDIBits(
                hdc_mem,
                hbitmap,
                0,
                screen_height as u32,
                Some(buffer.as_mut_ptr() as *mut std::ffi::c_void),
                &mut bi,
                DIB_RGB_COLORS,
            );

            DeleteObject(hbitmap);
            DeleteDC(hdc_mem);
            DeleteDC(hdc);

            let mut img = ImageBuffer::new(screen_width as u32, screen_height as u32);
            for (x, y, pixel) in img.enumerate_pixels_mut() {
                let x = x as usize;
                let y = y as usize;
                let pos = (y * screen_width + x) * 4;
                *pixel = Rgba([
                    buffer[pos + 2],
                    buffer[pos + 1],
                    buffer[pos],
                    buffer[pos + 3],
                ]);
            }

            (DynamicImage::ImageRgba8(img), screen_width, screen_height)
        };

        // Capture individual windows
        let mut window_images = Vec::new();
        let windows = list_rdp_windows(session_id.parse().map_err(|e| {
            error!("invalid session id '{}' when listing windows: {}", session_id, e);
            anyhow::anyhow!("invalid session id '{}' when listing windows: {}", session_id, e)
        })?).await.map_err(|e| {
            error!("failed to list windows for rdp session '{}': {}", session_id, e);
            anyhow::anyhow!("failed to list windows for rdp session '{}': {}", session_id, e)
        })?;

        for window_info in windows {
            if !should_capture_window(&window_info.app_name, &window_info.window_title, ignore_list, include_list) {
                continue;
            }

            match capture_rdp_window(session_id, window_info.window_id).await {
                Ok(window_image) => {
                    window_images.push((window_image, window_info.app_name, window_info.window_title, false));
                }
                Err(e) => {
                    error!(
                        "failed to capture window '{}' ({}) in rdp session '{}': {}", 
                        window_info.window_title, 
                        window_info.app_name,
                        session_id,
                        e
                    );
                    // Continue with other windows even if one fails
                    continue;
                }
            }
        }

        if window_images.is_empty() {
            debug!("no windows were captured for rdp session '{}'", session_id);
        }

        let image_hash = crate::utils::calculate_hash(&full_image);
        let capture_duration = capture_start.elapsed();

        Ok((full_image, window_images, image_hash, capture_duration))
    }

    #[cfg(not(target_os = "windows"))]
    {
        error!("rdp capture is only supported on windows");
        anyhow::bail!("rdp capture is only supported on windows")
    }
}



#[cfg(target_os = "windows")]
pub async fn list_rdp_windows(target_session_id: u32) -> anyhow::Result<Vec<WindowInfo>> {
    let windows_list = Vec::new();
    
    unsafe extern "system" fn enum_window_callback(
        hwnd: HWND,
        lparam: windows::Win32::Foundation::LPARAM,
    ) -> windows::Win32::Foundation::BOOL {
        let windows_list = &mut *(lparam.0 as *mut Vec<WindowInfo>);
        let mut process_id: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
        
        let mut session_id: u32 = 0;
        if ProcessIdToSessionId(process_id, &mut session_id).is_ok() {
            if session_id == *(lparam.0 as *const u32).add(1) && IsWindowVisible(hwnd).as_bool() {
                let mut title = [0u16; 512];
                let len = GetWindowTextW(hwnd, &mut title);
                if len > 0 {
                    let window_title = String::from_utf16_lossy(&title[..len as usize]);
                    
                    let process_name = {
                        let process_handle = OpenProcess(
                            PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                            false,
                            process_id,
                        );
                        
                        if let Ok(handle) = process_handle {
                            let mut buffer = [0u16; 260]; // MAX_PATH
                            let len = K32GetModuleFileNameExW(handle, None, &mut buffer);
                            if len > 0 {
                                let path = String::from_utf16_lossy(&buffer[..len as usize]);
                                path.split('\\').last().unwrap_or("unknown").to_string()
                            } else {
                                "unknown".to_string()
                            }
                        } else {
                            "unknown".to_string()
                        }
                    };
                    
                    let window_id = hwnd.0 as u64;
                    WINDOW_HANDLES.with(|handles| {
                        handles.borrow_mut().insert(window_id, hwnd.0);
                    });

                    windows_list.push(WindowInfo {
                        window_id,
                        app_name: process_name,
                        window_title,
                    });
                }
            }
        }
        windows::Win32::Foundation::BOOL(1)
    }

    // Create a struct to hold both the windows_list and target_session_id
    #[repr(C)]
    struct EnumWindowsData {
        windows_list: Vec<WindowInfo>,
        target_session_id: u32,
    }

    let mut data = EnumWindowsData {
        windows_list,
        target_session_id,
    };

    unsafe {
        EnumWindows(
            Some(enum_window_callback),
            windows::Win32::Foundation::LPARAM(&mut data as *mut _ as isize),
        )?;
        
        Ok(data.windows_list)
    }
}

#[cfg(target_os = "windows")]
async fn capture_rdp_window(
    session_id: &str,
    window_id: u64,
) -> anyhow::Result<DynamicImage> {
    use windows::Win32::Foundation::RECT;

    let hwnd = WINDOW_HANDLES.with(|handles| {
        handles
            .borrow()
            .get(&window_id)
            .copied()
            .ok_or_else(|| anyhow::anyhow!("Window handle not found"))
    })?;

    unsafe {
        let hwnd = HWND(hwnd);
        let mut rect: RECT = std::mem::zeroed();
        GetWindowRect(hwnd, &mut rect)?;

        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;

        if width <= 0 || height <= 0 {
            anyhow::bail!("Invalid window dimensions");
        }

        let dc_name = format!("DISPLAY#{}\0", session_id);
        let hdc = CreateDCA(
            windows::core::PCSTR(b"DISPLAY\0".as_ptr()),
            windows::core::PCSTR(dc_name.as_bytes().as_ptr()),
            None,
            None,
        );

        let hdc_mem = CreateCompatibleDC(hdc);
        let hbitmap = CreateCompatibleBitmap(hdc, width, height);

        SelectObject(hdc_mem, hbitmap);
        BitBlt(
            hdc_mem,
            0,
            0,
            width,
            height,
            hdc,
            rect.left,
            rect.top,
            SRCCOPY,
        )?;

        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
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

        let mut buffer = vec![0u8; (width * height * 4) as usize];
        GetDIBits(
            hdc_mem,
            hbitmap,
            0,
            height as u32,
            Some(buffer.as_mut_ptr() as *mut std::ffi::c_void),
            &mut bi,
            DIB_RGB_COLORS,
        );

        DeleteObject(hbitmap);
        DeleteDC(hdc_mem);
        DeleteDC(hdc);

        let mut img = image::ImageBuffer::new(width as u32, height as u32);
        for (x, y, pixel) in img.enumerate_pixels_mut() {
            let x = x as usize;
            let y = y as usize;
            let pos = (y * width as usize + x) * 4;
            *pixel = image::Rgba([
                buffer[pos + 2],
                buffer[pos + 1],
                buffer[pos],
                buffer[pos + 3],
            ]);
        }

        Ok(DynamicImage::ImageRgba8(img))
    }
}

fn should_capture_window(
    app_name: &str,
    window_title: &str,
    ignore_list: &[String],
    include_list: &[String],
) -> bool {
    let app_name_lower = app_name.to_lowercase();
    let title_lower = window_title.to_lowercase();

    // Check ignore list
    if ignore_list.iter().any(|ignore| {
        let ignore_lower = ignore.to_lowercase();
        app_name_lower.contains(&ignore_lower) || title_lower.contains(&ignore_lower)
    }) {
        return false;
    }

    // If include list is empty, capture all non-ignored windows
    if include_list.is_empty() {
        return true;
    }

    // Check include list
    include_list.iter().any(|include| {
        let include_lower = include.to_lowercase();
        app_name_lower.contains(&include_lower) || title_lower.contains(&include_lower)
    })
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
        let query_info = |info_class: WTS_INFO_CLASS| -> anyhow::Result<String> {
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

// Update the WindowInfo struct to store the raw pointer value
#[derive(Clone)]
pub struct WindowInfo {
    pub window_id: u64, // Use a numeric ID instead of raw pointer
    pub app_name: String,
    pub window_title: String,
}

// Keep track of window handles in a thread-local map
thread_local! {
    static WINDOW_HANDLES: std::cell::RefCell<HashMap<u64, *mut std::ffi::c_void>> = std::cell::RefCell::new(HashMap::new());
}
