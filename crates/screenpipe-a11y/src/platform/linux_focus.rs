// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Clicked-element attribution on Linux through AT-SPI2 focus events.
//!
//! macOS and Windows hit-test the click position against the accessibility
//! tree. Linux cannot: evdev only reports relative pointer motion, and
//! Wayland gives clients no global pointer position, so there is no reliable
//! screen point to hit-test. What every toolkit does report, on X11 and on
//! Wayland, is focus: buttons, links, fields, tabs and menu items take focus
//! when clicked, and GTK, Qt and Chromium emit
//! `object:state-changed:focused` on the AT-SPI2 bus when that happens.
//!
//! A [`FocusTracker`] lives exactly as long as a recording session. Its
//! listener only takes signals in: it records every focus change the moment
//! the signal is read (as [`Focus::Pending`]) and makes no D-Bus call, so a
//! slow app cannot shift the timestamps of the signals queued behind it. A
//! separate enrichment thread describes each record under a total deadline
//! ([`ENRICH_BUDGET`]) counted from the signal. A click is attributed to the
//! element that gains focus within [`CLICK_SETTLE`] after it and before the
//! next click: a focus change belongs to the last press before it, never to
//! two clicks. A click that moves no focus (empty space,
//! plain text, an element that is already focused) gets no element: the
//! element that already had focus is not necessarily what was clicked, and an
//! empty element is better than a wrong one. It is still dropped when focus
//! sits in an excluded app. A click that activates a window gets no element
//! either: on activation the toolkit restores focus to the window's last
//! focused element, and the event sequence is the same whether that is the
//! clicked control (Qt gives focus to a clicked button) or not (a click on a
//! label restores the text field), so the two cannot be told apart.
//!
//! Privacy, in the same order as the code:
//!
//! - exclusions are applied to the element's real owner (its AT-SPI2
//!   application and top-level window), before any label is read, and on the
//!   complete names: labels are truncated to [`MAX_LABEL_CHARS`] only once the
//!   privacy decisions are taken, for what is recorded. An element
//!   of an excluded app is recorded as [`Focus::Excluded`] with no content, and
//!   a click resolved to it is dropped instead of being attributed to the app
//!   the window observer last saw;
//! - password fields (`skip_password_fields`) keep only their role: the name
//!   becomes `[password field]`, description and ancestors are omitted, like
//!   the macOS click context;
//! - ancestor names go through PII removal when `apply_pii_removal` is set;
//! - element values are never read;
//! - stopping the session stops the listener and clears the history.
//!
//! A focus record whose enrichment has not finished when a click needs it is
//! waited for until `click + CLICK_SETTLE + ENRICH_BUDGET`; past that the click
//! is emitted without an element, never with the previously focused one.

use crate::config::UiCaptureConfig;
use crate::events::{ancestors_to_json, AncestorHop, ElementContext};
use anyhow::{Context, Result};
use parking_lot::Mutex;
use screenpipe_core::pii_removal::remove_pii;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tracing::debug;
use zbus::blocking::Connection;
use zbus::names::{BusName, InterfaceName};
use zbus::zvariant::{ObjectPath, OwnedObjectPath, OwnedValue, Structure, Value};

/// How long a click waits for the focus change it causes.
pub(crate) const CLICK_SETTLE: Duration = Duration::from_millis(150);
/// Total time allowed to describe one focus change (all D-Bus calls
/// together). A click waits at most `CLICK_SETTLE + ENRICH_BUDGET`.
pub(crate) const ENRICH_BUDGET: Duration = Duration::from_millis(400);

/// Focus records kept. Only the last few seconds matter.
const HISTORY_LEN: usize = 16;
/// Bound on every D-Bus call so one hung app cannot stall the listener.
const DBUS_TIMEOUT: Duration = Duration::from_millis(300);
/// Delay before reconnecting when the AT-SPI2 bus is missing or went away
/// (e.g. screenpipe started at login before the accessibility bus).
const RECONNECT_DELAY: Duration = Duration::from_secs(10);
/// Granularity at which waits check the stop flag.
const STOP_POLL: Duration = Duration::from_millis(50);
/// How long stopping waits for the listener thread before detaching it.
const SHUTDOWN_WAIT: Duration = Duration::from_secs(1);
/// Parents walked above the focused element, and hops kept in the JSON.
const MAX_ANCESTOR_WALK: usize = 16;
const MAX_ANCESTORS_KEPT: usize = 8;
/// Labels longer than this are truncated (window titles, long link texts).
const MAX_LABEL_CHARS: usize = 200;

const ATSPI_ACCESSIBLE: &str = "org.a11y.atspi.Accessible";
const DBUS_PROPERTIES: &str = "org.freedesktop.DBus.Properties";
const ATSPI_NULL_PATH: &str = "/org/a11y/atspi/null";
const ATSPI_ROOT_PATH: &str = "/org/a11y/atspi/accessible/root";
/// AT-SPI2 state bit for "focused" (atspi-constants.h).
const STATE_FOCUSED: u32 = 12;
/// AT-SPI2 role of a password entry (ATSPI_ROLE_PASSWORD_TEXT), and its name.
/// GTK4 reports this role through `GetRole` only: its `GetRoleName` says
/// "text box" for a password entry, so the numeric role is what counts.
const ROLE_PASSWORD_TEXT_ID: u32 = 40;
const ROLE_PASSWORD_TEXT: &str = "password text";
/// Roles of the top-level node whose name is the window title.
const WINDOW_ROLES: &[&str] = &["frame", "window", "dialog", "alert", "file chooser"];

/// What is known about one focused element.
#[derive(Debug, Clone)]
pub(crate) enum Focus {
    /// The signal arrived; the element is still being described.
    Pending,
    /// Described and allowed by the capture filters.
    Element(ElementContext),
    /// Owned by an excluded app or window: nothing about it is kept.
    Excluded,
    /// Could not be described in time, or its owner is unknown.
    Unknown,
    /// The element lost focus.
    Lost,
    /// A window became active (`object:state-changed:active` or
    /// `window:activate`). A focus change that follows may be the toolkit
    /// restoring that window's focus rather than the click.
    Activated,
}

/// One focus change seen on the AT-SPI2 bus.
#[derive(Debug, Clone)]
pub(crate) struct FocusRecord {
    pub at: Instant,
    /// `bus_name + object_path` of the accessible.
    pub key: String,
    /// Name of the application that owns the element, when known.
    pub app: Option<String>,
    pub focus: Focus,
}

/// Where a click landed, as far as focus tells.
#[derive(Debug, Clone)]
pub(crate) enum ClickTarget {
    Element(ElementContext),
    /// No usable element: emit the click without one.
    Nothing,
    /// The click landed in an excluded app or window: drop it.
    Excluded,
    /// The deciding focus record is still being described.
    Wait,
}

/// Recent focus changes, oldest first.
#[derive(Debug, Default)]
pub(crate) struct FocusHistory {
    records: VecDeque<FocusRecord>,
}

impl FocusHistory {
    pub fn push(&mut self, record: FocusRecord) {
        if self.records.len() == HISTORY_LEN {
            self.records.pop_front();
        }
        self.records.push_back(record);
    }

    /// Record a focus change the moment its signal arrives.
    pub fn focus_gained(&mut self, at: Instant, key: &str) {
        self.push(FocusRecord {
            at,
            key: key.to_string(),
            app: None,
            focus: Focus::Pending,
        });
    }

