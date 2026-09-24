// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Event-driven active-window tracking on KDE Plasma through a KWin script.
//!
//! Fallback for when `kdotool` is not installed. KWin exposes no D-Bus
//! signal for focus changes, but its scripting API does: a script loaded
//! through `org.kde.KWin /Scripting` can subscribe to
//! `workspace.windowActivated` and to the active window's
//! `frameGeometryChanged`, and report back with `callDBus`. This is the same
//! mechanism `kdotool` uses per call; here the script stays loaded and pushes
//! every change, so there is no polling at all.
//!
//! The script calls two methods on an object this module serves on the
//! session bus under the connection's unique name:
//!
//! - `org.screenpipe.FocusTracker.Focused(s geometry)` with `"x,y,width,height"`
//!   in KWin's global coordinates. A string keeps the payload independent of
//!   how KWin maps JavaScript numbers onto D-Bus types.
//! - `org.screenpipe.FocusTracker.Unknown()` when no window is active.

use super::linux::WindowRect;
use anyhow::{anyhow, Context, Result};
use std::{io::Write, path::Path, sync::Arc};

pub(super) const RECEIVER_PATH: &str = "/org/screenpipe/FocusTracker";
pub(super) const RECEIVER_INTERFACE: &str = "org.screenpipe.FocusTracker";
pub(super) const KWIN_SERVICE: &str = "org.kde.KWin";
pub(super) const SCRIPTING_PATH: &str = "/Scripting";
pub(super) const SCRIPTING_INTERFACE: &str = "org.kde.kwin.Scripting";
pub(super) const SCRIPT_INTERFACE: &str = "org.kde.kwin.Script";
/// KWin plugin name; KWin refuses a second script with the same name.
pub(super) const SCRIPT_NAME: &str = "screenpipe-focus-tracker";

/// Receives each focus report: `Some(rect)` for the active window, `None`
/// when KWin has no active window or the report is malformed.
pub(super) type FocusSink = Arc<dyn Fn(Option<WindowRect>) + Send + Sync>;

struct Receiver {
    sink: FocusSink,
}

#[zbus::interface(name = "org.screenpipe.FocusTracker")]
impl Receiver {
    fn focused(&self, geometry: String) {
        (self.sink)(parse_script_geometry(&geometry));
    }

    fn unknown(&self) {
        (self.sink)(None);
    }
}

/// Parses `"x,y,width,height"` as sent by the script. KWin geometry is
/// real-valued on scaled displays; values are truncated. Zero-sized or
/// non-finite geometry is rejected.
pub(super) fn parse_script_geometry(geometry: &str) -> Option<WindowRect> {
    let mut parts = geometry.split(',').map(|part| {
        let value: f64 = part.trim().parse().ok()?;
        (value.is_finite() && value.abs() < i32::MAX as f64).then_some(value as i32)
    });
    let rect = WindowRect {
        x: parts.next()??,
        y: parts.next()??,
        width: u32::try_from(parts.next()??).ok()?,
        height: u32::try_from(parts.next()??).ok()?,
    };
    let complete = parts.next().is_none();
    (complete && rect.width > 0 && rect.height > 0).then_some(rect)
}

/// The KWin script, reporting to `service` (our unique bus name).
pub(super) fn render_script(service: &str) -> String {
    format!(
        r#"// Loaded by screenpipe: reports the active window's geometry.
const SERVICE = "{service}";
const PATH = "{RECEIVER_PATH}";
const IFACE = "{RECEIVER_INTERFACE}";
let tracked = null;

function report() {{
    const w = workspace.activeWindow;
    if (!w) {{
        callDBus(SERVICE, PATH, IFACE, "Unknown");
        return;
    }}
    callDBus(SERVICE, PATH, IFACE, "Focused", [w.x, w.y, w.width, w.height].join(","));
}}

function track(window) {{
    if (tracked) {{
        tracked.frameGeometryChanged.disconnect(report);
    }}
    tracked = window;
    if (window) {{
        window.frameGeometryChanged.connect(report);
    }}
    report();
}}

workspace.windowActivated.connect(track);
track(workspace.activeWindow);
"#
    )
}

/// A loaded focus script plus the bus object it reports to. Call
/// [`KWinFocusScript::uninstall`] to unload it; dropping only removes the
/// script file.
pub(super) struct KWinFocusScript {
    connection: zbus::Connection,
    _script_file: tempfile::TempPath,
}

