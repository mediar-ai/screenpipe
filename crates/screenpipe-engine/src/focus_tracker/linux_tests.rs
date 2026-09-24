// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Tests for the Linux focus tracker: monitor resolution, backend
//! selection, event emission, and each backend end to end. The KWin backend
//! runs against a scripted fake `org.kde.KWin` on a private `dbus-daemon`
//! whose config allows no service activation, so the host's real KWin is
//! never touched.

use super::*;
use crate::focus_tracker::linux_kwin::{
    RECEIVER_INTERFACE, RECEIVER_PATH, SCRIPTING_PATH, SCRIPT_NAME,
};
use std::{
    collections::VecDeque,
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
};

fn identity(id: u32) -> MonitorIdentity {
    MonitorIdentity::new(id, Some(format!("monitor-{id}")))
}

fn monitor(id: u32, x: i32) -> MonitorRect {
    MonitorRect {
        identity: identity(id),
        x,
        y: 0,
        width: 1920,
        height: 1080,
    }
}

fn three_monitors() -> Vec<MonitorRect> {
    vec![monitor(35, 0), monitor(37, 1920), monitor(33, 3840)]
}

fn window(x: i32, width: u32) -> WindowRect {
    WindowRect {
        x,
        y: 0,
        width,
        height: 1050,
    }
}

// ---------------------------------------------------------------- geometry

#[test]
fn window_center_picks_the_monitor_it_mostly_covers() {
    let monitors = three_monitors();
    // Straddles 35 and 37 but mostly on 37.
    assert_eq!(
        pick_monitor(&monitors, window(1500, 1600).center()),
        Some(identity(37))
    );
    assert_eq!(
        pick_monitor(&monitors, window(3840, 1920).center()),
        Some(identity(33))
    );
}

#[test]
fn monitor_edges_are_half_open() {
    let monitors = three_monitors();
    assert_eq!(pick_monitor(&monitors, (1919, 0)), Some(identity(35)));
    assert_eq!(pick_monitor(&monitors, (1920, 0)), Some(identity(37)));
    assert_eq!(pick_monitor(&monitors, (1920, 1080)), None);
    assert_eq!(pick_monitor(&monitors, (-1, 10)), None);
    assert_eq!(pick_monitor(&monitors, (5760, 10)), None);
    assert_eq!(pick_monitor(&[], (0, 0)), None);
}

#[test]
fn window_center_saturates_instead_of_overflowing() {
    let far = WindowRect {
        x: i32::MAX - 1,
        y: i32::MAX - 1,
        width: u32::MAX,
        height: 10,
    };
    assert_eq!(far.center(), (i32::MAX, i32::MAX));
}

// --------------------------------------------------------- backend choice

fn executable(dir: &Path, name: &str, mode: u32) -> PathBuf {
    let path = dir.join(name);
    std::fs::write(&path, "#!/bin/sh\n").unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(mode)).unwrap();
    path
}

#[test]
fn non_kde_desktops_are_unsupported() {
    let dir = tempfile::tempdir().unwrap();
    executable(dir.path(), "kdotool", 0o755);
    let path = dir.path().as_os_str();
    for desktop in [
        None,
        Some(""),
        Some("GNOME"),
        Some("ubuntu:GNOME"),
        Some("Hyprland"),
    ] {
        assert_eq!(
            select_backend(desktop, Some(path)),
            Backend::Unsupported,
            "{desktop:?}"
        );
    }
}

#[test]
fn kde_prefers_kdotool_on_path() {
    let dir = tempfile::tempdir().unwrap();
    let kdotool = executable(dir.path(), "kdotool", 0o755);
    let path = std::env::join_paths([Path::new("/nonexistent"), dir.path()]).unwrap();
    for desktop in ["KDE", "kde", "plasma:KDE", " KDE "] {
        assert_eq!(
            select_backend(Some(desktop), Some(&path)),
            Backend::Kdotool(kdotool.clone()),
            "{desktop}"
        );
    }
}

