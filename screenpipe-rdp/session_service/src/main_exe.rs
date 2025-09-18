use std::env;
use std::ffi::c_void;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::ptr::null_mut;
use std::time::Duration;
use windows::Win32::System::Environment::{CreateEnvironmentBlock, DestroyEnvironmentBlock};
use windows::{
    Win32::{
        Foundation::*,
        Security::*,
        System::{RemoteDesktop::*, Threading::*},
    },
    core::{HSTRING, PCWSTR, PWSTR},
};

// THIS BINARY WILL NOT WORK
// This is just a test binary to confirm that is not possible to use `WTSQueryUserToken` without privileges that LocalSystem have

fn log_to_file(msg: &str) {
    let mut f: std::fs::File = OpenOptions::new()
        .create(true)
        .append(true)
        .open("C:\\session_service.log")
        .unwrap();
    _ = f.write_all(msg.as_bytes());
}

fn enumerate_sessions() {
    unsafe {
        let mut session_info: *mut WTS_SESSION_INFOW = null_mut();
        let mut count: u32 = 0;

        if WTSEnumerateSessionsW(
            Some(WTS_CURRENT_SERVER_HANDLE),
            0,
            1,
            &mut session_info,
            &mut count,
        )
        .is_ok()
        {
            let sessions = std::slice::from_raw_parts(session_info, count as usize);
            for s in sessions {
                let session_id = s.SessionId;

                // --- query username ---
                let mut buffer: PWSTR = PWSTR::null();
                let mut bytes_returned: u32 = 0;
                if WTSQuerySessionInformationW(
                    Some(WTS_CURRENT_SERVER_HANDLE),
                    session_id,
                    WTSUserName, // <- use this constant, not WTS_INFO_CLASS::WTSUserName
                    &mut buffer,
                    &mut bytes_returned,
                )
                .is_ok()
                    && !buffer.is_null()
                {
                    // PWSTR::to_string is unsafe because it reads the raw pointer;
                    // we already checked the call succeeded and pointer is non-null.
                    let username: String = buffer
                        .to_string()
                        .unwrap_or_else(|_| "<invalid-utf16>".to_string());
                    log_to_file(&format!(
                        "Found session {} for user {}\n",
                        session_id, username
                    ));
                } else {
                    log_to_file(&format!(
                        "WTSQuerySessionInformationW(WTSUserName) failed for session {}: {:?}\n",
                        session_id,
                        windows::core::Error::from_thread()
                    ));
                }

                if !buffer.is_null() {
                    // free WTS-allocated buffer
                    WTSFreeMemory(buffer.as_ptr() as _);
                }

                let mut token: HANDLE = HANDLE::default();
                // Note: WTSQueryUserToken will not fail if called from a service which runs under SYSTEM (LocalSystem service)
                if WTSQueryUserToken(session_id, &mut token).is_err() {
                    log_to_file(&format!(
                        "WTSQueryUserToken failed for session {}: {:?}\n",
                        session_id,
                        windows::core::Error::from_thread()
                    ));
                    log_to_file(&format!(
                        "WTSQueryUserToken failed for session {}, trying alternative method\n",
                        session_id
                    ));

                    let mut process_token: HANDLE = HANDLE::default();
                    if OpenProcessToken(GetCurrentProcess(), TOKEN_ALL_ACCESS, &mut process_token)
                        .is_ok()
                    {
                        log_to_file("Successfully opened process token with full access\n");

                        // Create a new token via duplication
                        let mut duplicated_token = HANDLE::default();
                        if DuplicateTokenEx(
                            process_token,
                            TOKEN_ALL_ACCESS,
                            None,
                            SecurityImpersonation,
                            TokenPrimary,
                            &mut duplicated_token,
                        )
                        .is_ok()
                        {
                            log_to_file("Successfully duplicated token\n");
                            token = duplicated_token;
                        } else {
                            log_to_file(&format!(
                                "Failed to duplicate token: {:?}\n",
                                windows::core::Error::from_thread()
                            ));
                            _ = CloseHandle(process_token);
                            continue;
                        }
                        _ = CloseHandle(process_token);
                    }
                }

                log_to_file(&format!("Got user token for session {}\n", session_id));
                spawn_capture_agent(token, session_id);

                _ = CloseHandle(token);
            }

            WTSFreeMemory(session_info as _);
        } else {
            log_to_file(&format!(
                "WTSEnumerateSessionsW failed: {:?}\n",
                windows::core::Error::from_thread()
            ));
        }
    }
}

