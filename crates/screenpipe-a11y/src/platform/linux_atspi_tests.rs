// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Tests for the AT-SPI2 availability check and system-tool spawning under
//! an AppImage-style environment.
//!
//! A private `dbus-daemon` stands in for the session bus and a scripted
//! `org.a11y.Bus` launcher stands in for `at-spi-bus-launcher`, so the check
//! is exercised over real D-Bus without touching the developer's session.
//! `check_atspi_available` and `command_output_with_timeout` read the process
//! environment, so they run in a re-executed child of this test binary with
//! `DBUS_SESSION_BUS_ADDRESS` and an AppImage-like `LD_LIBRARY_PATH` set only
//! there. The child only runs when `SCREENPIPE_ATSPI_TEST_CHILD` is set.

use super::*;
use std::{
    ffi::OsStr,
    io::{BufRead, BufReader},
    process::Child,
};

const CHILD_ENV: &str = "SCREENPIPE_ATSPI_TEST_CHILD";
const CHILD_TEST: &str = "platform::linux::atspi_tests::child_checks_environment";

struct FakeLauncher {
    address: &'static str,
}

#[zbus::interface(name = "org.a11y.Bus")]
impl FakeLauncher {
    fn get_address(&self) -> String {
        self.address.to_string()
    }
}

/// Private session bus; killed on drop. Its config lists no service
/// directories, so nothing on the host (for example the real
/// `at-spi-bus-launcher` or `xdg-desktop-portal`) can be auto-activated
/// into the test.
struct PrivateBus {
    child: Child,
    address: String,
    _dir: tempfile::TempDir,
}

const PRIVATE_BUS_CONFIG: &str = r#"<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>session</type>
  <listen>unix:dir=DIR</listen>
  <auth>EXTERNAL</auth>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
  </policy>
</busconfig>
"#;