impl KWinFocusScript {
    /// Serves the receiver on `connection`, writes the script to `script_dir`,
    /// and asks KWin to load and run it. A script left loaded by a previous
    /// screenpipe process (for example after a crash) is unloaded first.
    pub(super) async fn install(
        connection: zbus::Connection,
        sink: FocusSink,
        script_dir: &Path,
    ) -> Result<Self> {
        connection
            .object_server()
            .at(RECEIVER_PATH, Receiver { sink })
            .await
            .context("serve focus receiver")?;
        let service = connection
            .unique_name()
            .ok_or_else(|| anyhow!("session bus connection has no unique name"))?
            .to_string();

        let mut file = tempfile::Builder::new()
            .prefix("screenpipe-focus-")
            .suffix(".js")
            .tempfile_in(script_dir)
            .context("create KWin script file")?;
        file.write_all(render_script(&service).as_bytes())
            .context("write KWin script file")?;
        let script_file = file.into_temp_path();
        let script_path = script_file
            .to_str()
            .ok_or_else(|| anyhow!("KWin script path is not UTF-8"))?
            .to_string();

        let mut id = load_script(&connection, &script_path).await?;
        if id < 0 {
            unload_script(&connection).await;
            id = load_script(&connection, &script_path).await?;
        }
        if id < 0 {
            return Err(anyhow!("KWin refused to load the focus script"));
        }
        connection
            .call_method(
                Some(KWIN_SERVICE),
                format!("{SCRIPTING_PATH}/Script{id}").as_str(),
                Some(SCRIPT_INTERFACE),
                "run",
                &(),
            )
            .await
            .context("run KWin focus script")?;

        Ok(Self {
            connection,
            _script_file: script_file,
        })
    }

    /// Unloads the script from KWin. Best effort: KWin may already be gone.
    pub(super) async fn uninstall(self) {
        unload_script(&self.connection).await;
    }
}

async fn load_script(connection: &zbus::Connection, script_path: &str) -> Result<i32> {
    let reply = connection
        .call_method(
            Some(KWIN_SERVICE),
            SCRIPTING_PATH,
            Some(SCRIPTING_INTERFACE),
            "loadScript",
            &(script_path, SCRIPT_NAME),
        )
        .await
        .context("load KWin focus script")?;
    reply
        .body()
        .deserialize()
        .context("decode loadScript reply")
}

async fn unload_script(connection: &zbus::Connection) {
    let _ = connection
        .call_method(
            Some(KWIN_SERVICE),
            SCRIPTING_PATH,
            Some(SCRIPTING_INTERFACE),
            "unloadScript",
            &(SCRIPT_NAME,),
        )
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_script_geometry() {
        assert_eq!(
            parse_script_geometry("1920,0,1920,1050"),
            Some(WindowRect {
                x: 1920,
                y: 0,
                width: 1920,
                height: 1050
            })
        );
        assert_eq!(
            parse_script_geometry(" -12.5 , 7.9 , 640.2 , 480.8 "),
            Some(WindowRect {
                x: -12,
                y: 7,
                width: 640,
                height: 480
            })
        );
    }

    #[test]
    fn rejects_malformed_script_geometry() {
        for geometry in [
            "",
            "1,2,3",
            "1,2,3,4,5",
            "a,2,3,4",
            "1,b,3,4",
            "1,2,c,4",
            "1,2,3,d",
            "1,2,-3,4",
            "1,2,3,-4",
            "1,2,0,4",
            "1,2,3,0",
            "NaN,2,3,4",
            "1e12,2,3,4",
        ] {
            assert_eq!(parse_script_geometry(geometry), None, "{geometry:?}");
        }
    }

    #[test]
    fn script_reports_to_the_given_service() {
        let script = render_script(":1.42");
        assert!(script.contains(r#"const SERVICE = ":1.42";"#));
        assert!(script.contains(&format!(r#"const PATH = "{RECEIVER_PATH}";"#)));
        assert!(script.contains(&format!(r#"const IFACE = "{RECEIVER_INTERFACE}";"#)));
        assert!(script.contains("workspace.windowActivated.connect(track);"));
        assert!(script.contains("frameGeometryChanged.connect(report)"));
    }
}
