// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

use super::{report_failure, select, Identity, Selection};
use anyhow::{bail, Context, Result};
use fs2::FileExt;
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions},
    os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock,
    },
    time::Duration,
};
use tauri::Manager;

#[path = "kernel_signature.rs"]
mod kernel_signature;
#[path = "signing.rs"]
mod signing;
pub(crate) use signing::process_stamp;

const WAIT: Duration = Duration::from_secs(30);
const EXPECTED_BUILD_ENV: &str = "SCREENPIPE_MANUAL_HANDOFF_BUILD";
static RUNTIME: OnceLock<Runtime> = OnceLock::new();
static LAUNCH_LOCK: Mutex<Option<File>> = Mutex::new(None);
static PENDING: AtomicBool = AtomicBool::new(false);
static CAPTURE_BEFORE_HANDOFF: AtomicBool = AtomicBool::new(false);

struct Runtime {
    identity: Identity,
    requirement: String,
    lock: PathBuf,
    root: PathBuf,
    executable_stamp: (u64, u64, i64, i64, u64),
}

pub(crate) fn owns_launch() -> bool {
    RUNTIME.get().is_some()
}
pub(crate) fn pending() -> bool {
    PENDING.load(Ordering::SeqCst)
}

fn manual_launch() -> bool {
    !std::env::args().any(|a| a == "--autostart" || a.contains("://"))
        && !std::env::var("XPC_SERVICE_NAME")
            .is_ok_and(|s| !s.starts_with("application.") && s.contains("screenpipe"))
}

fn private_directory(root: &Path, identifier: &str) -> Result<PathBuf> {
    let hash = Sha256::digest(format!("{}:{identifier}", root.display()).as_bytes());
    // Retain the existing owner-only launch-lock directory across app versions.
    let digest = format!("{hash:x}");
    let directory = PathBuf::from(format!(
        "/tmp/screenpipe-handoff-{}-{}",
        unsafe { libc::geteuid() },
        &digest[..24]
    ));
    match std::fs::DirBuilder::new().mode(0o700).create(&directory) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(e) => return Err(e.into()),
    }
    let metadata = std::fs::symlink_metadata(&directory)?;
    if !metadata.is_dir()
        || metadata.uid() != unsafe { libc::geteuid() }
        || metadata.mode() & 0o077 != 0
    {
        bail!("unsafe instance directory");
    }
    Ok(directory)
}

async fn acquire(path: &Path) -> Result<File> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)?;
    let start = std::time::Instant::now();
    loop {
        match file.try_lock_exclusive() {
            Ok(()) => return Ok(file),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock && start.elapsed() < WAIT => {
                tokio::time::sleep(Duration::from_millis(100)).await
            }
            Err(e) => return Err(e).context("another app launch has not finished"),
        }
    }
}

async fn wait_for_exit(old: &Identity) -> Result<()> {
    wait_until_exit(old, WAIT).await?;
    // Match the existing updater's ScreenCaptureKit release interval.
    tokio::time::sleep(crate::process_exit::MACOS_UPDATER_RELAUNCH_SETTLE).await;
    Ok(())
}

