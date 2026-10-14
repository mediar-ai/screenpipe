// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! On-demand metadata for manual feedback. Toolhelp enumerates process identity
//! without reading other processes' command lines or environments.

use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    path::{Path, PathBuf},
};
use windows::{
    core::PWSTR,
    Win32::{
        Foundation::{
            BOOL, ERROR_INSUFFICIENT_BUFFER, ERROR_NO_MORE_FILES, HANDLE, HWND, LPARAM, MAX_PATH,
        },
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
                TH32CS_SNAPPROCESS,
            },
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
        UI::WindowsAndMessaging::{
            EnumWindows, GetClassNameW, GetWindowThreadProcessId, IsWindowVisible,
        },
    },
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessEntry {
    pid: u32,
    parent_pid: u32,
    executable: String,
    ownership: &'static str,
}

struct ProcessIdentity {
    parent_pid: u32,
    executable: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowEntry {
    pid: u32,
    class: String,
    host: &'static str,
    ownership: &'static str,
}

#[derive(Default)]
struct WindowCollector {
    windows: Vec<WindowEntry>,
    errors: Vec<String>,
    related: HashSet<u32>,
}

fn probe_error(probe: &str, pid: Option<u32>, error: windows::core::Error) -> String {
    format!(
        "{probe} pid={pid:?} HRESULT=0x{:08X}: {error}",
        error.code().0 as u32
    )
}

fn process_identities(errors: &mut Vec<String>) -> HashMap<u32, ProcessIdentity> {
    let mut processes = HashMap::new();
    let snapshot = match unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) } {
        Ok(handle) => unsafe { OwnedHandle::from_raw_handle(handle.0) },
        Err(error) => {
            errors.push(probe_error("CreateToolhelp32Snapshot", None, error));
            return processes;
        }
    };
    let handle = HANDLE(snapshot.as_raw_handle());
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    let mut next = unsafe { Process32FirstW(handle, &mut entry) };
    loop {
        match next {
            Ok(()) => {
                let end = entry
                    .szExeFile
                    .iter()
                    .position(|c| *c == 0)
                    .unwrap_or(entry.szExeFile.len());
                processes.insert(
                    entry.th32ProcessID,
                    ProcessIdentity {
                        parent_pid: entry.th32ParentProcessID,
                        executable: String::from_utf16_lossy(&entry.szExeFile[..end])
                            .to_ascii_lowercase(),
                    },
                );
                next = unsafe { Process32NextW(handle, &mut entry) };
            }
            Err(error) => {
                if error.code() != ERROR_NO_MORE_FILES.to_hresult() {
                    errors.push(probe_error("Process32 enumeration", None, error));
                }
                break;
            }
        }
    }
    processes
}

fn is_descendant(pid: u32, root: u32, processes: &HashMap<u32, ProcessIdentity>) -> bool {
    let mut cursor = pid;
    let mut seen = HashSet::new();
    while cursor != root && seen.insert(cursor) {
        let Some(process) = processes.get(&cursor) else {
            return false;
        };
        if process.parent_pid == root {
            return true;
        }
        cursor = process.parent_pid;
    }
    false
}

fn process_executable(pid: u32) -> Result<PathBuf, String> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }
        .map_err(|error| probe_error("OpenProcess", Some(pid), error))?;
    let handle = unsafe { OwnedHandle::from_raw_handle(handle.0) };
    // MAX_PATH is an initial Windows API buffer size, not a path-length limit.
    let mut buffer = vec![0u16; MAX_PATH as usize];
    loop {
        let mut length = u32::try_from(buffer.len()).map_err(|_| {
            format!("QueryFullProcessImageNameW pid={pid}: buffer exceeds API u32 length")
        })?;
        match unsafe {
            QueryFullProcessImageNameW(
                HANDLE(handle.as_raw_handle()),
                PROCESS_NAME_FORMAT(0),
                PWSTR(buffer.as_mut_ptr()),
                &mut length,
            )
        } {
            Ok(()) => {
                return Ok(PathBuf::from(String::from_utf16_lossy(
                    &buffer[..length as usize],
                )))
            }
            Err(error) if error.code() == ERROR_INSUFFICIENT_BUFFER.to_hresult() => {
                buffer.resize(buffer.len() * 2, 0)
            }
            Err(error) => return Err(probe_error("QueryFullProcessImageNameW", Some(pid), error)),
        }
    }
}

