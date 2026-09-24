// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Active-window geometry on KDE Plasma (Wayland or X11) via `kdotool`.
//!
//! `kdotool getactivewindow getwindowgeometry` prints the focused window's
//! top-left position and size in KWin's global coordinates:
//!
//! ```text
//! Window {7d99f3a6-2069-4ae4-b77a-c8d02cdffef4}
//!   Position: 3840,0
//!   Geometry: 1920x1050
//! ```
//!
//! Each call loads and unloads a short KWin script, so it costs a few
//! milliseconds; the tracker polls it about once a second. The command runs
//! with a timeout and without the AppImage's `LD_LIBRARY_PATH`, which would
//! otherwise make a system binary load screenpipe's bundled libraries.

use super::linux::WindowRect;
use std::{path::PathBuf, time::Duration};

/// Upper bound for one `kdotool` call. KWin answers in milliseconds; a
/// wedged compositor must not stall the tracker.
pub(super) const KDOTOOL_TIMEOUT: Duration = Duration::from_secs(2);

/// Queries the focused window through a `kdotool` executable.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct KdotoolSource {
    program: PathBuf,
    timeout: Duration,
}

impl KdotoolSource {
    pub(super) fn new(program: PathBuf) -> Self {
        Self::with_timeout(program, KDOTOOL_TIMEOUT)
    }

    pub(super) fn with_timeout(program: PathBuf, timeout: Duration) -> Self {
        Self { program, timeout }
    }

    /// Geometry of the focused window, or `None` when there is no focused
    /// window, `kdotool` fails or times out, or its output is unexpected.
    pub(super) async fn active_window(&self) -> Option<WindowRect> {
        let output = self.command().output();
        let output = tokio::time::timeout(self.timeout, output)
            .await
            .ok()?
            .ok()?;
        if !output.status.success() {
            return None;
        }
        parse_window_geometry(&String::from_utf8_lossy(&output.stdout))
    }
}

impl KdotoolSource {
    /// The `kdotool` invocation: scrubbed of `LD_LIBRARY_PATH` and killed if
    /// the timeout drops the future.
    fn command(&self) -> tokio::process::Command {
        let mut command = tokio::process::Command::new(&self.program);
        command
            .args(["getactivewindow", "getwindowgeometry"])
            .env_remove("LD_LIBRARY_PATH")
            .kill_on_drop(true);
        command
    }
}

/// Parses the `Position: X,Y` and `Geometry: WxH` lines of `kdotool`
/// output. Fractional values (KWin uses real coordinates on scaled
/// displays) are truncated; zero-sized windows are rejected.
pub(super) fn parse_window_geometry(output: &str) -> Option<WindowRect> {
    let field = |name: &str| {
        output
            .lines()
            .find_map(|line| line.trim().strip_prefix(name))
            .map(str::trim)
    };
    let (x, y) = field("Position:")?.split_once(',')?;
    let (width, height) = field("Geometry:")?.split_once('x')?;
    let rect = WindowRect {
        x: parse_coordinate(x)?,
        y: parse_coordinate(y)?,
        width: u32::try_from(parse_coordinate(width)?).ok()?,
        height: u32::try_from(parse_coordinate(height)?).ok()?,
    };
    (rect.width > 0 && rect.height > 0).then_some(rect)
}

fn parse_coordinate(value: &str) -> Option<i32> {
    let value: f64 = value.trim().parse().ok()?;
    (value.is_finite() && value.abs() < i32::MAX as f64).then_some(value as i32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    const SAMPLE: &str = "Window {7d99f3a6-2069-4ae4-b77a-c8d02cdffef4}\n  Position: 3840,0\n  Geometry: 1920x1050\n";

    #[test]
    fn parses_kdotool_geometry() {
        assert_eq!(
            parse_window_geometry(SAMPLE),
            Some(WindowRect {
                x: 3840,
                y: 0,
                width: 1920,
                height: 1050
            })
        );
    }

    #[test]
    fn parses_fractional_and_negative_positions() {
        let output = "  Position: -1920.5,12.75\n  Geometry: 800.4x600.9\n";
        assert_eq!(
            parse_window_geometry(output),
            Some(WindowRect {
                x: -1920,
                y: 12,
                width: 800,
                height: 600
            })
        );
    }

    #[test]
    fn rejects_incomplete_or_malformed_output() {
        for output in [
            "",
            "Window {x}\n",
            "  Position: 10,20\n",
            "  Geometry: 100x100\n",
            "  Position: 10\n  Geometry: 100x100\n",
            "  Position: 10,20\n  Geometry: 100\n",
            "  Position: a,20\n  Geometry: 100x100\n",
            "  Position: 10,b\n  Geometry: 100x100\n",
            "  Position: 10,20\n  Geometry: cx100\n",
            "  Position: 10,20\n  Geometry: 100xd\n",
            "  Position: 10,20\n  Geometry: -5x100\n",
            "  Position: 10,20\n  Geometry: 100x-5\n",
            "  Position: 10,20\n  Geometry: 0x100\n",
            "  Position: 10,20\n  Geometry: 100x0\n",
            "  Position: inf,20\n  Geometry: 100x100\n",
            "  Position: 1e12,20\n  Geometry: 100x100\n",
        ] {
            assert_eq!(parse_window_geometry(output), None, "{output:?}");
        }
    }

    /// Writes an executable shell script standing in for `kdotool`.
    fn fake_kdotool(dir: &tempfile::TempDir, body: &str) -> PathBuf {
        let path = dir.path().join("kdotool");
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    #[tokio::test]
    async fn runs_kdotool_with_the_expected_arguments() {
        let dir = tempfile::tempdir().unwrap();
        let program = fake_kdotool(
            &dir,
            r#"[ "$1 $2" = "getactivewindow getwindowgeometry" ] || exit 3
printf 'Window {id}\n  Position: 1920,0\n  Geometry: 1920x1080\n'"#,
        );
        assert_eq!(
            KdotoolSource::new(program).active_window().await,
            Some(WindowRect {
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080
            })
        );
    }

    #[test]
    fn does_not_leak_the_appimage_library_path() {
        let source = KdotoolSource::new(PathBuf::from("kdotool"));
        let command = source.command();
        let removed = command
            .as_std()
            .get_envs()
            .find(|(key, _)| *key == std::ffi::OsStr::new("LD_LIBRARY_PATH"))
            .map(|(_, value)| value);
        assert_eq!(removed, Some(None));
        assert_eq!(
            source,
            KdotoolSource::with_timeout("kdotool".into(), KDOTOOL_TIMEOUT)
        );
    }

    #[tokio::test]
    async fn failures_yield_none() {
        let dir = tempfile::tempdir().unwrap();
        let failing = fake_kdotool(&dir, "echo 'no active window' >&2; exit 1");
        assert_eq!(KdotoolSource::new(failing).active_window().await, None);

        let missing = dir.path().join("does-not-exist");
        assert_eq!(KdotoolSource::new(missing).active_window().await, None);
    }

    #[tokio::test]
    async fn a_hung_kdotool_times_out() {
        let dir = tempfile::tempdir().unwrap();
        let hung = fake_kdotool(&dir, "exec sleep 5");
        let source = KdotoolSource::with_timeout(hung, Duration::from_millis(100));
        let started = std::time::Instant::now();
        assert_eq!(source.active_window().await, None);
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