async fn wait_until_exit(old: &Identity, timeout: Duration) -> Result<()> {
    tokio::time::timeout(timeout, async {
        while signing::process_stamp(old.pid).ok() == Some((old.uid, old.started)) {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .context("old process did not exit; replacement was not started")?;
    Ok(())
}

pub(crate) async fn initialize() -> Result<()> {
    // Match the single-instance plugin's existing E2E isolation: those builds
    // use separate data, API, and focus ports and must not inspect another app
    // as a legacy owner merely because it has the same signing identity.
    if cfg!(feature = "e2e") {
        return Ok(());
    }
    // Bare development/test executables do not participate in production ownership.
    let executable = std::env::current_exe()?;
    if !executable.components().any(|c| c.as_os_str() == "Contents") {
        return Ok(());
    }
    let root = screenpipe_core::paths::default_screenpipe_data_dir();
    let result = initialize_inner(root.clone()).await;
    if let Err(error) = &result {
        report_failure(&root, "launch", &format!("{error:#}"));
        show_error(&format!("Screenpipe couldn't open this copy. {error:#}"));
    }
    result
}

async fn initialize_inner(root: PathBuf) -> Result<()> {
    let requirement = signing::own_requirement()?;
    let identity = signing::running(std::process::id() as i32, &requirement)?;
    let verified = signing::on_disk(&identity.executable, &requirement, &identity)?;
    if verified.hash != identity.hash || verified.identifier != identity.identifier {
        bail!("opened bundle changed during launch");
    }
    if let Ok(expected) = std::env::var(EXPECTED_BUILD_ENV) {
        std::env::remove_var(EXPECTED_BUILD_ENV);
        if expected != identity.hash {
            bail!("replacement changed after verification; launch was cancelled");
        }
    }
    let directory = private_directory(&root, &identity.identifier)?;
    let executable_stamp = file_stamp(&identity.executable)?;
    let runtime = Runtime {
        identity,
        requirement,
        lock: directory.join("launch"),
        executable_stamp,
        root,
    };
    let lock = acquire(&runtime.lock).await?;
    takeover(&runtime).await?;
    let _ = RUNTIME.set(runtime);
    *LAUNCH_LOCK.lock().unwrap_or_else(|e| e.into_inner()) = Some(lock);
    Ok(())
}

// Revalidate the selected bundle immediately before terminating the old owner.
fn verify_selected_bundle(runtime: &Runtime) -> Result<()> {
    let verified = signing::on_disk(
        &runtime.identity.executable,
        &runtime.requirement,
        &runtime.identity,
    )?;
    if verified.hash != runtime.identity.hash || verified.identifier != runtime.identity.identifier
    {
        bail!("opened bundle changed during launch");
    }
    Ok(())
}

async fn focus_existing(old: &Identity) -> Result<()> {
    let port = focus_port();
    verify_listener(old.pid, port).await?;
    let args: Vec<String> = std::env::args().collect();
    let deep_link_url = crate::deep_link::url_from_args(&args);
    let response = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(3))
        .build()?
        .post(format!("http://127.0.0.1:{port}/focus"))
        .json(&serde_json::json!({
            "args": args, "deep_link_url": deep_link_url,
            "launchd_job_label": std::env::var("XPC_SERVICE_NAME").ok(),
        }))
        .send()
        .await?;
    response
        .error_for_status()
        .context("existing app could not accept this launch")?;
    Ok(())
}

fn focus_port() -> u16 {
    std::env::var("SCREENPIPE_FOCUS_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(11435)
}

fn record_selection(runtime: &Runtime, source: &Identity, target: &Identity) {
    crate::update_diagnostics::append(
        &runtime.root,
        "manual_handoff_candidate",
        &format!(
            "source={}; target={}",
            serde_json::to_string(source).unwrap_or_default(),
            serde_json::to_string(target).unwrap_or_default()
        ),
    );
}

pub(crate) fn install(_app: &tauri::AppHandle) -> Result<()> {
    let Some(runtime) = RUNTIME.get() else {
        return Ok(());
    };
    LAUNCH_LOCK.lock().unwrap_or_else(|e| e.into_inner()).take();
    crate::update_diagnostics::append(
        &runtime.root,
        "manual_handoff_ready",
        &format!("identity={}", serde_json::to_string(&runtime.identity)?),
    );
    Ok(())
}

async fn prepare(app: &tauri::AppHandle) -> Result<tokio::sync::RwLockWriteGuard<'static, ()>> {
    if PENDING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        bail!("handoff already in progress");
    }
    let mut drain_started = false;
    let result = async {
        if crate::db_recovery_notifications::recovery_active() {
            bail!("database recovery is still active");
        }
        if crate::search_only::is_entering() {
            bail!("Quit is still stopping capture; reopen this copy once Quit completes");
        }
        let guard = crate::update_restart::RESTART_SAFETY
            .prepare_restart(WAIT)
            .await
            .context("native startup did not finish")?;
        crate::store::persist_store_before_restart(app).map_err(anyhow::Error::msg)?;
        // A manual launch must not inherit the automatic updater's hidden restart marker.
        crate::search_only::prepare_manual_handoff().map_err(anyhow::Error::msg)?;
        // Opening a verified replacement is the user's restart request. Drain
        // the current recorder through its normal shutdown before releasing
        // the database, whether the UI is open or Quit left search running.
        CAPTURE_BEFORE_HANDOFF.store(
            app.state::<crate::recording::RecordingState>()
                .capture_intended(),
            Ordering::SeqCst,
        );
        drain_started = true;
        let stopping_app = app.clone();
        // A timeout must not cancel a recorder halfway through flushing its
        // durable writer. Recovery joins this task via the lifecycle lock.
        let stop = tauri::async_runtime::spawn(async move {
            crate::recording::stop_screenpipe(
                stopping_app.state::<crate::recording::RecordingState>(),
                stopping_app.clone(),
            )
            .await
        });
        let drain_started_at = std::time::Instant::now();
        // The five-second forced-exit budget is too short for an active
        // recorder (capture + durable database close took 6.5s in acceptance).
        // Use the existing handoff deadline instead. Exceeding it cancels
        // this replacement, but the owned stop task still finishes and the
        // previous owner recovers without abandoning pending writes.
        match wait_for_drain(stop, WAIT).await {
            crate::recording::TeardownOutcome::Completed => {}
            crate::recording::TeardownOutcome::Failed(error) => {
                bail!("recording and search shutdown failed: {error}");
            }
            crate::recording::TeardownOutcome::TimedOut => bail!(
                "recording and search shutdown still pending; elapsed_ms={}; timeout_ms={}; remaining_work=finish_shutdown_and_restore_previous_owner; replacement_cancelled=true",
                drain_started_at.elapsed().as_millis(),
                WAIT.as_millis(),
            ),
        }
        tokio::time::timeout(
            crate::recording::PRE_EXIT_TEARDOWN_TIMEOUT,
            crate::process_exit::run_pre_exit_teardown(app),
        )
        .await
        .context("remaining app shutdown timed out")?;
        Ok(guard)
    }
    .await;
    if result.is_err() {
        if drain_started {
            recover(app);
        } else {
            PENDING.store(false, Ordering::SeqCst);
        }
    }
    result
}

async fn wait_for_drain(
    stop: tauri::async_runtime::JoinHandle<Result<(), String>>,
    timeout: Duration,
) -> crate::recording::TeardownOutcome {
    crate::recording::bounded_teardown(timeout, async {
        stop.await.map_err(|error| error.to_string())?
    })
    .await
}

fn recover(app: &tauri::AppHandle) {
    app.state::<crate::recording::RecordingState>()
        .set_capture_intent(CAPTURE_BEFORE_HANDOFF.load(Ordering::SeqCst));
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<crate::recording::RecordingState>();
        let _lifecycle = state.server_lifecycle.lock().await;
        crate::update_diagnostics::record(
            "manual_handoff_recovery_started",
            "outcome=restoring_previous_owner",
        );
        let result = crate::recording::spawn_screenpipe_inner(&state, app.clone()).await;
        PENDING.store(false, Ordering::SeqCst);
        match result {
            Ok(()) => crate::update_diagnostics::record(
                "manual_handoff_recovery_startup_completed",
                &format!("capture_intended={}", state.capture_intended()),
            ),
            Err(error) => {
                if let Some(runtime) = RUNTIME.get() {
                    report_failure(&runtime.root, "restore_previous_owner", &error);
                }
            }
        }
    });
}