fn bundled_bun_paths() -> HashSet<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            paths.push(parent.join("bun.exe"));
        }
    }
    // Read only our own standard install location; never process environments.
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let root = Path::new(&local).join("screenpipe");
        paths.push(root.join("bun.exe"));
        paths.push(root.join("bun-baseline").join("bun.exe"));
    }
    paths
        .into_iter()
        .filter_map(|path| path.canonicalize().ok())
        .collect()
}

unsafe extern "system" fn enum_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let collector = &mut *(lparam.0 as *mut WindowCollector);
    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }
    // Windows window class names have a documented maximum of 256 characters.
    let mut buffer = [0u16; 256];
    let length = GetClassNameW(hwnd, &mut buffer);
    if length == 0 {
        collector.errors.push(probe_error(
            "GetClassNameW",
            None,
            windows::core::Error::from_win32(),
        ));
        return BOOL(1);
    }
    let class = String::from_utf16_lossy(&buffer[..length as usize]);
    let host = match class.as_str() {
        "ConsoleWindowClass" => "console",
        "CASCADIA_HOSTING_WINDOW_CLASS" => "windows_terminal",
        _ => return BOOL(1),
    };
    let mut pid = 0;
    if GetWindowThreadProcessId(hwnd, Some(&mut pid)) == 0 {
        collector.errors.push(probe_error(
            "GetWindowThreadProcessId",
            None,
            windows::core::Error::from_win32(),
        ));
    }
    collector.windows.push(WindowEntry {
        pid,
        class,
        host,
        ownership: if pid == 0 {
            "owner_unavailable"
        } else if collector.related.contains(&pid) {
            "screenpipe_related"
        } else {
            "unassociated"
        },
    });
    BOOL(1)
}

pub(crate) fn collect() -> String {
    collect_with_process_probe(process_identities)
}

#[cfg(test)]
pub(crate) fn collect_after_failed_process_probe() -> String {
    collect_with_process_probe(|errors| {
        // PID 0 cannot be opened: preserve a real native error through the same
        // partial-snapshot serializer and feedback upload path.
        errors.push(process_executable(0).expect_err("PID 0 must not open"));
        HashMap::new()
    })
}

