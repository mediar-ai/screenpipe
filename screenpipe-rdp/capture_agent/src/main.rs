use image::{ImageBuffer, Rgba};
use std::fs::{File, OpenOptions, create_dir_all};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::{env, thread};
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::UI::WindowsAndMessaging::GetSystemMetrics;
use windows::Win32::UI::WindowsAndMessaging::{SM_CXSCREEN, SM_CYSCREEN};

fn desktop_path_for_current_user() -> Option<PathBuf> {
    if let Ok(userprofile) = env::var("USERPROFILE") {
        let mut p = PathBuf::from(userprofile);
        p.push("Desktop");
        Some(p)
    } else {
        None
    }
}

fn log_message(msg: &str) {
    if let Some(localappdata) = desktop_path_for_current_user() {
        let mut log_dir: PathBuf = PathBuf::from(localappdata);
        log_dir.push("CaptureAgent");
        _ = create_dir_all(&log_dir);
        log_dir.push("capture_agent.log");
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&log_dir) {
            let _ = writeln!(f, "{}", msg);
        }
    } else {
        _ = writeln!(std::io::stderr(), "{}", msg);
    }
}

fn capture_once() -> windows::core::Result<Option<Vec<u8>>> {
    unsafe {
        let width = GetSystemMetrics(SM_CXSCREEN);
        let height = GetSystemMetrics(SM_CYSCREEN);

        let hdesktop_dc: HDC = GetDC(None);
        if hdesktop_dc.is_invalid() {
            return Ok(None);
        }

        let mem_dc: HDC = CreateCompatibleDC(Some(hdesktop_dc));
        if mem_dc.is_invalid() {
            ReleaseDC(None, hdesktop_dc);
            return Ok(None);
        }

        let hbmp: HBITMAP = CreateCompatibleBitmap(hdesktop_dc, width, height);
        if hbmp.is_invalid() {
            _ = DeleteDC(mem_dc);
            _ = ReleaseDC(None, hdesktop_dc);
            return Ok(None);
        }

        let old: HGDIOBJ = SelectObject(mem_dc, hbmp.into());

        let _ = BitBlt(
            mem_dc,
            0,
            0,
            width,
            height,
            Some(hdesktop_dc),
            0,
            0,
            SRCCOPY,
        );

        let mut bmi: BITMAPINFO = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0 as u32,
                ..Default::default()
            },
            bmiColors: [RGBQUAD::default(); 1],
        };

        let row_bytes: usize = (width * 4) as usize;
        let mut buffer: Vec<u8> = vec![0u8; row_bytes * height as usize];

        let scanlines = GetDIBits(
            mem_dc,
            hbmp,
            0,
            height as u32,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        // cleanup GDI
        SelectObject(mem_dc, old);
        _ = DeleteObject(hbmp.into());
        _ = DeleteDC(mem_dc);
        _ = ReleaseDC(None, hdesktop_dc);

        if scanlines == 0 {
            return Ok(None);
        }

        // convert BGRA -> RGBA
        for chunk in buffer.chunks_exact_mut(4) {
            let b = chunk[0];
            let g = chunk[1];
            let r = chunk[2];
            chunk[0] = r;
            chunk[1] = g;
            chunk[2] = b;
        }

        if let Some(img) = ImageBuffer::<Rgba<u8>, _>::from_raw(width as u32, height as u32, buffer)
        {
            let mut png_buf: Vec<u8> = Vec::new();
            img.write_to(
                &mut std::io::Cursor::new(&mut png_buf),
                image::ImageFormat::Png,
            )
            .unwrap();
            return Ok(Some(png_buf));
        }

        Ok(None)
    }
}

fn main() -> windows::core::Result<()> {
    log_message("Capture agent started");
    let client_id: u64 = env::args().nth(1).unwrap().parse().unwrap();

    loop {
        match capture_once() {
            Ok(Some(png)) => {
                log_message(&format!("Captured {} bytes", png.len()));

                let save_dir: &Path = Path::new("C:\\session_manager");
                _ = create_dir_all(&save_dir).unwrap();

                let now: u64 = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs();

                File::create_new(&format!(
                    "C:\\session_manager\\client{}_{}.png",
                    client_id, now
                ))
                .unwrap()
                .write_all(&png)
                .unwrap();
            }
            Ok(None) => {
                log_message("Failed to capture screen");
            }
            Err(e) => {
                log_message(&format!("Capture error: {:?}", e));
            }
        }

        thread::sleep(Duration::from_secs(10));
    }
}