    /// Fill in a record pushed by [`Self::focus_gained`]. A record that already
    /// left the history is ignored.
    pub fn resolve(&mut self, at: Instant, key: &str, app: Option<String>, focus: Focus) {
        if let Some(record) = self
            .records
            .iter_mut()
            .rev()
            .find(|r| r.at == at && r.key == key && matches!(r.focus, Focus::Pending))
        {
            record.app = app;
            record.focus = focus;
        }
    }

    /// Record that `key` lost focus, if it is the element currently focused.
    pub fn focus_lost(&mut self, at: Instant, key: &str) {
        let is_current = self
            .records
            .back()
            .is_some_and(|r| r.key == key && !matches!(r.focus, Focus::Lost));
        if is_current {
            self.push(FocusRecord {
                at,
                key: key.to_string(),
                app: None,
                focus: Focus::Lost,
            });
        }
    }

    /// Record that a window became active.
    pub fn window_activated(&mut self, at: Instant, key: &str) {
        self.push(FocusRecord {
            at,
            key: key.to_string(),
            app: None,
            focus: Focus::Activated,
        });
    }

    pub fn clear(&mut self) {
        self.records.clear();
    }

    /// Where a click at `click_at` landed, once `CLICK_SETTLE` has elapsed,
    /// when no other press followed it.
    #[cfg(test)]
    pub fn element_for_click(&self, click_at: Instant) -> ClickTarget {
        self.element_for_click_until(click_at, None)
    }

    /// Where a click at `click_at` landed. `next_press` is the next button
    /// press, if any: a focus change at or after it belongs to that press, so
    /// each transition is attributed to one click only (the last press before
    /// it). Without this, an empty-space click followed 80 ms later by a click
    /// on a button would both receive the button.
    pub fn element_for_click_until(
        &self,
        click_at: Instant,
        next_press: Option<Instant>,
    ) -> ClickTarget {
        // 1. The click moved focus: that element is what was clicked.
        //    Exceptions: any focus in an excluded app drops the click, and a
        //    click that activated a window gets no element (see module doc).
        let settle_end = click_at + CLICK_SETTLE;
        let window_end = next_press.filter(|next| *next > click_at);
        let settled = || {
            self.records.iter().filter(move |r| {
                r.at >= click_at && r.at <= settle_end && window_end.is_none_or(|end| r.at < end)
            })
        };
        if settled().any(|r| matches!(r.focus, Focus::Excluded)) {
            return ClickTarget::Excluded;
        }
        if settled().any(|r| matches!(r.focus, Focus::Activated)) {
            // A pending record may still turn out to be excluded.
            return if settled().any(|r| matches!(r.focus, Focus::Pending)) {
                ClickTarget::Wait
            } else {
                ClickTarget::Nothing
            };
        }
        if let Some(record) = settled().find(|r| !matches!(r.focus, Focus::Lost)) {
            return target_of(record);
        }

        // 2. Focus did not move: the focused element is not necessarily what
        //    was clicked (empty space, plain text), so it is not attached. A
        //    focus inside an excluded app still drops the click.
        match self
            .records
            .iter()
            .rev()
            .find(|r| r.at < click_at && !matches!(r.focus, Focus::Activated))
        {
            Some(record) => match target_of(record) {
                ClickTarget::Excluded => ClickTarget::Excluded,
                ClickTarget::Wait => ClickTarget::Wait,
                ClickTarget::Element(_) | ClickTarget::Nothing => ClickTarget::Nothing,
            },
            None => ClickTarget::Nothing,
        }
    }
}

/// What a focus record says about a click. The element is attached whatever
/// app the window observer named: its process name ("python3",
/// "gnome-text-editor") rarely matches the AT-SPI2 application name ("Text
/// Editor"), the observer can lag by up to 200 ms, and exclusions were
/// already applied to the element's real owner.
fn target_of(record: &FocusRecord) -> ClickTarget {
    match &record.focus {
        Focus::Pending => ClickTarget::Wait,
        Focus::Excluded => ClickTarget::Excluded,
        Focus::Unknown | Focus::Lost | Focus::Activated => ClickTarget::Nothing,
        Focus::Element(element) => ClickTarget::Element(element.clone()),
    }
}

#[cfg(test)]
/// App names come from different sources (process name for the click, AT-SPI
/// application name for the element), e.g. `firefox` vs `Firefox`.
fn same_app(a: &str, b: &str) -> bool {
    let a = a.trim().to_lowercase();
    let b = b.trim().to_lowercase();
    !a.is_empty() && !b.is_empty() && (a == b || a.contains(&b) || b.contains(&a))
}

/// Focus history of one recording session, fed by an AT-SPI2 listener that
/// stops with the session.
pub(crate) struct FocusTracker {
    history: Arc<Mutex<FocusHistory>>,
    stop: Arc<AtomicBool>,
    /// The listener's bus connection, so stopping can close it and end the
    /// blocking message stream.
    conn: Arc<Mutex<Option<Connection>>>,
    done: Option<crossbeam_channel::Receiver<()>>,
}

impl FocusTracker {
    /// Start listening. `stop` is the recording session's stop flag.
    pub fn start(config: UiCaptureConfig, stop: Arc<AtomicBool>) -> Self {
        let history = Arc::new(Mutex::new(FocusHistory::default()));
        let conn = Arc::new(Mutex::new(None));
        let (done_tx, done_rx) = crossbeam_channel::bounded(1);
        let spawned = {
            let history = history.clone();
            let stop = stop.clone();
            let conn = conn.clone();
            thread::Builder::new()
                .name("atspi-focus".into())
                .spawn(move || {
                    run_listener(&history, &stop, &config, &conn);
                    let _ = done_tx.send(());
                })
        };
        let done = match spawned {
            Ok(_) => Some(done_rx),
            Err(e) => {
                debug!("could not start the AT-SPI2 focus listener: {}", e);
                None
            }
        };
        Self {
            history,
            stop,
            conn,
            done,
        }
    }

    pub fn history(&self) -> Arc<Mutex<FocusHistory>> {
        self.history.clone()
    }

    /// Stop listening and forget every focus record. Waits briefly for the
    /// listener thread; one stuck in a D-Bus call is detached (it checks the
    /// stop flag before touching the history again).
    pub fn shutdown(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(conn) = self.conn.lock().take() {
            let _ = conn.close();
        }
        if let Some(done) = self.done.take() {
            if done.recv_timeout(SHUTDOWN_WAIT).is_err() {
                debug!("AT-SPI2 focus listener still busy at stop, detached");
            }
        }
        self.history.lock().clear();
    }
}

/// Run `attempt` until `stop`, waiting `RECONNECT_DELAY` between attempts
/// while still reacting to `stop` within `STOP_POLL`.
fn reconnect_loop(stop: &AtomicBool, mut attempt: impl FnMut() -> Result<()>) {
    while !stop.load(Ordering::Relaxed) {
        match attempt() {
            Ok(()) => debug!("AT-SPI2 focus stream ended"),
            Err(e) => debug!("AT-SPI2 focus listener unavailable: {:#}", e),
        }
        let resume = Instant::now() + RECONNECT_DELAY;
        while Instant::now() < resume && !stop.load(Ordering::Relaxed) {
            thread::sleep(STOP_POLL);
        }
    }
}

fn run_listener(
    history: &Mutex<FocusHistory>,
    stop: &AtomicBool,
    config: &UiCaptureConfig,
    slot: &Mutex<Option<Connection>>,
) {
    reconnect_loop(stop, || listen(history, stop, config, slot));
    // The session may have stopped while a record was being described.
    history.lock().clear();
}

