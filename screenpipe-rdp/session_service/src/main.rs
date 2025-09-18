use std::env;
use std::ffi::{OsString, c_void};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::ptr::null_mut;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
use windows::Win32::System::Environment::{CreateEnvironmentBlock, DestroyEnvironmentBlock};
use windows::{
    Win32::{
        Foundation::*,
        System::{RemoteDesktop::*, Threading::*},
    },
    core::{HSTRING, PCWSTR, PWSTR},
};
use windows_service::service_control_handler::ServiceStatusHandle;
use windows_service::{
    define_windows_service,
    service::{
        ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
        ServiceType,
    },
    service_control_handler::{self, ServiceControlHandlerResult},
    service_dispatcher,
};

const SERVICE_NAME: &str = "MySessionService";

// This macro generates the ffi entry point for the service
define_windows_service!(ffi_service_main, my_service_main);

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
                if WTSQueryUserToken(session_id, &mut token).is_ok() {
                    log_to_file(&format!("Got user token for session {}\n", session_id));

                    spawn_capture_agent(token, session_id);

                    _ = CloseHandle(token);
                } else {
                    log_to_file(&format!(
                        "WTSQueryUserToken failed for session {}: {:?}\n",
                        session_id,
                        windows::core::Error::from_thread()
                    ));
                }
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
        // No need for that
        // // Set token session ID so it runs inside the right RDP session
        // let sid_bytes: u32 = std::mem::size_of::<u32>() as u32;
        // let sid_ptr: *const u32 = &session_id;
        // if SetTokenInformation(user_token, TokenSessionId, sid_ptr as *const _, sid_bytes).is_err()
        // {
        //     log_to_file(&format!(
        //         "SetTokenInformation(TokenSessionId) failed for session {}: {:?}\n",
        //         session_id,
        //         windows::core::Error::from_thread()
        //     ));
        //     return;
        // }

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

fn run_service() -> windows_service::Result<()> {
    let running: Arc<AtomicBool> = Arc::new(AtomicBool::new(true));
    let stop_signal: Arc<AtomicBool> = running.clone();

    // Register a handler for stop/ctrl events
    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Stop => {
                stop_signal.store(false, Ordering::SeqCst);
                ServiceControlHandlerResult::NoError
            }
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    let status_handle: ServiceStatusHandle =
        service_control_handler::register(SERVICE_NAME, event_handler)?;

    log_to_file("Service started\n");

    // Notify SCM we are running
    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    log_to_file("Service running\n");

    while running.load(Ordering::SeqCst) {
        enumerate_sessions();

        log_to_file("Enumerated sessions\n");

        // Sleep for 60 seconds between scans
        // it should check if the agent already exists in the user session
        // but for PoC thats okay, Maybe the agent itself could have a mutex
        for _ in 0..60 {
            if !running.load(Ordering::SeqCst) {
                break;
            }
            std::thread::sleep(Duration::from_secs(1));
        }
    }

    log_to_file("Service stopping\n");

    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Stopped,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    Ok(())
}

fn my_service_main(_arguments: Vec<OsString>) {
    if let Err(e) = run_service() {
        log_to_file(&format!("Service failed: {:?}\n", e));
    }
}

fn main() -> windows_service::Result<()> {
    // Entry point for the SCM
    service_dispatcher::start(SERVICE_NAME, ffi_service_main)?;
    Ok(())
}