#[test]
fn kde_without_kdotool_uses_the_kwin_script() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(select_backend(Some("KDE"), None), Backend::KWinScript);
    assert_eq!(
        select_backend(Some("KDE"), Some(dir.path().as_os_str())),
        Backend::KWinScript
    );
    // Present but not executable, or a directory, does not count.
    executable(dir.path(), "kdotool", 0o644);
    assert_eq!(
        select_backend(Some("KDE"), Some(dir.path().as_os_str())),
        Backend::KWinScript
    );
    let other = tempfile::tempdir().unwrap();
    std::fs::create_dir(other.path().join("kdotool")).unwrap();
    assert_eq!(
        select_backend(Some("KDE"), Some(other.path().as_os_str())),
        Backend::KWinScript
    );
}

#[test]
fn default_timing_polls_kdotool_every_second() {
    assert_eq!(
        Timing::default(),
        Timing {
            kdotool_poll: Duration::from_secs(1),
            monitor_refresh: Duration::from_secs(5),
        }
    );
}

// ------------------------------------------------------------ event logic

fn drain(rx: &mut broadcast::Receiver<FocusEvent>) -> Vec<FocusEvent> {
    std::iter::from_fn(|| rx.try_recv().ok()).collect()
}

#[test]
fn emits_focus_changes_and_one_unknown_per_stretch() {
    let inner = Inner::new();
    inner.set_monitor_rects(three_monitors());
    let mut rx = inner.tx.subscribe();

    inner.apply(Some(window(0, 800)));
    inner.apply(Some(window(100, 800)));
    assert_eq!(drain(&mut rx), vec![FocusEvent::Focused(identity(35))]);

    inner.apply(Some(window(3900, 800)));
    assert_eq!(drain(&mut rx), vec![FocusEvent::Focused(identity(33))]);

    inner.apply(None);
    inner.apply(Some(window(-5000, 10)));
    assert_eq!(drain(&mut rx), vec![FocusEvent::Unknown]);
    assert_eq!(*inner.current.lock().unwrap(), None);

    inner.apply(Some(window(3900, 800)));
    inner.apply(None);
    assert_eq!(
        drain(&mut rx),
        vec![FocusEvent::Focused(identity(33)), FocusEvent::Unknown]
    );
}

// ----------------------------------------------------------- live backends

fn static_monitors(rects: Vec<MonitorRect>) -> MonitorProvider {
    Arc::new(move || {
        let rects = rects.clone();
        Box::pin(async move { rects })
    })
}

fn no_bus() -> BusProvider {
    Arc::new(|| Box::pin(async { Err(zbus::Error::Unsupported) }))
}

fn fast() -> Timing {
    Timing {
        kdotool_poll: Duration::from_millis(20),
        monitor_refresh: Duration::from_millis(20),
    }
}

async fn next_event(rx: &mut broadcast::Receiver<FocusEvent>) -> FocusEvent {
    tokio::time::timeout(Duration::from_secs(10), rx.recv())
        .await
        .expect("focus event within 10s")
        .expect("channel open")
}

#[tokio::test]
async fn unsupported_desktops_report_unknown_and_nothing_else() {
    let tracker = LinuxFocusTracker::start_with(
        tokio::runtime::Handle::current(),
        Backend::Unsupported,
        static_monitors(three_monitors()),
        no_bus(),
        fast(),
    );
    assert_eq!(tracker.current(), None);
    assert!(tracker.inner.unknown_emitted.load(Ordering::Relaxed));
    assert!(tracker.tasks.lock().unwrap().is_empty());
    tracker.stop();
}

#[tokio::test]
async fn kdotool_backend_follows_the_active_window() {
    let dir = tempfile::tempdir().unwrap();
    let state = dir.path().join("x");
    std::fs::write(&state, "1920").unwrap();
    // Fake kdotool: the window's x position comes from a file the test edits.
    let kdotool = dir.path().join("kdotool");
    std::fs::write(
        &kdotool,
        format!(
            "#!/bin/sh\nprintf '  Position: %s,0\\n  Geometry: 800x600\\n' \"$(cat {})\"\n",
            state.display()
        ),
    )
    .unwrap();
    std::fs::set_permissions(&kdotool, std::fs::Permissions::from_mode(0o755)).unwrap();

    let tracker = LinuxFocusTracker::start_with(
        tokio::runtime::Handle::current(),
        Backend::Kdotool(kdotool),
        static_monitors(three_monitors()),
        no_bus(),
        fast(),
    );
    let mut rx = tracker.subscribe();
    assert_eq!(next_event(&mut rx).await, FocusEvent::Focused(identity(37)));
    assert_eq!(tracker.current(), Some(identity(37)));

    std::fs::write(&state, "4000").unwrap();
    assert_eq!(next_event(&mut rx).await, FocusEvent::Focused(identity(33)));

    std::fs::write(&state, "-9000").unwrap();
    assert_eq!(next_event(&mut rx).await, FocusEvent::Unknown);

    tracker.stop();
    tracker.stop();
    assert!(tracker.tasks.lock().unwrap().is_empty());
}