pub(crate) fn reopen(app: &tauri::AppHandle, trigger: &'static str) -> bool {
    if pending() {
        return true;
    }
    let Some(runtime) = RUNTIME.get() else {
        return false;
    };
    if file_stamp(&runtime.identity.executable).ok() == Some(runtime.executable_stamp) {
        return false;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = async {
            let _lock = acquire(&runtime.lock).await?;
            let candidate = tokio::task::spawn_blocking(move || {
                signing::on_disk(
                    &runtime.identity.executable,
                    &runtime.requirement,
                    &runtime.identity,
                )
            })
            .await??;
            crate::update_diagnostics::append(
                &runtime.root,
                "manual_handoff_reopen_candidate",
                &format!(
                    "trigger={trigger}; source={:?}; target={:?}",
                    runtime.identity, candidate
                ),
            );
            match select(&runtime.identity, &candidate) {
                Selection::Focus => {
                    let foreground = app.clone();
                    app.run_on_main_thread(move || crate::manual_reopen(&foreground))?;
                    return Ok(());
                }
                Selection::Reject => bail!("the changed bundle is not a valid replacement"),
                Selection::Replace => {}
            }
            let guard = prepare(&app).await?;
            // Launch only after the old PID exits, with no shell interpolation of paths.
            let mut command = crate::process_exit::macos_updater_relaunch_command(
                &candidate.executable,
                std::iter::empty::<&str>(),
                std::process::id(),
                crate::process_exit::MACOS_UPDATER_RELAUNCH_SETTLE,
            );
            use std::os::unix::process::CommandExt;
            command
                .process_group(0)
                .env("SCREENPIPE_DATA_DIR", &runtime.root)
                .env(EXPECTED_BUILD_ENV, &candidate.hash);
            if let Err(error) = command.spawn() {
                recover(&app);
                return Err(
                    anyhow::Error::new(error).context("could not launch replacement helper")
                );
            }
            std::mem::forget(guard);
            crate::process_exit::force_process_exit(0);
            #[allow(unreachable_code)]
            Ok::<(), anyhow::Error>(())
        }
        .await;
        if let Err(error) = result {
            report_failure(&runtime.root, trigger, &format!("{error:#}"));
            show_error(&format!(
                "Screenpipe couldn't switch to the replacement. {error:#}"
            ));
        }
    });
    true
}