fn listen(
    history: &Mutex<FocusHistory>,
    stop: &AtomicBool,
    config: &UiCaptureConfig,
    slot: &Mutex<Option<Connection>>,
) -> Result<()> {
    let conn = connect_to_atspi_bus()?;
    *slot.lock() = Some(conn.clone());
    if stop.load(Ordering::SeqCst) {
        return Ok(());
    }
    // Toolkits only emit events once a listener registered for them. This
    // also makes running Chromium/Electron apps build their AT-SPI2 tree.
    let _ = call(
        &conn,
        "org.a11y.atspi.Registry",
        "/org/a11y/atspi/registry",
        "org.a11y.atspi.Registry",
        "RegisterEvent",
        &("object:state-changed:focused",),
    );
    let _ = call(
        &conn,
        "org.a11y.atspi.Registry",
        "/org/a11y/atspi/registry",
        "org.a11y.atspi.Registry",
        "RegisterEvent",
        &("object:state-changed:active",),
    );
    let _ = call(
        &conn,
        "org.a11y.atspi.Registry",
        "/org/a11y/atspi/registry",
        "org.a11y.atspi.Registry",
        "RegisterEvent",
        &("window:activate",),
    );

    // Focus changes come as Object.StateChanged; window activation as
    // Object.StateChanged("active") from GTK and Window.Activate from Qt.
    // Object paths are toolkit-specific (GTK4 uses its own), so signals are
    // filtered here by interface and member.
    let rule = zbus::MatchRule::builder()
        .msg_type(zbus::message::Type::Signal)
        .build();
    let messages = zbus::blocking::MessageIterator::for_match_rule(rule, &conn, Some(256))?;
    debug!("AT-SPI2 focus listener connected");

    // Intake (this thread) and enrichment (a scoped thread) are separate:
    // describing one element never delays reading, and timestamping, the
    // signals queued behind it.
    let (jobs, queued) = crossbeam_channel::bounded::<FocusSignal>(HISTORY_LEN);
    thread::scope(|scope| {
        let enricher = &conn;
        scope.spawn(move || enrich(enricher, config, history, stop, queued));
        let read = read_signals(messages, history, stop, &jobs);
        // Closing the queue ends the enrichment thread once it is done with
        // the record in hand.
        drop(jobs);
        read
    })
}

/// A focus signal as read off the bus, waiting to be described.
#[derive(Debug, Clone)]
struct FocusSignal {
    at: Instant,
    target: Target,
    /// detail1 of the signal; `None` when the body did not say (older
    /// at-spi2-core), in which case the enrichment thread reads the state.
    gained: Option<bool>,
}

/// The intake loop: timestamps each signal as it is read and records it. It
/// makes no D-Bus call, so its timestamps stay true however slow apps are.
fn read_signals(
    messages: zbus::blocking::MessageIterator,
    history: &Mutex<FocusHistory>,
    stop: &AtomicBool,
    jobs: &crossbeam_channel::Sender<FocusSignal>,
) -> Result<()> {
    for message in messages {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        let message = message?;
        let at = Instant::now();
        let header = message.header();
        let (Some(sender), Some(path)) = (header.sender(), header.path()) else {
            continue;
        };
        let target = Target {
            bus: sender.to_string(),
            path: path.to_string(),
        };
        let interface = header.interface().map(|i| i.as_str());
        let member = header.member().map(|m| m.as_str());
        if interface == Some("org.a11y.atspi.Event.Window") && member == Some("Activate") {
            history.lock().window_activated(at, &target.key());
            continue;
        }
        if interface != Some("org.a11y.atspi.Event.Object") || member != Some("StateChanged") {
            continue;
        }
        // The state that changed and detail1, gained (1) or lost (0). The
        // body signature differs between at-spi2-core versions.
        let (state, detail) = state_change(&message);
        if state.as_deref() == Some("active") {
            if detail == Some(true) {
                history.lock().window_activated(at, &target.key());
            }
            continue;
        }
        // Only focus changes from here; a body that cannot be parsed does
        // not say which state changed, so it is not taken as focus.
        if state.as_deref() != Some("focused") {
            continue;
        }
        take_in(
            history,
            jobs,
            FocusSignal {
                at,
                target,
                gained: detail,
            },
        );
    }
    Ok(())
}

/// Record a focus signal now and queue its description. Never blocks: when
/// the enrichment thread is backlogged the record is left `Unknown`, so a
/// click waiting on it gets no element rather than a stale one.
fn take_in(
    history: &Mutex<FocusHistory>,
    jobs: &crossbeam_channel::Sender<FocusSignal>,
    signal: FocusSignal,
) {
    let key = signal.target.key();
    if signal.gained == Some(false) {
        history.lock().focus_lost(signal.at, &key);
        return;
    }
    let at = signal.at;
    history.lock().focus_gained(at, &key);
    if jobs.try_send(signal).is_err() {
        history.lock().resolve(at, &key, None, Focus::Unknown);
    }
}

/// The enrichment loop: describes queued records one by one, each under its
/// own deadline counted from its signal. Ends when the intake closes the queue
/// or the session stops.
fn enrich<T: Tree + ?Sized>(
    tree: &T,
    config: &UiCaptureConfig,
    history: &Mutex<FocusHistory>,
    stop: &AtomicBool,
    queued: crossbeam_channel::Receiver<FocusSignal>,
) {
    for signal in queued {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        let key = signal.target.key();
        let deadline = signal.at + ENRICH_BUDGET;
        let (app, focus) = if signal.gained.is_none() && !tree.focused(&signal.target) {
            (None, Focus::Lost)
        } else {
            describe_focus(tree, &signal.target, config, deadline)
        };
        if stop.load(Ordering::Relaxed) {
            break;
        }
        history.lock().resolve(signal.at, &key, app, focus);
    }
}

/// The state named by an `object:state-changed:*` signal ("focused",
/// "active") and its detail1 (gained or lost), when the body can be parsed.
fn state_change(message: &zbus::Message) -> (Option<String>, Option<bool>) {
    let body = message.body();
    let Ok(body) = body.deserialize::<Structure>() else {
        return (None, None);
    };
    let state = match body.fields().first() {
        Some(Value::Str(s)) => Some(s.to_string()),
        _ => None,
    };
    let detail = match body.fields().get(1) {
        Some(Value::I32(detail)) => Some(*detail != 0),
        _ => None,
    };
    (state, detail)
}

#[derive(Debug, Clone, PartialEq)]
struct Target {
    bus: String,
    path: String,
}

impl Target {
    fn key(&self) -> String {
        format!("{}{}", self.bus, self.path)
    }
}

fn connect_to_atspi_bus() -> Result<Connection> {
    let address = match std::env::var("AT_SPI_BUS_ADDRESS") {
        Ok(address) if !address.is_empty() => address,
        _ => {
            // Same bound as every other call: an unresponsive org.a11y.Bus
            // must reach the reconnect loop, not stall the listener.
            let session = zbus::blocking::connection::Builder::session()?
                .method_timeout(DBUS_TIMEOUT)
                .build()
                .context("no D-Bus session bus")?;
            call(
                &session,
                "org.a11y.Bus",
                "/org/a11y/bus",
                "org.a11y.Bus",
                "GetAddress",
                &(),
            )
            .context("AT-SPI2 bus not available")?
            .body()
            .deserialize::<String>()?
        }
    };
    Ok(
        zbus::blocking::connection::Builder::address(address.as_str())?
            .method_timeout(DBUS_TIMEOUT)
            .build()?,
    )
}