fn collect_with_process_probe(
    probe: impl FnOnce(&mut Vec<String>) -> HashMap<u32, ProcessIdentity>,
) -> String {
    let current_pid = std::process::id();
    let mut errors = Vec::new();
    let identities = probe(&mut errors);
    let bundled_paths = bundled_bun_paths();
    let mut related = HashSet::from([current_pid]);
    let mut processes = Vec::new();
    for (&pid, identity) in &identities {
        let descendant = is_descendant(pid, current_pid, &identities);
        let bundled_bun = if !descendant && identity.executable == "bun.exe" {
            match process_executable(pid) {
                Ok(path) => match path.canonicalize() {
                    Ok(path) => bundled_paths.contains(&path),
                    Err(error) => {
                        errors.push(format!(
                            "bundled Bun path resolution pid={pid} os_error={:?}",
                            error.raw_os_error()
                        ));
                        false
                    }
                },
                Err(error) => {
                    errors.push(error);
                    false
                }
            }
        } else {
            false
        };
        if !descendant && !bundled_bun {
            continue;
        }
        if descendant {
            related.insert(pid);
        }
        processes.push(ProcessEntry {
            pid,
            parent_pid: identity.parent_pid,
            executable: identity.executable.clone(),
            ownership: if descendant {
                "screenpipe_descendant"
            } else {
                "bundled_bun_outside_current_tree"
            },
        });
    }
    processes.sort_by_key(|process| process.pid);
    let current_state = if identities.contains_key(&current_pid) {
        "observed"
    } else {
        errors.push("current Screenpipe process unavailable in process snapshot".into());
        "unavailable"
    };
    let mut collector = WindowCollector {
        related,
        errors,
        ..Default::default()
    };
    if let Err(error) =
        unsafe { EnumWindows(Some(enum_window), LPARAM(&mut collector as *mut _ as isize)) }
    {
        collector
            .errors
            .push(probe_error("EnumWindows", None, error));
    }
    serde_json::json!({
        "capturedAt": chrono::Utc::now().to_rfc3339(),
        "status": if collector.errors.is_empty() { "complete" } else { "partial" },
        "screenpipePid": current_pid,
        "screenpipeState": current_state,
        "processes": processes,
        "visibleTerminalHosts": collector.windows,
        "probeErrors": collector.errors,
        "limitation": "Point-in-time parent relationships; exited processes and windows cannot be reconstructed. An unassociated host is not proof of Screenpipe ownership."
    }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "child process fixture for native_snapshot_observes_related_child_without_command_line"]
    fn snapshot_child_fixture() {
        use std::io::Write;
        println!("screenpipe-snapshot-child-ready");
        std::io::stdout().flush().unwrap();
        loop {
            std::thread::park();
        }
    }

    #[test]
    fn native_snapshot_observes_related_child_without_command_line() {
        use std::{
            io::{BufRead, BufReader},
            os::windows::process::CommandExt,
            process::{Child, Stdio},
        };
        struct ChildGuard(Child);
        impl Drop for ChildGuard {
            fn drop(&mut self) {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
        let executable = std::env::current_exe().unwrap();
        let mut child = ChildGuard(
            std::process::Command::new(&executable)
                .args([
                    "--ignored",
                    "--exact",
                    "windows_process_diagnostics::tests::snapshot_child_fixture",
                    "--nocapture",
                    "--skip",
                    "PROMPT_CANARY_PRIVATE",
                ])
                .env("SCREENPIPE_TEST_SECRET", "ENV_CANARY_PRIVATE")
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .creation_flags(0x08000000)
                .spawn()
                .unwrap(),
        );
        let stdout = child.0.stdout.take().unwrap();
        assert!(
            BufReader::new(stdout)
                .lines()
                .any(|line| line.unwrap().contains("screenpipe-snapshot-child-ready")),
            "fixture exited before readiness"
        );
        let snapshot = collect();
        println!("{snapshot}");
        let value: serde_json::Value = serde_json::from_str(&snapshot).unwrap();
        let entry = value["processes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["pid"] == child.0.id())
            .expect("related child missing");
        assert_eq!(entry["ownership"], "screenpipe_descendant");
        assert_eq!(
            entry["executable"],
            executable
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_ascii_lowercase()
        );
        for private in ["PROMPT_CANARY_PRIVATE", "ENV_CANARY_PRIVATE"] {
            assert!(!snapshot.contains(private));
        }
    }

    #[test]
    fn ancestry_excludes_unrelated_processes_and_terminates_on_cycles() {
        let identities = HashMap::from([
            (
                1,
                ProcessIdentity {
                    parent_pid: 0,
                    executable: "root.exe".into(),
                },
            ),
            (
                2,
                ProcessIdentity {
                    parent_pid: 1,
                    executable: "bun.exe".into(),
                },
            ),
            (
                3,
                ProcessIdentity {
                    parent_pid: 2,
                    executable: "cmd.exe".into(),
                },
            ),
            (
                4,
                ProcessIdentity {
                    parent_pid: 5,
                    executable: "cmd.exe".into(),
                },
            ),
            (
                5,
                ProcessIdentity {
                    parent_pid: 4,
                    executable: "cmd.exe".into(),
                },
            ),
        ]);
        assert!(is_descendant(3, 1, &identities));
        assert!(!is_descendant(4, 1, &identities));
        assert!(!is_descendant(1, 1, &identities));
        assert!(!is_descendant(99, 1, &identities));
    }
}
