#[cfg(target_os = "windows")]
async fn capture_session(session_id: u32) -> anyhow::Result<()> {
    use anyhow::Result;
    use std::ptr::null_mut;
    use tokio::sync::mpsc;
    use windows::Win32::System::RemoteDesktop::{
        WTSActive, WTSEnumerateSessionsW, WTSVirtualChannelClose, WTSVirtualChannelOpen,
        WTSVirtualChannelRead, WTSVirtualChannelWrite, WTS_CURRENT_SERVER_HANDLE,
        WTS_SESSION_INFOW,
    };

    const CHANNEL_NAME: &str = "SCREENCAP\0";
    const BUFFER_SIZE: u32 = 65536;

    let mut session_count: u32 = 0;
    let mut sessions: *mut WTS_SESSION_INFOW = null_mut();

    // Get all sessions
    let success = unsafe {
        WTSEnumerateSessionsW(
            WTS_CURRENT_SERVER_HANDLE,
            0,
            1,
            &mut sessions,
            &mut session_count,
        )
    };

    if success == 0 {
        return Err(anyhow::anyhow!("failed to enumerate sessions"));
    }

    let sessions_slice = unsafe { std::slice::from_raw_parts(sessions, session_count as usize) };

    for session in sessions_slice {
        if session.State == WTSActive {
            let channel = unsafe {
                WTSVirtualChannelOpen(
                    WTS_CURRENT_SERVER_HANDLE,
                    session.SessionId,
                    CHANNEL_NAME.as_ptr() as *mut i8,
                )
            };

            if channel.is_null() {
                println!("failed to open channel for session {}", session.SessionId);
                continue;
            }

            let mut buffer = vec![0u8; BUFFER_SIZE as usize];
            let mut bytes_read: u32 = 0;

            loop {
                let success = unsafe {
                    WTSVirtualChannelRead(
                        channel,
                        0,
                        buffer.as_mut_ptr() as *mut i8,
                        BUFFER_SIZE,
                        &mut bytes_read,
                    )
                };

                if success == 0 {
                    break;
                }

                if bytes_read > 0 {
                    println!(
                        "session {}: received {} bytes",
                        session.SessionId, bytes_read
                    );
                }
            }

            unsafe { WTSVirtualChannelClose(channel) };
        }
    }

    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    #[cfg(target_os = "windows")]
    capture_session(1).await;

    Ok(())
}
