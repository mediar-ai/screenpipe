// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

use serde::Serialize;
use std::{collections::HashSet, path::Path};
use sysinfo::{Pid, PidExt, ProcessExt, System, SystemExt};
use windows::Win32::{
    Foundation::{BOOL, HWND, LPARAM},
    UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetWindowThreadProcessId, IsWindowVisible,
    },
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessEntry {
    pid: u32,
    parent_pid: Option<u32>,
    executable: String,
    ownership: &'static str,
    state: &'static str,
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

fn executable_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown")
        .to_ascii_lowercase()
}

fn is_descendant(pid: u32, root: u32, system: &System) -> bool {
    let mut cursor = pid;
    let mut seen = HashSet::new();
    while seen.insert(cursor) {
        let Some(process) = system.process(Pid::from_u32(cursor)) else {
            return false;
        };
        let Some(parent) = process.parent().map(|pid| pid.as_u32()) else {
            return false;
        };
        if parent == root {
            return true;
        }
        cursor = parent;
    }
    false
}

fn is_bundled_bun(path: &Path) -> bool {
    if executable_name(path) != "bun.exe" {
        return false;
    }
    let Ok(candidate) = path.canonicalize() else {
        return false;
    };
    let mut expected = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            expected.push(parent.join("bun.exe"));
        }
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        expected.push(Path::new(&local).join("screenpipe").join("bun.exe"));
        expected.push(
            Path::new(&local)
                .join("screenpipe")
                .join("bun-baseline")
                .join("bun.exe"),
        );
    }
    expected
        .into_iter()
        .filter_map(|path| path.canonicalize().ok())
        .any(|path| path == candidate)
}

unsafe extern "system" fn enum_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let collector = &mut *(lparam.0 as *mut WindowCollector);
    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }
    let mut buffer = [0u16; 256];
    let length = GetClassNameW(hwnd, &mut buffer);
    if length == 0 {
        collector
            .errors
            .push("visible window class unavailable".into());
        return BOOL(1);
    }
    let class = String::from_utf16_lossy(&buffer[..length as usize]);
    let host = match class.as_str() {
        "ConsoleWindowClass" => "console",
        "CASCADIA_HOSTING_WINDOW_CLASS" => "windows_terminal",
        _ => return BOOL(1),
    };
    let mut pid = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    collector.windows.push(WindowEntry {
        pid,
        class,
        host,
        ownership: if collector.related.contains(&pid) {
            "screenpipe_related"
        } else {
            "unassociated"
        },
    });
    BOOL(1)
}

pub(crate) fn collect() -> String {
    let current_pid = std::process::id();
    let mut system = System::new_all();
    system.refresh_processes();
    let mut related = HashSet::from([current_pid]);
    let mut processes = Vec::new();
    for (pid, process) in system.processes() {
        let pid = pid.as_u32();
        let descendant = is_descendant(pid, current_pid, &system);
        let bundled_bun = is_bundled_bun(process.exe());
        if !descendant && !bundled_bun {
            continue;
        }
        if descendant {
            related.insert(pid);
        }
        processes.push(ProcessEntry {
            pid,
            parent_pid: process.parent().map(|parent| parent.as_u32()),
            executable: executable_name(process.exe()),
            ownership: if descendant {
                "screenpipe_descendant"
            } else {
                "bundled_bun_orphan"
            },
            state: "observed",
        });
    }
    let current_state = if system.process(Pid::from_u32(current_pid)).is_some() {
        "observed"
    } else {
        "exited_before_snapshot"
    };
    let mut collector = WindowCollector {
        related,
        ..Default::default()
    };
    let enumeration_ok =
        unsafe { EnumWindows(Some(enum_window), LPARAM(&mut collector as *mut _ as isize)) }
            .is_ok();
    if !enumeration_ok {
        collector.errors.push("window enumeration failed".into());
    }
    serde_json::to_string_pretty(&serde_json::json!({
        "capturedAt": chrono::Utc::now().to_rfc3339(),
        "screenpipePid": current_pid,
        "screenpipeExecutable": std::env::current_exe().ok().as_deref().map(executable_name).unwrap_or_else(|| "unknown".into()),
        "screenpipeState": current_state,
        "processes": processes,
        "visibleTerminalHosts": collector.windows,
        "probeErrors": collector.errors,
        "limitation": "Exited processes and windows cannot be reconstructed by this on-demand snapshot."
    })).unwrap_or_else(|error| format!(r#"{{"probeErrors":["snapshot serialization failed: {error}"]}}"#))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_snapshot_observes_related_child_without_command_line() {
        use std::os::windows::process::CommandExt;
        const CHILD_MARKER: &str = "SCREENPIPE_PROCESS_SNAPSHOT_TEST_CHILD";
        if std::env::var_os(CHILD_MARKER).is_some() {
            std::thread::sleep(std::time::Duration::from_secs(10));
            return;
        }
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "windows_process_diagnostics::tests::native_snapshot_observes_related_child_without_command_line",
            ])
            .env(CHILD_MARKER, "1")
            .creation_flags(0x08000000)
            .spawn()
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(250));
        let snapshot = collect();
        println!("WINDOWS PROCESS SNAPSHOT\n{snapshot}");
        let value: serde_json::Value = serde_json::from_str(&snapshot).unwrap();
        let entry = value["processes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["pid"] == child.id())
            .expect("related child missing");
        assert_eq!(entry["ownership"], "screenpipe_descendant");
        assert_eq!(
            entry["executable"],
            executable_name(&std::env::current_exe().unwrap())
        );
        assert!(!snapshot.contains(CHILD_MARKER));
        let _ = child.kill();
        let _ = child.wait();
    }
}