fn call<B: serde::ser::Serialize + zbus::zvariant::DynamicType>(
    conn: &Connection,
    dest: &str,
    path: &str,
    iface: &str,
    method: &str,
    body: &B,
) -> zbus::Result<zbus::Message> {
    let dest: BusName = dest.try_into().map_err(zbus::Error::from)?;
    let path: ObjectPath = path.try_into().map_err(zbus::Error::from)?;
    let iface: InterfaceName = iface.try_into().map_err(zbus::Error::from)?;
    conn.call_method(Some(dest), path, Some(iface), method, body)
}

fn property(conn: &Connection, target: &Target, name: &str) -> Option<OwnedValue> {
    call(
        conn,
        &target.bus,
        &target.path,
        DBUS_PROPERTIES,
        "Get",
        &(ATSPI_ACCESSIBLE, name),
    )
    .ok()?
    .body()
    .deserialize::<OwnedValue>()
    .ok()
}

/// A string property, trimmed and complete. Privacy decisions (exclusions,
/// password detection) are taken on this; [`non_empty_label`] bounds what is
/// recorded afterwards.
fn text_property(conn: &Connection, target: &Target, name: &str) -> Option<String> {
    let value: String = property(conn, target, name)?.try_into().ok()?;
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn non_empty_label(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.chars().take(MAX_LABEL_CHARS).collect())
    }
}

/// The accessibility queries [`describe_focus`] makes. Implemented by the
/// AT-SPI2 connection; tests describe a fake tree with it.
trait Tree: Sync {
    /// Name of the application owning `target`, complete.
    fn application(&self, target: &Target) -> Option<String>;
    fn parent(&self, target: &Target) -> Option<Target>;
    fn role_name(&self, target: &Target) -> String;
    fn role_id(&self, target: &Target) -> Option<u32>;
    /// A string property, trimmed and complete (not truncated).
    fn text(&self, target: &Target, name: &str) -> Option<String>;
    fn focused(&self, target: &Target) -> bool;
}

impl Tree for Connection {
    fn application(&self, target: &Target) -> Option<String> {
        application_name(self, target)
    }
    fn parent(&self, target: &Target) -> Option<Target> {
        parent(self, target)
    }
    fn role_name(&self, target: &Target) -> String {
        role_name(self, target)
    }
    fn role_id(&self, target: &Target) -> Option<u32> {
        role_id(self, target)
    }
    fn text(&self, target: &Target, name: &str) -> Option<String> {
        text_property(self, target, name)
    }
    fn focused(&self, target: &Target) -> bool {
        is_focused(self, target)
    }
}

fn role_name(conn: &Connection, target: &Target) -> String {
    call(
        conn,
        &target.bus,
        &target.path,
        ATSPI_ACCESSIBLE,
        "GetRoleName",
        &(),
    )
    .ok()
    .and_then(|reply| reply.body().deserialize::<String>().ok())
    .filter(|role| !role.is_empty())
    .unwrap_or_else(|| "unknown".to_string())
}

fn role_id(conn: &Connection, target: &Target) -> Option<u32> {
    call(
        conn,
        &target.bus,
        &target.path,
        ATSPI_ACCESSIBLE,
        "GetRole",
        &(),
    )
    .ok()?
    .body()
    .deserialize::<u32>()
    .ok()
}

fn is_focused(conn: &Connection, target: &Target) -> bool {
    call(
        conn,
        &target.bus,
        &target.path,
        ATSPI_ACCESSIBLE,
        "GetState",
        &(),
    )
    .ok()
    .and_then(|reply| reply.body().deserialize::<Vec<u32>>().ok())
    .is_some_and(|states| has_state(&states, STATE_FOCUSED))
}

fn has_state(states: &[u32], bit: u32) -> bool {
    states
        .get((bit / 32) as usize)
        .is_some_and(|word| word & (1 << (bit % 32)) != 0)
}

fn application_name(conn: &Connection, target: &Target) -> Option<String> {
    let (bus, path) = call(
        conn,
        &target.bus,
        &target.path,
        ATSPI_ACCESSIBLE,
        "GetApplication",
        &(),
    )
    .ok()?
    .body()
    .deserialize::<(String, OwnedObjectPath)>()
    .ok()?;
    text_property(
        conn,
        &Target {
            bus,
            path: path.to_string(),
        },
        "Name",
    )
}

fn parent(conn: &Connection, target: &Target) -> Option<Target> {
    let (bus, path): (String, OwnedObjectPath) =
        property(conn, target, "Parent")?.try_into().ok()?;
    let path = path.to_string();
    if bus.is_empty() || path == ATSPI_NULL_PATH || path == ATSPI_ROOT_PATH {
        return None;
    }
    Some(Target { bus, path })
}

/// Describe a newly focused element: owner first, filters second, labels
/// last. Every step checks `deadline`; past it the element is `Unknown`.
/// Filters and password detection see complete names; only what is recorded
/// is truncated.
fn describe_focus<T: Tree + ?Sized>(
    tree: &T,
    target: &Target,
    config: &UiCaptureConfig,
    deadline: Instant,
) -> (Option<String>, Focus) {
    let late = || Instant::now() >= deadline;
    // A record that waited in the queue past its deadline is not described.
    if late() {
        return (None, Focus::Unknown);
    }
    let label = |text: Option<String>| text.as_deref().and_then(non_empty_label);

    // 1. The owning application. Unknown owner: the filters cannot be
    //    applied, so nothing is described.
    let Some(app) = tree.application(target) else {
        return (None, Focus::Unknown);
    };
    let recorded_app = non_empty_label(&app);
    if !config.should_capture_app(&app) {
        return (recorded_app, Focus::Excluded);
    }
    if late() {
        return (recorded_app, Focus::Unknown);
    }

    // 2. The ancestor chain (roles only), up to the application node. Its
    //    top-level window gives the title the window filters need.
    let mut hops: Vec<(Target, String)> = Vec::new();
    let mut current = tree.parent(target);
    while let Some(node) = current {
        if hops.len() == MAX_ANCESTOR_WALK {
            break;
        }
        if late() {
            return (recorded_app, Focus::Unknown);
        }
        let role = tree.role_name(&node);
        // The application node is the app itself, not part of the window.
        if role == "application" {
            break;
        }
        current = tree.parent(&node);
        hops.push((node, role));
    }
    // The complete title: an exclusion can match past MAX_LABEL_CHARS.
    let window_title = hops
        .iter()
        .rev()
        .find(|(_, role)| WINDOW_ROLES.contains(&role.as_str()))
        .and_then(|(node, _)| tree.text(node, "Name"));
    if !config.should_capture_target(&app, window_title.as_deref()) {
        return (recorded_app, Focus::Excluded);
    }
    if late() {
        return (recorded_app, Focus::Unknown);
    }

    // 3. The element itself. A password field stops here. Without its
    //    numeric role, a password entry cannot be ruled out: describe nothing.
    let Some(role_id) = tree.role_id(target) else {
        return (recorded_app, Focus::Unknown);
    };
    let secret = role_id == ROLE_PASSWORD_TEXT_ID;
    let role = tree.role_name(target);
    let name = tree.text(target, "Name");
    if is_password(config, &role, name.as_deref(), secret) {
        // Decided on the complete name; passed on as `secret` so the
        // truncated label is not checked again (and cannot slip through).
        return (
            recorded_app,
            Focus::Element(element_context(config, role, None, None, Vec::new(), true)),
        );
    }
    let description = label(tree.text(target, "Description"));
    let mut named_hops = Vec::with_capacity(hops.len());
    for (node, role) in hops {
        if late() {
            return (recorded_app, Focus::Unknown);
        }
        named_hops.push(AncestorHop {
            name: label(tree.text(&node, "Name")),
            role,
        });
    }
    let element = element_context(config, role, label(name), description, named_hops, secret);
    (recorded_app, Focus::Element(element))
}

