// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Linux focus tracker.
//!
//! Reports which monitor holds the focused window so the focus-aware
//! controller can (a) walk the accessibility tree only for that monitor,
//! which is where app names, window titles and browser URLs come from, and
//! (b) stop treating every monitor as equally active. Before this tracker
//! existed Linux always reported `Unknown`: after 30 seconds of uptime no
//! monitor was "confirmed focused", so every frame was stored with OCR text
//! only and no app or window attribution.
//!
//! Wayland has no universal focus protocol, so focus comes from the
//! compositor. On KDE Plasma (the `XDG_CURRENT_DESKTOP` list contains `KDE`):
//!
//! 1. [`Backend::Kdotool`]: when a `kdotool` executable is on `PATH`, poll
//!    `kdotool getactivewindow getwindowgeometry` about once a second.
//! 2. [`Backend::KWinScript`]: otherwise load a small KWin script that pushes
//!    every activation and geometry change over D-Bus (no polling, no extra
//!    install).
//!
//! Every other desktop keeps the previous behaviour ([`Backend::Unsupported`]):
//! a single `Unknown` event, so the controller treats all monitors as active.
//!
//! The focused window's centre is mapped onto the monitor layout (refreshed
//! every few seconds), matching the Windows tracker, so a window straddling
//! two monitors belongs to the one it mostly covers.

use super::{
    linux_kdotool::KdotoolSource,
    linux_kwin::{FocusSink, KWinFocusScript},
    FocusEvent, FocusTracker, MonitorIdentity,
};
use anyhow::{Context, Result};
use std::{
    ffi::OsStr,
    future::Future,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    pin::Pin,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio::{sync::broadcast, task::JoinHandle};
use tracing::{debug, info, warn};

/// A window's frame in the compositor's global coordinates.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct WindowRect {
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) width: u32,
    pub(super) height: u32,
}

impl WindowRect {
    fn center(&self) -> (i32, i32) {
        (
            self.x.saturating_add((self.width / 2) as i32),
            self.y.saturating_add((self.height / 2) as i32),
        )
    }
}

/// A monitor's bounds in the same global coordinates.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct MonitorRect {
    pub(super) identity: MonitorIdentity,
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) width: u32,
    pub(super) height: u32,
}

/// Monitor containing `(x, y)`. Half-open on the right and bottom edges so
/// adjacent monitors never both claim the seam.
fn pick_monitor(rects: &[MonitorRect], (x, y): (i32, i32)) -> Option<MonitorIdentity> {
    rects
        .iter()
        .find(|rect| {
            let (x, y) = (i64::from(x), i64::from(y));
            let (left, top) = (i64::from(rect.x), i64::from(rect.y));
            x >= left
                && x < left + i64::from(rect.width)
                && y >= top
                && y < top + i64::from(rect.height)
        })
        .map(|rect| rect.identity.clone())
}

/// Where focus information comes from.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum Backend {
    /// Poll this `kdotool` executable.
    Kdotool(PathBuf),
    /// Push updates from a KWin script over the session bus.
    KWinScript,
    /// No known source on this desktop: report `Unknown` once.
    Unsupported,
}

/// Picks the backend from `XDG_CURRENT_DESKTOP` and `PATH`.
pub(super) fn select_backend(desktop: Option<&str>, path: Option<&OsStr>) -> Backend {
    let is_kde = desktop
        .unwrap_or_default()
        .split(':')
        .any(|entry| entry.trim().eq_ignore_ascii_case("KDE"));
    if !is_kde {
        return Backend::Unsupported;
    }
    match path.and_then(|path| find_executable("kdotool", path)) {
        Some(kdotool) => Backend::Kdotool(kdotool),
        None => Backend::KWinScript,
    }
}

/// First executable regular file called `name` in the `PATH`-style list.
fn find_executable(name: &str, path: &OsStr) -> Option<PathBuf> {
    std::env::split_paths(path)
        .map(|dir| dir.join(name))
        .find(|candidate| is_executable_file(candidate))
}