fn file_stamp(path: &Path) -> Result<(u64, u64, i64, i64, u64)> {
    let m = std::fs::metadata(path)?;
    Ok((m.dev(), m.ino(), m.mtime(), m.mtime_nsec(), m.len()))
}

fn show_error(message: &str) {
    let _ = std::process::Command::new("/usr/bin/osascript")
        .args(["-e", "on run argv\ndisplay alert \"Screenpipe couldn't switch versions\" message (item 1 of argv)\nend run", "--", message]).spawn();
}

async fn takeover(runtime: &Runtime) -> Result<()> {
    let name = runtime
        .identity
        .executable
        .file_name()
        .context("missing executable name")?;
    for pid in signing::candidates(name)? {
        if let Err(error) = signing::verify_process(pid, &runtime.requirement) {
            if signing::claimed_identifier(pid).as_deref() == Some(&runtime.identity.identifier)
                || signing::process_path(pid).ok().as_ref() == Some(&runtime.identity.executable)
            {
                bail!("cannot authenticate the existing Screenpipe process {pid}: {error:#}");
            }
            continue;
        }
        let old = signing::running(pid, &runtime.requirement)?;
        if old.identifier != runtime.identity.identifier {
            continue;
        }
        record_selection(runtime, &old, &runtime.identity);
        if !manual_launch() {
            focus_existing(&old).await?;
            std::process::exit(0);
        }
        match select(&old, &runtime.identity) {
            Selection::Focus if owns_listener(pid, focus_port()).await? => {
                focus_existing(&old).await?;
                std::process::exit(0);
            }
            Selection::Reject => bail!("the opened copy is older than the running build"),
            Selection::Focus | Selection::Replace => verify_selected_bundle(runtime)?,
        }
        // Opening another copy explicitly selects it. Do not require the old
        // app's socket, API key, or recording state to cooperate with replacement.
        retire_previous(&runtime.root, &old).await?;
    }
    Ok(())
}

async fn verify_listener(pid: i32, port: u16) -> Result<()> {
    if !owns_listener(pid, port).await? {
        bail!("process {pid} is not listening on port {port}");
    }
    Ok(())
}

async fn retire_previous(root: &Path, old: &Identity) -> Result<()> {
    crate::update_diagnostics::append(
        root,
        "manual_handoff_terminate",
        &format!(
            "pid={}; cause=opened_copy_selected; action=terminate_verified_process",
            old.pid
        ),
    );
    terminate_previous(old).await?;
    crate::update_diagnostics::append(
        root,
        "manual_handoff_previous_exited",
        "outcome=selected_copy_starting; cause=opened_copy_selected",
    );
    Ok(())
}

// Call only after verifying the process and the selected bundle. Recheck the
// process generation immediately before signalling; never terminate by name/port.
async fn terminate_previous(old: &Identity) -> Result<()> {
    if !signing::is_same_process(old) {
        bail!(
            "previous process changed before termination; pid={}",
            old.pid
        );
    }
    if unsafe { libc::kill(old.pid, libc::SIGTERM) } != 0 {
        return Err(std::io::Error::last_os_error())
            .with_context(|| format!("previous process termination failed; pid={}", old.pid));
    }
    wait_for_exit(old).await
}