/// `secret`: the numeric role says password entry (or could not be read).
fn is_password(config: &UiCaptureConfig, role: &str, name: Option<&str>, secret: bool) -> bool {
    config.skip_password_fields
        && (secret || role == ROLE_PASSWORD_TEXT || config.is_password_field(Some(role), name))
}

/// The element as recorded, with the same privacy handling as the macOS click
/// context: a password field keeps only its role, and ancestor names (which
/// mirror on-screen content) get PII removal.
fn element_context(
    config: &UiCaptureConfig,
    role: String,
    name: Option<String>,
    description: Option<String>,
    mut hops: Vec<AncestorHop>,
    secret: bool,
) -> ElementContext {
    if is_password(config, &role, name.as_deref(), secret) {
        return ElementContext {
            role,
            name: Some("[password field]".to_string()),
            value: None,
            description: None,
            automation_id: None,
            bounds: None,
            ancestors: None,
        };
    }
    if config.apply_pii_removal {
        for hop in &mut hops {
            if let Some(n) = hop.name.take() {
                hop.name = Some(remove_pii(&n));
            }
        }
    }
    ElementContext {
        role,
        name,
        value: None,
        description,
        automation_id: None,
        bounds: None,
        ancestors: ancestors_to_json(hops, MAX_ANCESTORS_KEPT),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn element(role: &str, name: &str) -> ElementContext {
        ElementContext {
            role: role.to_string(),
            name: Some(name.to_string()),
            value: None,
            description: None,
            automation_id: None,
            bounds: None,
            ancestors: None,
        }
    }

    fn record(at: Instant, key: &str, app: &str, focus: Focus) -> FocusRecord {
        FocusRecord {
            at,
            key: key.to_string(),
            app: Some(app.to_string()),
            focus,
        }
    }

    fn el(role: &str, name: &str) -> Focus {
        Focus::Element(element(role, name))
    }

    fn name_of(target: ClickTarget) -> Option<String> {
        match target {
            ClickTarget::Element(e) => e.name,
            _ => None,
        }
    }

    fn config_excluding(apps: &[&str]) -> UiCaptureConfig {
        let mut config = UiCaptureConfig {
            excluded_apps: apps.iter().map(|a| a.to_string()).collect(),
            ..Default::default()
        };
        config.compile_patterns();
        config
    }

    #[test]
    fn click_that_moves_focus_is_attributed_to_the_new_element() {
        let t0 = Instant::now();
        let click = t0 + Duration::from_secs(1);
        let mut history = FocusHistory::default();
        history.push(record(t0, "a", "gedit", el("text", "Body")));
        history.push(record(
            click + Duration::from_millis(40),
            "b",
            "gedit",
            el("push button", "Save"),
        ));

        let ClickTarget::Element(clicked) = history.element_for_click(click) else {
            panic!("expected an element");
        };
        assert_eq!(clicked.role, "push button");
        assert_eq!(clicked.name.as_deref(), Some("Save"));
    }

    #[test]
    fn focus_change_after_the_settle_window_is_not_the_click() {
        let t0 = Instant::now();
        let click = t0 + Duration::from_secs(1);
        let mut history = FocusHistory::default();
        history.push(record(t0, "a", "gedit", el("text", "Body")));
        history.push(record(
            click + CLICK_SETTLE + Duration::from_millis(1),
            "b",
            "gedit",
            el("push button", "Later"),
        ));

        assert!(matches!(
            history.element_for_click(click),
            ClickTarget::Nothing
        ));
    }

    /// Seen live: a click that activates a window is followed by a focus the
    /// toolkit may have restored (Qt: the clicked button, or the text field
    /// when a label was clicked). It gets no element; later clicks do.
    #[test]
    fn click_that_activates_a_window_gets_no_element() {
        let t0 = Instant::now();
        let click = t0 + Duration::from_secs(1);
        let mut history = FocusHistory::default();
        history.window_activated(click + Duration::from_millis(40), "frame");
        history.push(record(
            click + Duration::from_millis(45),
            "field",
            "qtapp",
            el("text", "Search"),
        ));
        history.push(record(
            click + Duration::from_millis(60),
            "button",
            "qtapp",
            el("push button", "Send"),
        ));
        assert!(matches!(
            history.element_for_click(click),
            ClickTarget::Nothing
        ));

        // The next click, in the now active window, is attributed.
        let later = click + Duration::from_secs(1);
        history.push(record(
            later + Duration::from_millis(30),
            "button2",
            "qtapp",
            el("push button", "Save"),
        ));
        assert_eq!(
            name_of(history.element_for_click(later)),
            Some("Save".to_string())
        );

        // Activation into an excluded app still drops the click.
        let third = later + Duration::from_secs(1);
        history.window_activated(third + Duration::from_millis(20), "kp");
        history.push(record(
            third + Duration::from_millis(30),
            "k",
            "KeePassXC",
            Focus::Excluded,
        ));
        assert!(matches!(
            history.element_for_click(third),
            ClickTarget::Excluded
        ));
    }

    /// Seen live with Qt: a click on empty space moves no focus. The text
    /// field that had focus is not what was clicked and must not be attached.
    #[test]
    fn click_that_moves_no_focus_is_not_attributed_to_the_focused_element() {
        let t0 = Instant::now();
        let mut history = FocusHistory::default();
        history.push(record(t0, "a", "Firefox", el("entry", "Search")));
        let click = t0 + Duration::from_secs(5);

        assert!(matches!(
            history.element_for_click(click),
            ClickTarget::Nothing
        ));
    }

    /// Louis's P1: the window observer keeps the last allowed app when an
    /// excluded one becomes active, so the click says "gedit" while focus
    /// moved into the password manager. The excluded element must neither be
    /// attached nor let the click through under gedit's name.
    #[test]
    fn click_into_an_excluded_app_is_dropped_not_attributed_to_the_previous_app() {
        let t0 = Instant::now();
        let click = t0 + Duration::from_secs(1);
        let mut history = FocusHistory::default();
        history.push(record(t0, "a", "gedit", el("text", "Body")));
        history.push(record(
            click + Duration::from_millis(30),
            "k",
            "KeePassXC",
            Focus::Excluded,
        ));

        assert!(matches!(
            history.element_for_click(click),
            ClickTarget::Excluded
        ));
        // A later click while focus is still in the excluded app: same.
        assert!(matches!(
            history.element_for_click(click + Duration::from_secs(2)),
            ClickTarget::Excluded
        ));
    }

    /// Seen live: the window observer names the process ("python3"), the
    /// element's owner is its AT-SPI2 name ("appgtk"). The focus that the
    /// click moved is still what was clicked.
    #[test]
    fn click_is_attributed_when_observer_and_atspi_names_differ() {
        let t0 = Instant::now();
        let click = t0 + Duration::from_secs(1);
        let mut history = FocusHistory::default();
        history.push(record(
            click + Duration::from_millis(30),
            "b",
            "appgtk",
            el("push button", "Envoyer facture"),
        ));
        assert_eq!(
            name_of(history.element_for_click(click)),
            Some("Envoyer facture".to_string())
        );
    }

    /// Louis's P2 (deadline): the focus change is known before its metadata.
    /// A click resolved meanwhile must wait for it, not take the old element.
    #[test]
    fn pending_focus_makes_the_click_wait_then_resolves_to_the_new_element() {
        let t0 = Instant::now();
        let click = t0 + Duration::from_secs(1);
        let changed = click + Duration::from_millis(20);
        let mut history = FocusHistory::default();
        history.push(record(t0, "a", "gedit", el("text", "Body")));
        history.focus_gained(changed, "b");

        assert!(matches!(
            history.element_for_click(click),
            ClickTarget::Wait
        ));
        history.resolve(
            changed,
            "b",
            Some("gedit".to_string()),
            el("push button", "Save"),
        );
        assert_eq!(
            name_of(history.element_for_click(click)),
            Some("Save".to_string())
        );
    }

    #[test]
    fn unknown_owner_attributes_nothing() {
        let t0 = Instant::now();
        let click = t0 + Duration::from_secs(1);
        let mut history = FocusHistory::default();
        history.push(record(t0, "a", "gedit", el("text", "Body")));
        history.focus_gained(click + Duration::from_millis(20), "b");
        history.resolve(click + Duration::from_millis(20), "b", None, Focus::Unknown);
        assert!(matches!(
            history.element_for_click(click),
            ClickTarget::Nothing
        ));
    }

    #[test]
    fn resolve_only_fills_its_own_pending_record() {
        let t0 = Instant::now();
        let mut history = FocusHistory::default();
        history.focus_gained(t0, "a");
        history.resolve(t0 + Duration::from_millis(1), "a", None, el("x", "wrong"));
        history.resolve(t0, "b", None, el("x", "wrong"));
        assert!(matches!(
            history.records.back().unwrap().focus,
            Focus::Pending
        ));
    }

    #[test]
    fn lost_focus_is_not_used_as_fallback() {
        let t0 = Instant::now();
        let mut history = FocusHistory::default();
        history.push(record(t0, "a", "gedit", el("text", "Body")));
        history.focus_lost(t0 + Duration::from_millis(10), "a");
        // Losing focus on an element that is not the current one is ignored.
        history.focus_lost(t0 + Duration::from_millis(20), "other");

        assert!(matches!(
            history.element_for_click(t0 + Duration::from_secs(1)),
            ClickTarget::Nothing
        ));
    }

    #[test]
    fn empty_history_attributes_nothing() {
        let history = FocusHistory::default();
        assert!(matches!(
            history.element_for_click(Instant::now()),
            ClickTarget::Nothing
        ));
    }

    #[test]
    fn history_is_bounded() {
        let t0 = Instant::now();
        let mut history = FocusHistory::default();
        for i in 0..(HISTORY_LEN as u64 + 5) {
            history.push(record(
                t0 + Duration::from_millis(i),
                &i.to_string(),
                "app",
                el("text", &i.to_string()),
            ));
        }
        assert_eq!(history.records.len(), HISTORY_LEN);
        assert_eq!(history.records.front().unwrap().key, "5");
    }

    #[test]
    fn app_names_match_across_sources() {
        assert!(same_app("firefox", "Firefox"));
        assert!(same_app("org.gnome.TextEditor", "gnome.texteditor"));
        assert!(!same_app("konsole", "Firefox"));
        assert!(!same_app("", "Firefox"));
    }

    #[test]
    fn labels_are_trimmed_and_bounded() {
        assert_eq!(non_empty_label("  "), None);
        assert_eq!(non_empty_label(" Save "), Some("Save".to_string()));
        assert_eq!(
            non_empty_label(&"é".repeat(500)).unwrap().chars().count(),
            MAX_LABEL_CHARS
        );
    }

    /// Louis's P2 (password fields): like macOS, keep the role only.
    #[test]
    fn password_field_keeps_only_its_role() {
        let config = UiCaptureConfig::default();
        let hops = vec![AncestorHop {
            name: Some("Sign in to Example Bank".to_string()),
            role: "panel".to_string(),
        }];
        let ctx = element_context(
            &config,
            ROLE_PASSWORD_TEXT.to_string(),
            Some("Example Bank password".to_string()),
            Some("account jane@example.com".to_string()),
            hops,
            false,
        );
        assert_eq!(ctx.role, ROLE_PASSWORD_TEXT);
        assert_eq!(ctx.name.as_deref(), Some("[password field]"));
        assert_eq!(ctx.description, None);
        assert_eq!(ctx.ancestors, None);
        assert_eq!(ctx.value, None);

        // Detected by name too, whatever the role.
        let ctx = element_context(
            &config,
            "text".to_string(),
            Some("Mot de passe".to_string()),
            Some("compte".to_string()),
            Vec::new(),
            false,
        );
        assert_eq!(ctx.name.as_deref(), Some("[password field]"));
        assert_eq!(ctx.description, None);
    }

    /// GTK4 names a password entry's role "text box"; only the numeric role
    /// says password. A neutral label must not leak (seen live in a VM).
    #[test]
    fn gtk4_password_entry_is_detected_by_its_numeric_role() {
        let config = UiCaptureConfig::default();
        let ctx = element_context(
            &config,
            "text box".to_string(),
            Some("Code d'accès".to_string()),
            Some("compte".to_string()),
            Vec::new(),
            true,
        );
        assert_eq!(ctx.name.as_deref(), Some("[password field]"));
        assert_eq!(ctx.description, None);
        // The same entry when it is not secret keeps its label.
        let ctx = element_context(
            &config,
            "text box".to_string(),
            Some("Code d'accès".to_string()),
            None,
            Vec::new(),
            false,
        );
        assert_eq!(ctx.name.as_deref(), Some("Code d'accès"));
    }

    #[test]
    fn password_handling_follows_skip_password_fields() {
        let config = UiCaptureConfig {
            skip_password_fields: false,
            ..Default::default()
        };
        let ctx = element_context(
            &config,
            ROLE_PASSWORD_TEXT.to_string(),
            Some("Bank password".to_string()),
            None,
            Vec::new(),
            true,
        );
        assert_eq!(ctx.name.as_deref(), Some("Bank password"));
    }

    /// A fake AT-SPI2 tree for `describe_focus` and the enrichment thread.
    /// Nodes are keyed by object path; `slow` delays the application lookup
    /// of a node, like an app that answers late.
    #[derive(Default)]
    struct FakeTree {
        nodes: std::collections::HashMap<String, FakeNode>,
        slow: std::collections::HashMap<String, Duration>,
    }

    #[derive(Default, Clone)]
    struct FakeNode {
        app: Option<String>,
        parent: Option<String>,
        role: String,
        role_id: u32,
        name: Option<String>,
    }

    fn node(path: &str) -> Target {
        Target {
            bus: ":1.42".to_string(),
            path: path.to_string(),
        }
    }

    impl FakeTree {
        fn add(&mut self, path: &str, parent: Option<&str>, role: &str, name: Option<&str>) {
            self.nodes.insert(
                path.to_string(),
                FakeNode {
                    app: Some("gedit".to_string()),
                    parent: parent.map(str::to_string),
                    role: role.to_string(),
                    role_id: if role == ROLE_PASSWORD_TEXT {
                        ROLE_PASSWORD_TEXT_ID
                    } else {
                        1
                    },
                    name: name.map(str::to_string),
                },
            );
        }

        /// gedit > window titled `title` > `role` element named `name` at "el".
        fn window(title: &str, role: &str, name: &str) -> Self {
            let mut tree = FakeTree::default();
            tree.add("app", None, "application", Some("gedit"));
            tree.add("win", Some("app"), "frame", Some(title));
            tree.add("el", Some("win"), role, Some(name));
            tree
        }
    }

    impl Tree for FakeTree {
        fn application(&self, target: &Target) -> Option<String> {
            if let Some(delay) = self.slow.get(&target.path) {
                thread::sleep(*delay);
            }
            self.nodes.get(&target.path)?.app.clone()
        }
        fn parent(&self, target: &Target) -> Option<Target> {
            self.nodes.get(&target.path)?.parent.as_deref().map(node)
        }
        fn role_name(&self, target: &Target) -> String {
            self.nodes
                .get(&target.path)
                .map_or_else(|| "unknown".to_string(), |n| n.role.clone())
        }
        fn role_id(&self, target: &Target) -> Option<u32> {
            Some(self.nodes.get(&target.path)?.role_id)
        }
        fn text(&self, target: &Target, name: &str) -> Option<String> {
            match name {
                "Name" => self.nodes.get(&target.path)?.name.clone(),
                _ => None,
            }
        }
        fn focused(&self, _target: &Target) -> bool {
            true
        }
    }

    /// Louis's P1 (21/10): the title is checked complete. An exclusion marker
    /// past MAX_LABEL_CHARS used to be cut off before the window filter ran.
    #[test]
    fn window_exclusion_matches_past_the_label_limit() {
        let title = format!("{} SECRET-VAULT", "x".repeat(MAX_LABEL_CHARS + 20));
        let tree = FakeTree::window(&title, "push button", "Copy");
        let mut config = UiCaptureConfig {
            excluded_window_pattern_strings: vec!["SECRET-VAULT".to_string()],
            ..Default::default()
        };
        config.compile_patterns();
        let later = Instant::now() + Duration::from_secs(5);

        let (app, focus) = describe_focus(&tree, &node("el"), &config, later);
        assert!(matches!(focus, Focus::Excluded), "{focus:?}");
        assert_eq!(app.as_deref(), Some("gedit"));

        // Same window, nothing excluded: recorded, its title truncated (the
        // marker past the limit is not kept).
        let (_, focus) = describe_focus(&tree, &node("el"), &UiCaptureConfig::default(), later);
        let Focus::Element(element) = focus else {
            panic!("expected an element, got {focus:?}");
        };
        assert_eq!(element.name.as_deref(), Some("Copy"));
        let ancestors = element.ancestors.expect("ancestors");
        assert!(ancestors.contains("\"frame\""), "{ancestors}");
        assert!(ancestors.contains("xxxxxxxxxx"), "{ancestors}");
        assert!(!ancestors.contains("SECRET-VAULT"), "{ancestors}");
    }

    /// Same rule for password detection: a keyword past MAX_LABEL_CHARS
    /// still hides the field (the truncated name is not checked again).
    #[test]
    fn password_keyword_past_the_label_limit_hides_the_field() {
        let name = format!("{} password", "x".repeat(MAX_LABEL_CHARS + 5));
        let tree = FakeTree::window("Sign in", "text", &name);
        let later = Instant::now() + Duration::from_secs(5);
        let (_, focus) = describe_focus(&tree, &node("el"), &UiCaptureConfig::default(), later);
        let Focus::Element(element) = focus else {
            panic!("expected an element, got {focus:?}");
        };
        assert_eq!(element.name.as_deref(), Some("[password field]"));
        assert_eq!(element.ancestors, None);
    }

    /// A record that waited in the queue past its deadline is not described.
    #[test]
    fn a_record_past_its_deadline_is_not_described() {
        let tree = FakeTree::window("Doc", "push button", "Save");
        let past = Instant::now() - Duration::from_millis(1);
        let (app, focus) = describe_focus(&tree, &node("el"), &UiCaptureConfig::default(), past);
        assert!(app.is_none());
        assert!(matches!(focus, Focus::Unknown));
    }

    fn signal(path: &str, at: Instant) -> FocusSignal {
        FocusSignal {
            at,
            target: node(path),
            gained: Some(true),
        }
    }

    /// Louis's P2 (21/10): a second focus signal arrives while the first is
    /// being described. Intake records it at once, with its own time, so it
    /// is not pushed into a later click's window.
    #[test]
    fn a_slow_description_does_not_shift_the_next_signal() {
        let mut tree = FakeTree::default();
        tree.add("app", None, "application", Some("gedit"));
        tree.add("win", Some("app"), "frame", Some("Doc"));
        tree.add("a", Some("win"), "push button", Some("A"));
        tree.add("b", Some("win"), "push button", Some("B"));
        tree.slow
            .insert("a".to_string(), Duration::from_millis(200));
        let config = UiCaptureConfig::default();
        let history = Mutex::new(FocusHistory::default());
        let stop = AtomicBool::new(false);
        let (jobs, queued) = crossbeam_channel::bounded(HISTORY_LEN);

        let first_click = Instant::now();
        let b_at = thread::scope(|scope| {
            let (tree, config, history, stop) = (&tree, &config, &history, &stop);
            scope.spawn(move || enrich(tree, config, history, stop, queued));
            thread::sleep(Duration::from_millis(20));
            take_in(history, &jobs, signal("a", Instant::now()));
            thread::sleep(Duration::from_millis(40)); // "a" is being described
            let b_at = Instant::now();
            take_in(history, &jobs, signal("b", b_at));
            // Taken in without waiting for "a", at its own time.
            assert!(b_at.elapsed() < Duration::from_millis(30));
            let recorded = history.lock().records.iter().any(|r| {
                r.key == node("b").key() && r.at == b_at && matches!(r.focus, Focus::Pending)
            });
            assert!(recorded, "b not recorded while a was described");
            drop(jobs);
            b_at
        });
        assert!(b_at - first_click < CLICK_SETTLE);

        // Both described in the end. The click that caused them gets "A"; a
        // click at +100 ms, after "b", gets nothing (before the fix "b" was
        // stamped ~+220 ms, inside that click's window).
        let history = history.into_inner();
        let second_click = first_click + Duration::from_millis(100);
        assert_eq!(
            name_of(history.element_for_click_until(first_click, Some(second_click))).as_deref(),
            Some("A")
        );
        assert!(matches!(
            history.element_for_click(second_click),
            ClickTarget::Nothing
        ));
    }

    /// A backlogged enrichment thread never blocks intake: the record is left
    /// Unknown, so a click waiting on it gets no element.
    #[test]
    fn intake_never_blocks_on_a_full_queue() {
        let history = Mutex::new(FocusHistory::default());
        let (jobs, _queued) = crossbeam_channel::bounded(0);
        let at = Instant::now();
        take_in(&history, &jobs, signal("a", at));
        let history = history.into_inner();
        assert!(matches!(history.records[0].focus, Focus::Unknown));
        assert!(matches!(
            history.element_for_click(at),
            ClickTarget::Nothing
        ));
    }

    /// Louis's P3 (21/10): empty-space click at 0 ms, button click at 80 ms,
    /// button focus at 100 ms. Only the button click gets the button.
    #[test]
    fn nearby_clicks_do_not_share_one_focus_change() {
        let empty_click = Instant::now();
        let button_click = empty_click + Duration::from_millis(80);
        let mut history = FocusHistory::default();
        history.push(record(
            empty_click + Duration::from_millis(100),
            "btn",
            "gedit",
            el("push button", "Save"),
        ));
        assert!(matches!(
            history.element_for_click_until(empty_click, Some(button_click)),
            ClickTarget::Nothing
        ));
        assert_eq!(
            name_of(history.element_for_click_until(button_click, None)).as_deref(),
            Some("Save")
        );
        // A press at the same instant is not a boundary.
        assert_eq!(
            name_of(history.element_for_click_until(button_click, Some(button_click))).as_deref(),
            Some("Save")
        );
    }

    #[test]
    fn ancestor_names_get_pii_removal() {
        let hops = || {
            vec![AncestorHop {
                name: Some("Inbox of jane.doe@example.com".to_string()),
                role: "panel".to_string(),
            }]
        };
        let config = UiCaptureConfig::default();
        assert!(config.apply_pii_removal);
        let ctx = element_context(
            &config,
            "push button".to_string(),
            Some("Send".to_string()),
            None,
            hops(),
            false,
        );
        let ancestors = ctx.ancestors.expect("ancestors");
        assert!(!ancestors.contains("jane.doe@example.com"), "{ancestors}");

        let raw = UiCaptureConfig {
            apply_pii_removal: false,
            ..Default::default()
        };
        let ctx = element_context(&raw, "push button".to_string(), None, None, hops(), false);
        assert!(ctx.ancestors.unwrap().contains("jane.doe@example.com"));
    }

    #[test]
    fn excluded_apps_are_matched_on_the_owner() {
        let config = config_excluding(&["keepassxc"]);
        assert!(!config.should_capture_app("KeePassXC"));
        assert!(config.should_capture_app("gedit"));
    }

    /// Louis's P2 (stop): a listener that cannot reach the bus must not keep
    /// retrying for `RECONNECT_DELAY` after the session stopped.
    #[test]
    fn reconnect_loop_ends_promptly_on_stop() {
        let stop = Arc::new(AtomicBool::new(false));
        let attempts = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let handle = {
            let stop = stop.clone();
            let attempts = attempts.clone();
            thread::spawn(move || {
                reconnect_loop(&stop, || {
                    attempts.fetch_add(1, Ordering::SeqCst);
                    anyhow::bail!("no bus")
                })
            })
        };
        while attempts.load(Ordering::SeqCst) == 0 {
            thread::sleep(Duration::from_millis(5));
        }
        let stopped_at = Instant::now();
        stop.store(true, Ordering::SeqCst);
        handle.join().unwrap();
        assert!(stopped_at.elapsed() < Duration::from_secs(1));
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn shutdown_clears_the_history_and_stops_the_listener() {
        // No AT-SPI2 bus in unit tests: the listener sits in its reconnect
        // wait, which stopping must interrupt.
        let stop = Arc::new(AtomicBool::new(false));
        let tracker = FocusTracker::start(UiCaptureConfig::default(), stop.clone());
        let history = tracker.history();
        history
            .lock()
            .push(record(Instant::now(), "a", "gedit", el("text", "Body")));
        let started = Instant::now();
        tracker.shutdown();
        assert!(stop.load(Ordering::SeqCst));
        assert!(history.lock().records.is_empty());
        assert!(started.elapsed() < SHUTDOWN_WAIT + Duration::from_millis(500));
    }

    /// Live check against a real AT-SPI2 bus. Start the listener, then move
    /// focus to an element whose name is `SCREENPIPE_ATSPI_EXPECT` (e.g. by
    /// clicking a button labelled that way) within 15 s:
    ///
    /// ```sh
    /// SCREENPIPE_ATSPI_EXPECT="Save draft" \
    ///   cargo test -p screenpipe-a11y --lib live_focus -- --ignored --nocapture
    /// ```
    ///
    /// With `SCREENPIPE_ATSPI_EXCLUDE=<app>`, the app is excluded and the test
    /// instead expects focus changes in it to be recorded as `Excluded`, with
    /// no label anywhere in the history.
    #[test]
    #[ignore = "needs a desktop session with AT-SPI2 and a focus change"]
    fn live_focus_change_is_attributed_to_click() {
        let expected =
            std::env::var("SCREENPIPE_ATSPI_EXPECT").expect("set SCREENPIPE_ATSPI_EXPECT");
        let excluded = std::env::var("SCREENPIPE_ATSPI_EXCLUDE").ok();
        let config = match &excluded {
            Some(app) => config_excluding(&[app.as_str()]),
            None => UiCaptureConfig::default(),
        };
        let stop = Arc::new(AtomicBool::new(false));
        let tracker = FocusTracker::start(config, stop);
        let history = tracker.history();
        let deadline = Instant::now() + Duration::from_secs(15);

        if let Some(app) = excluded {
            let record = loop {
                let found = history
                    .lock()
                    .records
                    .iter()
                    .find(|r| matches!(r.focus, Focus::Excluded))
                    .cloned();
                if let Some(record) = found {
                    break record;
                }
                assert!(Instant::now() < deadline, "no excluded focus event");
                thread::sleep(Duration::from_millis(50));
            };
            println!("excluded record: app={:?} key={}", record.app, record.key);
            assert!(same_app(&app, record.app.as_deref().unwrap_or_default()));
            let leaked = history.lock().records.iter().any(|r| match &r.focus {
                Focus::Element(e) => e.name.as_deref() == Some(expected.as_str()),
                _ => false,
            });
            assert!(!leaked, "label of the excluded app reached the history");
            let click = record.at - Duration::from_millis(40);
            assert!(matches!(
                history.lock().element_for_click(click),
                ClickTarget::Excluded
            ));
            tracker.shutdown();
            return;
        }

        let record = loop {
            let found = history
                .lock()
                .records
                .iter()
                .find(|r| match &r.focus {
                    Focus::Element(e) => e.name.as_deref() == Some(expected.as_str()),
                    _ => false,
                })
                .cloned();
            if let Some(record) = found {
                break record;
            }
            assert!(Instant::now() < deadline, "no focus event for {expected:?}");
            thread::sleep(Duration::from_millis(50));
        };
        // A click 40 ms before that focus change resolves to the element.
        let click = record.at - Duration::from_millis(40);
        let ClickTarget::Element(element) = history.lock().element_for_click(click) else {
            panic!("click not attributed");
        };
        println!("app={:?} element={:?}", record.app, element);
        assert_eq!(element.name.as_deref(), Some(expected.as_str()));
        assert_ne!(element.role, "unknown");
        // Stopping closes the bus connection: the listener exits (rather than
        // being detached after SHUTDOWN_WAIT) and the history is empty.
        let stopping = Instant::now();
        tracker.shutdown();
        assert!(stopping.elapsed() < SHUTDOWN_WAIT, "listener did not exit");
        assert!(history.lock().records.is_empty());
    }

    /// Louis's P2 (initial lookup timeout). Run with a session bus where
    /// `org.a11y.Bus` is owned by a service that never answers, and without
    /// `AT_SPI_BUS_ADDRESS`: the lookup must fail within the D-Bus timeout.
    #[test]
    #[ignore = "needs a session bus with an unresponsive org.a11y.Bus"]
    fn live_unresponsive_accessibility_bus_times_out() {
        assert!(std::env::var("AT_SPI_BUS_ADDRESS").is_err());
        let started = Instant::now();
        let result = connect_to_atspi_bus();
        let took = started.elapsed();
        println!("result={:?} took={took:?}", result.as_ref().map(|_| ()));
        assert!(result.is_err());
        assert!(took < DBUS_TIMEOUT + Duration::from_millis(500), "{took:?}");
    }

    #[test]
    fn focused_state_bit() {
        assert!(has_state(&[1 << STATE_FOCUSED, 0], STATE_FOCUSED));
        assert!(!has_state(&[0, 0], STATE_FOCUSED));
        assert!(!has_state(&[], STATE_FOCUSED));
    }
}