#[tokio::test]
async fn kwin_backend_without_a_session_bus_reports_unknown() {
    let tracker = LinuxFocusTracker::start_with(
        tokio::runtime::Handle::current(),
        Backend::KWinScript,
        static_monitors(three_monitors()),
        no_bus(),
        fast(),
    );
    let mut rx = tracker.subscribe();
    assert_eq!(next_event(&mut rx).await, FocusEvent::Unknown);
    tracker.stop();
}

// ------------------------------------------------------------ fake KWin

/// Private session bus with no service activation; killed on drop.
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

    fn provider(&self) -> BusProvider {
        let address = self.address.clone();
        Arc::new(move || {
            let address = address.clone();
            Box::pin(async move {
                zbus::connection::Builder::address(address.as_str())?
                    .build()
                    .await
            })
        })
    }
}

impl Drop for PrivateBus {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Everything the fake KWin saw, for assertions.
#[derive(Default)]
struct KWinLog {
    loads: Vec<(String, String)>,
    unloads: Vec<String>,
    runs: Vec<i32>,
    script: String,
}

#[derive(Clone)]
struct FakeKWin {
    log: Arc<Mutex<KWinLog>>,
    /// Ids `loadScript` returns, in order; `-1` means "name already loaded".
    load_ids: Arc<Mutex<VecDeque<i32>>>,
    /// Calls the script makes back to screenpipe when it runs.
    reports: Vec<Option<&'static str>>,
}

#[zbus::interface(name = "org.kde.kwin.Scripting")]
impl FakeKWin {
    #[zbus(name = "loadScript")]
    async fn load_script(
        &self,
        path: String,
        name: String,
        #[zbus(object_server)] server: &zbus::ObjectServer,
    ) -> i32 {
        let script = std::fs::read_to_string(&path).unwrap_or_default();
        let id = self.load_ids.lock().unwrap().pop_front().unwrap_or(-1);
        {
            let mut log = self.log.lock().unwrap();
            log.loads.push((path, name));
            log.script = script;
        }
        if id >= 0 {
            let _ = server
                .at(
                    format!("{SCRIPTING_PATH}/Script{id}"),
                    FakeScript {
                        id,
                        kwin: self.clone(),
                    },
                )
                .await;
        }
        id
    }