fn spawn_capture_agent(user_token: HANDLE, session_id: u32) {
    unsafe {
        /*
        // Set token session ID so it runs inside the right RDP session
        let sid_bytes: u32 = std::mem::size_of::<u32>() as u32;
        let sid_ptr: *const u32 = &session_id;
        if SetTokenInformation(user_token, TokenSessionId, sid_ptr as *const _, sid_bytes).is_err()
        {
            log_to_file(&format!(
                "SetTokenInformation(TokenSessionId) failed for session {}: {:?}\n",
                session_id,
                windows::core::Error::from_thread()
            ));
            return;
        }
        */

        // Build environment block for this token(pass user's environment variables)
        let mut env: *mut c_void = std::ptr::null_mut();
        if CreateEnvironmentBlock(&mut env, Some(user_token), false).is_err() {
            log_to_file("CreateEnvironmentBlock failed\n");
            return;
        }

        // No more pipe creation needed - the agent will connect to our named pipe
        let mut si: STARTUPINFOW = std::mem::zeroed();
        si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        // si.dwFlags |= STARTF_USESHOWWINDOW;
        // si.wShowWindow = SW_HIDE.0 as u16;

        let exe_dir: PathBuf = env::current_exe().unwrap().parent().unwrap().to_path_buf();
        let capture_agent_path: PathBuf = exe_dir.join("capture_agent.exe");

        log_to_file(&format!(
            "capture_agent_path: '{}'\n",
            capture_agent_path.display()
        ));

        let mut pi: PROCESS_INFORMATION = std::mem::zeroed();
        let app: HSTRING = HSTRING::from(format!(
            "\"{}\" {}",
            capture_agent_path.to_str().unwrap(),
            session_id
        ));

        if CreateProcessAsUserW(
            Some(user_token),
            PCWSTR::null(),
            Some(PWSTR::from_raw(app.as_ptr() as *mut u16)),
            None,
            None,
            false, // No handle inheritance needed
            CREATE_UNICODE_ENVIRONMENT,
            Some(env as _),
            PCWSTR::null(),
            &si,
            &mut pi,
        )
        .is_ok()
        {
            log_to_file(&format!(
                "capture_agent launched in session {}\n",
                session_id
            ));
            _ = CloseHandle(pi.hProcess);
            _ = CloseHandle(pi.hThread);
        } else {
            log_to_file(&format!(
                "CreateProcessAsUserW failed in session {}: {:?}\n",
                session_id,
                windows::core::Error::from_thread()
            ));
        }

        _ = DestroyEnvironmentBlock(env);
    }
}

fn enable_privilege(name: &str) -> windows::core::Result<()> {
    unsafe {
        let mut htoken: HANDLE = HANDLE::default();
        OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_ALL_ACCESS,
            &mut htoken,
        )?;

        let mut luid: LUID = LUID::default();
        LookupPrivilegeValueW(None, &HSTRING::from(name), &mut luid)?;

        let tp = TOKEN_PRIVILEGES {
            PrivilegeCount: 1,
            Privileges: [LUID_AND_ATTRIBUTES {
                Luid: luid,
                Attributes: SE_PRIVILEGE_ENABLED,
            }],
        };
        AdjustTokenPrivileges(htoken, false, Some(&tp), 0, None, None)?;
        CloseHandle(htoken)?;
    }

    Ok(())
}

fn main() {
    // Enable privileges needed
    enable_privilege("SeTcbPrivilege").unwrap();
    enable_privilege("SeAssignPrimaryTokenPrivilege").unwrap();

    log_to_file("Privileges enabled\n");

    loop {
        enumerate_sessions();

        log_to_file("Enumerated sessions\n");

        // Sleep for 60 seconds between scans
        // it should check if the agent already exists in the user session
        // but for PoC thats okay, Maybe the agent itself could have a mutex
        std::thread::sleep(Duration::from_secs(60));
    }
}