impl PrivateBus {
    fn start() -> Option<Self> {
        let dir = tempfile::tempdir().ok()?;
        let config = dir.path().join("bus.conf");
        std::fs::write(
            &config,
            PRIVATE_BUS_CONFIG.replace("DIR", &dir.path().display().to_string()),
        )
        .ok()?;
        let mut child = Command::new("dbus-daemon")
            .arg(format!("--config-file={}", config.display()))
            .args(["--nofork", "--print-address=1"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let mut address = String::new();
        BufReader::new(child.stdout.take()?)
            .read_line(&mut address)
            .ok()?;
        Some(Self {
            child,
            address: address.trim().to_string(),
            _dir: dir,
        })
    }

    fn client(&self) -> zbus::blocking::Connection {
        zbus::blocking::connection::Builder::address(self.address.as_str())
            .unwrap()
            .build()
            .unwrap()
    }

    /// Serves a fake AT-SPI2 launcher advertising `address`.
    fn serve_launcher(&self, address: &'static str) -> zbus::blocking::Connection {
        zbus::blocking::connection::Builder::address(self.address.as_str())
            .unwrap()
            .name(ATSPI_BUS_NAME)
            .unwrap()
            .serve_at(ATSPI_BUS_PATH, FakeLauncher { address })
            .unwrap()
            .build()
            .unwrap()
    }
}

impl Drop for PrivateBus {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

macro_rules! private_bus_or_skip {
    () => {
        match PrivateBus::start() {
            Some(bus) => bus,
            None => {
                eprintln!("skipping: dbus-daemon is not available");
                return;
            }
        }
    };
}

#[test]
fn reads_the_address_from_the_atspi_launcher() {
    let bus = private_bus_or_skip!();
    let _launcher = bus.serve_launcher("unix:path=/run/user/1000/at-spi/bus_0");
    assert_eq!(
        atspi_bus_address(&bus.client()).as_deref(),
        Some("unix:path=/run/user/1000/at-spi/bus_0")
    );
}

#[test]
fn an_empty_address_means_unavailable() {
    let bus = private_bus_or_skip!();
    let _launcher = bus.serve_launcher("");
    assert_eq!(atspi_bus_address(&bus.client()), None);
}

#[test]
fn a_missing_launcher_means_unavailable() {
    let bus = private_bus_or_skip!();
    assert_eq!(atspi_bus_address(&bus.client()), None);
}

#[test]
fn system_tools_do_not_inherit_the_appimage_library_path() {
    let cmd = system_tool_command("xdotool");
    let removed = cmd
        .get_envs()
        .find(|(key, _)| *key == OsStr::new("LD_LIBRARY_PATH"))
        .map(|(_, value)| value);
    assert_eq!(removed, Some(None));
    assert_eq!(cmd.get_program(), "xdotool");
}

/// Re-runs this binary's child test with `env`, returning its combined output.
fn run_child(scenario: &str, env: &[(&str, &str)]) -> String {
    let output = Command::new(std::env::current_exe().unwrap())
        .args([
            CHILD_TEST,
            "--exact",
            "--ignored",
            "--nocapture",
            "--test-threads=1",
        ])
        .env(CHILD_ENV, scenario)
        .envs(env.iter().copied())
        .output()
        .unwrap();
    let log = String::from_utf8_lossy(&output.stdout).to_string()
        + &String::from_utf8_lossy(&output.stderr);
    assert!(
        output.status.success(),
        "child scenario {scenario} failed:\n{log}"
    );
    assert!(
        log.contains("1 passed"),
        "child scenario {scenario} did not run:\n{log}"
    );
    log
}

#[test]
fn appimage_environment_still_detects_atspi_and_runs_system_tools() {
    let bus = private_bus_or_skip!();
    let _launcher = bus.serve_launcher("unix:path=/tmp/fake-atspi");
    // Stand-in for the AppImage's bundled libraries: a `libdbus-1.so.3` the
    // system `dbus-send` cannot load. This is the failure seen in the field
    // (`version LIBDBUS_PRIVATE_1.16.2 not found`).
    let bundled = tempfile::tempdir().unwrap();
    std::fs::write(bundled.path().join("libdbus-1.so.3"), b"not an ELF").unwrap();
    run_child(
        "available",
        &[
            ("DBUS_SESSION_BUS_ADDRESS", bus.address.as_str()),
            ("LD_LIBRARY_PATH", bundled.path().to_str().unwrap()),
        ],
    );
}

#[test]
fn reports_unavailable_without_a_launcher_or_a_session_bus() {
    let bus = private_bus_or_skip!();
    run_child(
        "unavailable",
        &[("DBUS_SESSION_BUS_ADDRESS", bus.address.as_str())],
    );
    run_child(
        "unavailable",
        &[(
            "DBUS_SESSION_BUS_ADDRESS",
            "unix:path=/nonexistent/screenpipe-bus",
        )],
    );
}

#[test]
#[ignore = "spawned by the environment tests above"]
fn child_checks_environment() {
    match std::env::var(CHILD_ENV).as_deref() {
        Ok("available") => {
            assert!(check_atspi_available());
            // The engine runs the permission check from an async task.
            let runtime = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .unwrap();
            assert!(runtime.block_on(async { check_atspi_available() }));
            let output = command_output_with_timeout(
                "sh",
                &["-c", "printf %s \"${LD_LIBRARY_PATH-unset}\""],
                Duration::from_secs(5),
            )
            .expect("sh runs");
            assert_eq!(String::from_utf8_lossy(&output.stdout), "unset");
            // A system tool that links libdbus must still load its own
            // libraries rather than the broken bundled one.
            if let Some(output) =
                command_output_with_timeout("dbus-send", &["--help"], Duration::from_secs(5))
            {
                let stderr = String::from_utf8_lossy(&output.stderr);
                assert!(
                    !stderr.contains("error while loading shared libraries"),
                    "{stderr}"
                );
                // `dbus-send` has no flag that exits 0 without a message, so
                // prove it got as far as printing its usage.
                assert!(stderr.contains("Usage: dbus-send"), "{stderr}");
            }
        }
        Ok("unavailable") => assert!(!check_atspi_available()),
        _ => eprintln!("refusing to run outside the environment tests"),
    }
}