    #[zbus(name = "unloadScript")]
    fn unload_script(&self, name: String) -> bool {
        self.log.lock().unwrap().unloads.push(name);
        true
    }
}

struct FakeScript {
    id: i32,
    kwin: FakeKWin,
}

#[zbus::interface(name = "org.kde.kwin.Script")]
impl FakeScript {
    /// Plays the script: report to the service named in its source.
    #[zbus(name = "run")]
    async fn run(&self, #[zbus(connection)] connection: &zbus::Connection) {
        let service = {
            let mut log = self.kwin.log.lock().unwrap();
            log.runs.push(self.id);
            log.script
                .lines()
                .find_map(|line| line.strip_prefix("const SERVICE = \""))
                .and_then(|rest| rest.strip_suffix("\";"))
                .unwrap_or_default()
                .to_string()
        };
        for report in &self.kwin.reports {
            let _ = match report {
                Some(geometry) => {
                    connection
                        .call_method(
                            Some(service.as_str()),
                            RECEIVER_PATH,
                            Some(RECEIVER_INTERFACE),
                            "Focused",
                            &(*geometry,),
                        )
                        .await
                }
                None => {
                    connection
                        .call_method(
                            Some(service.as_str()),
                            RECEIVER_PATH,
                            Some(RECEIVER_INTERFACE),
                            "Unknown",
                            &(),
                        )
                        .await
                }
            };
        }
    }
}

async fn serve_fake_kwin(bus: &PrivateBus, kwin: FakeKWin) -> zbus::Connection {
    zbus::connection::Builder::address(bus.address.as_str())
        .unwrap()
        .name("org.kde.KWin")
        .unwrap()
        .serve_at(SCRIPTING_PATH, kwin)
        .unwrap()
        .build()
        .await
        .unwrap()
}

fn fake_kwin(load_ids: &[i32], reports: Vec<Option<&'static str>>) -> FakeKWin {
    FakeKWin {
        log: Arc::default(),
        load_ids: Arc::new(Mutex::new(load_ids.iter().copied().collect())),
        reports,
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

#[tokio::test]
async fn kwin_backend_installs_the_script_and_follows_reports() {
    let bus = private_bus_or_skip!();
    // First load collides with a stale script from a previous run.
    let kwin = fake_kwin(
        &[-1, 7],
        vec![Some("1920,0,800,600"), None, Some("3900.5,10,640,480")],
    );
    let _kwin_conn = serve_fake_kwin(&bus, kwin.clone()).await;

    let tracker = LinuxFocusTracker::start_with(
        tokio::runtime::Handle::current(),
        Backend::KWinScript,
        static_monitors(three_monitors()),
        bus.provider(),
        fast(),
    );
    let mut rx = tracker.subscribe();
    assert_eq!(next_event(&mut rx).await, FocusEvent::Focused(identity(37)));
    assert_eq!(next_event(&mut rx).await, FocusEvent::Unknown);
    assert_eq!(next_event(&mut rx).await, FocusEvent::Focused(identity(33)));

    {
        let log = kwin.log.lock().unwrap();
        assert_eq!(log.loads.len(), 2);
        assert!(log
            .loads
            .iter()
            .all(|(path, name)| { name == SCRIPT_NAME && path.ends_with(".js") }));
        assert_eq!(log.unloads, vec![SCRIPT_NAME.to_string()]);
        assert_eq!(log.runs, vec![7]);
        assert!(log
            .script
            .contains("workspace.windowActivated.connect(track);"));
    }

    tracker.stop();
    // Uninstall runs asynchronously after stop.
    tokio::time::timeout(Duration::from_secs(10), async {
        while kwin.log.lock().unwrap().unloads.len() < 2 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("script unloaded after stop");
}

#[tokio::test]
async fn kwin_refusing_the_script_reports_unknown() {
    let bus = private_bus_or_skip!();
    let kwin = fake_kwin(&[-1, -1], vec![]);
    let _kwin_conn = serve_fake_kwin(&bus, kwin.clone()).await;

    let tracker = LinuxFocusTracker::start_with(
        tokio::runtime::Handle::current(),
        Backend::KWinScript,
        static_monitors(three_monitors()),
        bus.provider(),
        fast(),
    );
    let mut rx = tracker.subscribe();
    assert_eq!(next_event(&mut rx).await, FocusEvent::Unknown);
    assert_eq!(kwin.log.lock().unwrap().loads.len(), 2);
    assert!(kwin.log.lock().unwrap().runs.is_empty());
    tracker.stop();
}

#[tokio::test]
async fn kwin_backend_without_kwin_on_the_bus_reports_unknown() {
    let bus = private_bus_or_skip!();
    let tracker = LinuxFocusTracker::start_with(
        tokio::runtime::Handle::current(),
        Backend::KWinScript,
        static_monitors(three_monitors()),
        bus.provider(),
        fast(),
    );
    let mut rx = tracker.subscribe();
    assert_eq!(next_event(&mut rx).await, FocusEvent::Unknown);
    tracker.stop();
}

// --------------------------------------------------- production entry point

#[test]
fn start_needs_a_tokio_runtime() {
    assert!(LinuxFocusTracker::start().is_err());
}

const CHILD_ENV: &str = "SCREENPIPE_FOCUS_TRACKER_CHILD";
const CHILD_TEST: &str = "focus_tracker::linux::tests::child_starts_the_production_tracker";

/// Runs `start()` in a child process whose environment says "KDE, no
/// kdotool, session bus = private bus with a fake KWin", so the production
/// wiring (env parsing, session bus, live monitor listing) is exercised
/// without mutating this process's environment.
#[test]
fn start_picks_the_kwin_script_on_kde_without_kdotool() {
    let bus = private_bus_or_skip!();
    let kwin = fake_kwin(&[3], vec![]);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let _kwin_conn = runtime.block_on(serve_fake_kwin(&bus, kwin.clone()));
    let empty_path = tempfile::tempdir().unwrap();

    let output = Command::new(std::env::current_exe().unwrap())
        .args([
            CHILD_TEST,
            "--exact",
            "--ignored",
            "--nocapture",
            "--test-threads=1",
        ])
        .env(CHILD_ENV, "1")
        .env("XDG_CURRENT_DESKTOP", "KDE")
        .env("PATH", empty_path.path())
        .env("DBUS_SESSION_BUS_ADDRESS", &bus.address)
        .output()
        .unwrap();
    let log = String::from_utf8_lossy(&output.stdout).to_string()
        + &String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "child failed:\n{log}");
    assert!(log.contains("1 passed"), "child did not run:\n{log}");

    // KDE without kdotool selected the KWin script backend, which loaded
    // and ran the script over the session bus from the environment.
    assert_eq!(kwin.log.lock().unwrap().runs, vec![3]);
}

#[test]
#[ignore = "spawned by start_picks_the_kwin_script_on_kde_without_kdotool"]
fn child_starts_the_production_tracker() {
    if std::env::var(CHILD_ENV).as_deref() != Ok("1") {
        eprintln!("refusing to run outside the focus tracker harness");
        return;
    }
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let tracker = LinuxFocusTracker::start().unwrap();
        tokio::time::timeout(Duration::from_secs(10), async {
            while tracker.kwin_script.lock().await.is_none() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("KWin script installed");
        tracker.stop();
        tokio::time::timeout(Duration::from_secs(10), async {
            while tracker.kwin_script.lock().await.is_some() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("KWin script uninstalled");
        // live_monitor_rects ran against the real capture stack; the list
        // may be empty on a headless runner, which is fine here.
        let _ = live_monitor_rects().await;
    });
}

// ------------------------------------------------------ live KDE (opt-in)
//
// Run on a KDE Plasma session to check both backends against the real
// compositor (the KWin test loads and unloads a script in the live KWin):
//
//   SCREENPIPE_LIVE_KDE=1 cargo test -p screenpipe-engine --lib \
//     focus_tracker::linux::tests::live_ -- --ignored --nocapture --test-threads=1

fn live_kde_enabled() -> bool {
    std::env::var("SCREENPIPE_LIVE_KDE").as_deref() == Ok("1")
}

#[tokio::test]
#[ignore = "needs a live KDE Plasma session with kdotool; set SCREENPIPE_LIVE_KDE=1"]
async fn live_kdotool_backend_maps_the_active_window_to_a_real_monitor() {
    if !live_kde_enabled() {
        return;
    }
    let monitors = live_monitor_rects().await;
    eprintln!("monitors: {monitors:#?}");
    let window = crate::focus_tracker::linux_kdotool::KdotoolSource::new("kdotool".into())
        .active_window()
        .await
        .expect("kdotool reports the active window");
    eprintln!("kdotool active window: {window:?}");
    let focused = pick_monitor(&monitors, window.center()).expect("window is on a monitor");
    eprintln!("focused monitor: {focused:?}");
}

#[tokio::test]
#[ignore = "needs a live KDE Plasma session; set SCREENPIPE_LIVE_KDE=1"]
async fn live_kwin_script_backend_reports_the_active_window() {
    if !live_kde_enabled() {
        return;
    }
    let tracker = LinuxFocusTracker::start_with(
        tokio::runtime::Handle::current(),
        Backend::KWinScript,
        Arc::new(|| Box::pin(live_monitor_rects())),
        Arc::new(|| Box::pin(zbus::Connection::session())),
        Timing::default(),
    );
    let mut rx = tracker.subscribe();
    let event = next_event(&mut rx).await;
    eprintln!("KWin script reported: {event:?}");
    assert!(matches!(event, FocusEvent::Focused(_)), "{event:?}");
    tracker.stop();
    tokio::time::sleep(Duration::from_millis(500)).await;
}