fn is_executable_file(path: &Path) -> bool {
    std::fs::metadata(path)
        .is_ok_and(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
}

type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;
/// Current monitor layout.
pub(super) type MonitorProvider = Arc<dyn Fn() -> BoxFuture<Vec<MonitorRect>> + Send + Sync>;
/// Session bus connection for the KWin backend.
pub(super) type BusProvider =
    Arc<dyn Fn() -> BoxFuture<zbus::Result<zbus::Connection>> + Send + Sync>;

/// Poll and refresh intervals.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct Timing {
    /// How often `kdotool` is asked for the active window.
    pub(super) kdotool_poll: Duration,
    /// How often the monitor layout is re-read (hotplug, resolution change).
    pub(super) monitor_refresh: Duration,
}

impl Default for Timing {
    fn default() -> Self {
        Self {
            kdotool_poll: Duration::from_secs(1),
            monitor_refresh: Duration::from_secs(5),
        }
    }
}

struct Inner {
    tx: broadcast::Sender<FocusEvent>,
    current: Mutex<Option<MonitorIdentity>>,
    monitor_rects: Mutex<Vec<MonitorRect>>,
    unknown_emitted: AtomicBool,
}

impl Inner {
    fn new() -> Self {
        let (tx, _) = broadcast::channel(16);
        Self {
            tx,
            current: Mutex::new(None),
            monitor_rects: Mutex::new(Vec::new()),
            unknown_emitted: AtomicBool::new(false),
        }
    }

    fn set_monitor_rects(&self, rects: Vec<MonitorRect>) {
        *self.monitor_rects.lock().unwrap() = rects;
    }

    /// Maps the active window to a monitor and emits an event when the
    /// answer changes. `Unknown` is emitted once per unknown stretch.
    fn apply(&self, window: Option<WindowRect>) {
        let identity = window
            .and_then(|window| pick_monitor(&self.monitor_rects.lock().unwrap(), window.center()));
        match identity {
            Some(identity) => {
                self.unknown_emitted.store(false, Ordering::Relaxed);
                let mut current = self.current.lock().unwrap();
                if current.as_ref() != Some(&identity) {
                    *current = Some(identity.clone());
                    debug!("linux focus tracker: focused monitor -> {identity:?}");
                    let _ = self.tx.send(FocusEvent::Focused(identity));
                }
            }
            None => {
                if !self.unknown_emitted.swap(true, Ordering::Relaxed) {
                    *self.current.lock().unwrap() = None;
                    let _ = self.tx.send(FocusEvent::Unknown);
                }
            }
        }
    }

    fn sink(self: &Arc<Self>) -> FocusSink {
        let inner = Arc::clone(self);
        Arc::new(move |window| inner.apply(window))
    }
}

pub struct LinuxFocusTracker {
    inner: Arc<Inner>,
    tasks: Mutex<Vec<JoinHandle<()>>>,
    kwin_script: Arc<tokio::sync::Mutex<Option<KWinFocusScript>>>,
    /// Shared with the KWin install task, which must not be aborted
    /// mid-install (that would leave the script loaded in KWin).
    stopped: Arc<AtomicBool>,
    runtime: tokio::runtime::Handle,
}

impl LinuxFocusTracker {
    /// Starts the tracker for the current desktop. Needs a Tokio runtime.
    pub fn start() -> Result<Self> {
        let runtime = tokio::runtime::Handle::try_current()
            .context("no tokio runtime for the linux focus tracker")?;
        let backend = select_backend(
            std::env::var("XDG_CURRENT_DESKTOP").ok().as_deref(),
            std::env::var_os("PATH").as_deref(),
        );
        Ok(Self::start_with(
            runtime,
            backend,
            Arc::new(|| Box::pin(live_monitor_rects())),
            Arc::new(|| Box::pin(zbus::Connection::session())),
            Timing::default(),
        ))
    }