async fn owns_listener(pid: i32, port: u16) -> Result<bool> {
    let output = tokio::time::timeout(
        Duration::from_secs(3),
        tokio::process::Command::new("/usr/sbin/lsof")
            .kill_on_drop(true)
            .args([
                "-nP",
                "-a",
                "-p",
                &pid.to_string(),
                &format!("-iTCP:{port}"),
                "-sTCP:LISTEN",
                "-t",
            ])
            .output(),
    )
    .await
    .with_context(|| format!("listener inspection timed out; pid={pid}; port={port}"))?
    .with_context(|| format!("could not inspect listener; pid={pid}; port={port}"))?;
    // lsof uses exit 1 with empty output for no matching descriptors. Other
    // failures must retain their cause rather than masquerading as a stale app.
    if output.status.code() == Some(1) && output.stdout.is_empty() && output.stderr.is_empty() {
        return Ok(false);
    }
    if !output.status.success() {
        bail!(
            "listener inspection failed; pid={pid}; port={port}; status={}; cause={}",
            output.status,
            String::from_utf8_lossy(&output.stderr),
        );
    }
    let expected = pid.to_string();
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(!stdout.trim().is_empty() && stdout.lines().all(|line| line.trim() == expected))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_process_identity(pid: i32) -> Identity {
        let (uid, started) = signing::process_stamp(pid).unwrap();
        Identity {
            pid,
            uid,
            started,
            hash: signing::process_hash(pid).unwrap(),
            executable: signing::process_path(pid).unwrap(),
            identifier: "test".into(),
            version: "1.0.0".into(),
        }
    }

    #[tokio::test]
    async fn replacement_retires_only_the_selected_process_without_ipc() {
        let root = tempfile::tempdir().unwrap();
        // This process owns the port; the stale process must not send it an
        // API key or terminate it merely because it has the configured port.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let owner = test_process_identity(std::process::id() as i32);
        let ready = root.path().join("ready");
        let mut child = tokio::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "manual_handoff::macos::tests::replacement_process_fixture",
            ])
            .env("SCREENPIPE_HANDOFF_TEST_READY", &ready)
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        tokio::time::timeout(WAIT, async {
            while !ready.exists() {
                assert!(
                    child.try_wait().unwrap().is_none(),
                    "fixture exited before ready"
                );
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        let active_port: u16 = std::fs::read_to_string(&ready).unwrap().parse().unwrap();
        let old = test_process_identity(child.id().unwrap() as i32);
        assert!(owns_listener(old.pid, active_port).await.unwrap());
        let exited = tokio::spawn(async move { child.wait().await.unwrap() });
        retire_previous(root.path(), &old).await.unwrap();
        use std::os::unix::process::ExitStatusExt;
        assert_eq!(exited.await.unwrap().signal(), Some(libc::SIGTERM));
        // The selected process's live listener is released; the new copy can
        // own it even though the previous process never answered IPC or HTTP.
        let _replacement_listener = tokio::net::TcpListener::bind(("127.0.0.1", active_port))
            .await
            .unwrap();
        assert!(owns_listener(owner.pid, port).await.unwrap());
        assert!(signing::is_same_process(&owner));

        // Recovery evidence uses the real collector after app-log rotation.
        for day in 1..=7 {
            std::fs::write(
                root.path()
                    .join(format!("screenpipe-app.2026-10-{day:02}.log")),
                "restart\n",
            )
            .unwrap();
        }
        let report = crate::diagnostic_logs::collect_redacted_from_dirs(&[root.path().into()])
            .await
            .unwrap();
        assert!(report.contains("opened_copy_selected"));
        assert!(report.contains(&format!("pid={}", old.pid)));
        assert!(report.contains("outcome=selected_copy_starting"));

        drop(listener);
        assert!(!owns_listener(owner.pid, port).await.unwrap());
    }

    #[test]
    fn replacement_process_fixture() {
        let Some(ready) = std::env::var_os("SCREENPIPE_HANDOFF_TEST_READY") else {
            return;
        };
        let _listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let ready = PathBuf::from(ready);
        let staged = ready.with_extension("pending");
        std::fs::write(&staged, _listener.local_addr().unwrap().port().to_string()).unwrap();
        std::fs::rename(staged, ready).unwrap();
        loop {
            std::thread::park();
        }
    }

    #[tokio::test]
    async fn stale_identity_never_terminates_the_reused_pid_and_failure_reaches_support() {
        let root = tempfile::tempdir().unwrap();
        let mut old = test_process_identity(std::process::id() as i32);
        old.started -= 1;
        let error = retire_previous(root.path(), &old).await.unwrap_err();
        report_failure(root.path(), "launch", &format!("{error:#}"));
        for day in 1..=7 {
            std::fs::write(
                root.path()
                    .join(format!("screenpipe-app.2026-10-{day:02}.log")),
                "restart\n",
            )
            .unwrap();
        }
        let report = crate::diagnostic_logs::collect_redacted_from_dirs(&[root.path().into()])
            .await
            .unwrap();
        assert!(report.contains("previous process changed before termination"));
        assert!(report.contains("outcome=selected_copy_not_started"));
        assert!(!report.contains("manual_handoff_previous_exited"));
    }

    #[tokio::test]
    async fn completed_drain_and_originating_failure_reach_handoff() {
        use crate::recording::TeardownOutcome;
        let stop = tauri::async_runtime::spawn(async { Ok(()) });
        assert_eq!(wait_for_drain(stop, WAIT).await, TeardownOutcome::Completed);
        let stop = tauri::async_runtime::spawn(async { Err("writer flush failed".into()) });
        assert_eq!(
            wait_for_drain(stop, WAIT).await,
            TeardownOutcome::Failed("writer flush failed".into())
        );
    }

    #[tokio::test]
    async fn drain_deadline_retains_flush_and_excludes_recovery_until_it_finishes() {
        use crate::recording::TeardownOutcome;
        use std::sync::Arc;
        let lifecycle = Arc::new(tokio::sync::Mutex::new(()));
        let guard = lifecycle.clone().lock_owned().await;
        let (finish, pending_write) = tokio::sync::oneshot::channel();
        let flushed = Arc::new(AtomicBool::new(false));
        let task_flushed = flushed.clone();
        let stop = tauri::async_runtime::spawn(async move {
            let _guard = guard;
            pending_write.await.map_err(|error| error.to_string())?;
            task_flushed.store(true, Ordering::SeqCst);
            Ok(())
        });
        // At the deadline, unfinished work remains owned by the stop task.
        assert_eq!(
            wait_for_drain(stop, Duration::ZERO).await,
            TeardownOutcome::TimedOut
        );
        assert!(lifecycle.try_lock().is_err());
        assert!(!flushed.load(Ordering::SeqCst));
        // Completion after the deadline still flushes before recovery can
        // acquire the same lifecycle lock and reopen the database.
        finish.send(()).unwrap();
        let _recovery = lifecycle.lock().await;
        assert!(flushed.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn concurrent_launches_cannot_hold_the_same_lease() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("launch");
        let first = acquire(&path).await.unwrap();
        let second = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .unwrap();
        assert_eq!(
            second.try_lock_exclusive().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
        drop(first);
        drop(second);
        // Other tests spawn processes. A fork can briefly inherit the locked
        // descriptor until exec closes it; the production lease retries this.
        let _next = acquire(&path).await.unwrap();
    }

    #[tokio::test]
    async fn live_owner_timeout_never_counts_as_exit() {
        let pid = std::process::id() as i32;
        let (uid, started) = signing::process_stamp(pid).unwrap();
        let mut old = Identity {
            pid,
            uid,
            started,
            identifier: "test".into(),
            version: "1.0.0".into(),
            hash: "unused".into(),
            executable: "test".into(),
        };
        assert!(wait_until_exit(&old, Duration::from_millis(5))
            .await
            .is_err());
        old.started -= 1;
        // PID reuse is not the old process surviving.
        wait_until_exit(&old, Duration::from_millis(5))
            .await
            .unwrap();
    }

    #[test]
    fn same_path_replacement_changes_file_stamp() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app");
        std::fs::write(&path, "old").unwrap();
        let before = file_stamp(&path).unwrap();
        let replacement = dir.path().join("new");
        std::fs::write(&replacement, "new").unwrap();
        std::fs::rename(&replacement, &path).unwrap();
        assert_ne!(before, file_stamp(&path).unwrap());
    }
}