    pub(super) fn start_with(
        runtime: tokio::runtime::Handle,
        backend: Backend,
        monitors: MonitorProvider,
        bus: BusProvider,
        timing: Timing,
    ) -> Self {
        info!("linux focus tracker: using {backend:?}");
        let tracker = Self {
            inner: Arc::new(Inner::new()),
            tasks: Mutex::new(Vec::new()),
            kwin_script: Arc::new(tokio::sync::Mutex::new(None)),
            stopped: Arc::new(AtomicBool::new(false)),
            runtime,
        };
        let mut tasks = Vec::new();
        match backend {
            Backend::Unsupported => {
                // Unchanged pre-tracker behaviour: every monitor stays active.
                tracker.inner.apply(None);
                return tracker;
            }
            Backend::Kdotool(program) => {
                let inner = Arc::clone(&tracker.inner);
                let monitors = Arc::clone(&monitors);
                let source = KdotoolSource::new(program);
                tasks.push(tracker.runtime.spawn(async move {
                    inner.set_monitor_rects(monitors().await);
                    loop {
                        inner.apply(source.active_window().await);
                        tokio::time::sleep(timing.kdotool_poll).await;
                    }
                }));
            }
            Backend::KWinScript => {
                let inner = Arc::clone(&tracker.inner);
                let slot = Arc::clone(&tracker.kwin_script);
                let stopped = Arc::clone(&tracker.stopped);
                let monitors = Arc::clone(&monitors);
                // Not added to `tasks`: stop() must not abort it while KWin
                // is loading the script. It hands the script to `slot`, or
                // unloads it itself if the tracker stopped in the meantime.
                tracker.runtime.spawn(async move {
                    inner.set_monitor_rects(monitors().await);
                    let installed = match bus().await {
                        Ok(connection) => {
                            KWinFocusScript::install(
                                connection,
                                inner.sink(),
                                &std::env::temp_dir(),
                            )
                            .await
                        }
                        Err(error) => Err(error.into()),
                    };
                    match installed {
                        Ok(script) => {
                            // stop() sets `stopped` before taking the slot,
                            // so checking under the lock leaves exactly one
                            // side responsible for unloading.
                            let mut guard = slot.lock().await;
                            if stopped.load(Ordering::SeqCst) {
                                drop(guard);
                                script.uninstall().await;
                            } else {
                                *guard = Some(script);
                            }
                        }
                        Err(error) => {
                            warn!("linux focus tracker: KWin script unavailable: {error:#}");
                            inner.apply(None);
                        }
                    }
                });
            }
        }
        let inner = Arc::clone(&tracker.inner);
        tasks.push(tracker.runtime.spawn(async move {
            loop {
                tokio::time::sleep(timing.monitor_refresh).await;
                inner.set_monitor_rects(monitors().await);
            }
        }));
        *tracker.tasks.lock().unwrap() = tasks;
        tracker
    }
}

/// Monitor layout from the capture stack, so identities match the ones the
/// capture loop compares against.
async fn live_monitor_rects() -> Vec<MonitorRect> {
    screenpipe_screen::monitor::list_monitors()
        .await
        .iter()
        .map(|monitor| MonitorRect {
            identity: MonitorIdentity::from_monitor(monitor),
            x: monitor.x(),
            y: monitor.y(),
            width: monitor.width(),
            height: monitor.height(),
        })
        .collect()
}

impl FocusTracker for LinuxFocusTracker {
    fn current(&self) -> Option<MonitorIdentity> {
        self.inner.current.lock().unwrap().clone()
    }

    fn subscribe(&self) -> broadcast::Receiver<FocusEvent> {
        self.inner.tx.subscribe()
    }

    fn stop(&self) {
        if self.stopped.swap(true, Ordering::SeqCst) {
            return;
        }
        for task in self.tasks.lock().unwrap().drain(..) {
            task.abort();
        }
        let slot = Arc::clone(&self.kwin_script);
        self.runtime.spawn(async move {
            if let Some(script) = slot.lock().await.take() {
                script.uninstall().await;
            }
        });
    }
}

#[cfg(test)]
#[path = "linux_tests.rs"]
mod tests;
