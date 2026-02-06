# screenpipe regression testing checklist

> **purpose**: prevent regressions. every PR touching window management, activation policy, tray, dock, monitors, or audio MUST be tested against the relevant sections below before merge.

## critical edge cases (sorted by regression frequency)

### 1. window overlay & fullscreen spaces (macOS)

these break CONSTANTLY. any change to `window_api.rs`, `main.rs` shortcuts, activation policy, or NSPanel code must test ALL of these:

- [ ] **overlay shortcut on fullscreen space** — press shortcut while a fullscreen app (e.g., Chrome fullscreen) is active. overlay MUST appear on top.
- [ ] **chat shortcut on fullscreen space** — press chat shortcut (Cmd+Shift+L or custom) while on a fullscreen space. chat panel MUST appear on top.
- [ ] **chat shortcut on normal desktop** — chat appears, receives keyboard focus, can type immediately.
- [ ] **overlay toggle on/off** — press shortcut twice. first shows, second hides. no "ghost" window left behind.
- [ ] **chat toggle on/off** — press chat shortcut twice. first shows, second closes.
- [ ] **overlay does NOT follow space swipe** — show overlay, then three-finger swipe to another space. overlay should NOT follow you (no blink-and-disappear).
- [ ] **overlay on second monitor** — with 2 monitors, show overlay. it appears on the monitor where the mouse cursor is.
- [ ] **window mode vs fullscreen mode** — switch overlay mode in settings. shortcut still works in both modes. no crash.
- [ ] **switch modes while overlay is visible** — change from fullscreen to window mode in settings while overlay is showing. should not crash.
- [ ] **keyboard focus in overlay** — show overlay, start typing. text input works immediately without clicking.
- [ ] **keyboard focus in chat** — show chat, start typing. text input works immediately.
- [ ] **escape closes overlay** — press Escape while overlay is visible. it hides.
- [ ] **no space jump on show** — showing the overlay should NOT cause a space transition animation.
- [ ] **no space jump on hide** — hiding the overlay should NOT switch you to a different space.
- [ ] **screen recording visibility setting** — toggle "show in screen recording" in settings. overlay should appear/disappear from screen recordings accordingly.

### 2. dock icon & tray icon (macOS)

- [ ] **dock icon visible on launch** — app icon appears in dock immediately on startup.
- [ ] **tray icon visible on launch** — tray icon appears in menu bar on startup.
- [ ] **dock icon persists after overlay show/hide** — show and hide overlay 5 times. dock icon must remain visible every time.
- [ ] **tray icon persists after overlay show/hide** — same test. tray icon must remain visible.
- [ ] **dock right-click menu works** — right-click dock icon. "Show screenpipe", "Settings", "Check for updates" all work.
- [ ] **tray health indicator** — tray icon shows green (healthy) or yellow/red (issues) based on recording status.
- [ ] **tray on notched MacBook** — on 14"/16" MacBook Pro, tray icon is visible (not hidden behind notch). if hidden, user can Cmd+drag to reposition.
- [ ] **activation policy never changes** — after ANY user interaction (show overlay, hide overlay, show chat, close chat, open settings), `ps aux | grep screenpipe` should show the process and dock icon should be visible. no Accessory mode switches.

### 3. monitor plug/unplug

- [ ] **unplug external monitor while recording** — recording continues on remaining monitor(s). no crash. log shows "Monitor X disconnected".
- [ ] **plug in external monitor while recording** — new monitor is detected within 5 seconds. recording starts on it. log shows "Monitor X reconnected".
- [ ] **unplug and replug same monitor** — recording resumes. same monitor ID reused. no duplicate recording tasks.
- [ ] **unplug all external monitors (laptop only)** — built-in display continues recording. no crash.
- [ ] **plug monitor with different resolution** — recording starts at correct resolution. OCR works on new monitor.
- [ ] **"use all monitors" setting** — with this ON, all monitors auto-detected. no manual configuration needed.
- [ ] **specific monitor IDs setting** — with specific IDs configured, only those monitors are recorded. unplugging a non-configured monitor has no effect.
- [ ] **resolution change (e.g., clamshell mode)** — closing MacBook lid with external monitor. recording continues on external.
- [ ] **queue stats after unplug** — check logs. no queue stats for disconnected monitor after disconnect.

### 4. audio device handling

- [ ] **default audio device** — with "follow system default", recording uses whatever macOS says is default.
- [ ] **plug in USB headset** — if set to follow defaults and macOS switches to headset, recording follows.
- [ ] **unplug USB headset** — recording falls back to built-in mic/speakers. no crash. no 30s timeout errors.
- [ ] **bluetooth device connect/disconnect** — AirPods connect mid-recording. audio continues without gap.
- [ ] **no audio device available** — unplug all audio. app continues (vision still works). log shows warning, not crash.
- [ ] **audio stream timeout recovery** — if audio stream times out (30s no data), it should reconnect automatically.
- [ ] **multiple audio devices simultaneously** — input (mic) + output (speakers) both recording. both show in device list.
- [ ] **disable audio setting** — toggling "disable audio" stops all audio recording. re-enabling restarts it.

### 5. frame comparison & OCR pipeline

- [ ] **static screen = low CPU** — leave a static image on screen for 60s. CPU should drop below 5% (release build). hash early exit should kick in.
- [ ] **active screen = OCR runs** — actively browse/type. OCR results appear in search within 5 seconds of screen change.
- [ ] **identical frames skipped** — check logs for hash match frequency on idle monitors. should be >80% skip rate.
- [ ] **ultrawide monitor (3440x1440+)** — OCR works correctly. no distortion in change detection. text at edges is captured.
- [ ] **4K monitor** — OCR works. frame comparison doesn't timeout or spike CPU.
- [ ] **high refresh rate (120Hz+)** — app respects its own FPS setting (0.5 default), not the display refresh rate.
- [ ] **very fast content changes** — scroll quickly through a document. OCR captures content, no crashes from buffer overflows.

### 6. permissions (macOS)

- [ ] **fresh install — all prompts appear** — screen recording, microphone, accessibility prompts all show on first launch.
- [ ] **denied permission → opens System Settings** — if user previously denied mic permission, clicking "grant" opens System Settings > Privacy directly.
- [ ] **permission revoked while running** — go to System Settings, revoke screen recording. app shows red permission banner within 10 seconds.
- [ ] **permission banner is visible** — solid red banner at top of main window when any permission missing. not subtle.
- [ ] **permission recovery page** — navigating to /permission-recovery shows clear instructions.

### 7. app lifecycle

- [ ] **clean quit via tray** — right-click tray → Quit. all processes terminate. no orphaned ffmpeg/bun processes.
- [ ] **clean quit via dock** — right-click dock → Quit. same as above.
- [ ] **clean quit via Cmd+Q** — same verification.
- [ ] **force quit recovery** — force quit app. relaunch. database is intact. recording resumes.
- [ ] **sleep/wake** — close laptop lid, wait 10s, open. recording resumes within 5s. no crash.
- [ ] **restart app** — quit and relaunch. all settings preserved. recording starts automatically.
- [ ] **auto-update** — when update available, UpdateBanner shows in main window. clicking it downloads and installs.
- [ ] **update without tray** — if tray is hidden (behind notch), user can still update via dock menu or Apple menu "Check for Updates...".

### 8. database & storage

- [ ] **slow DB insert warning** — check logs. "Slow DB batch insert" warnings should be <1s in normal operation. >3s indicates contention.
- [ ] **concurrent DB access** — UI queries + recording inserts happening simultaneously. no "database is locked" errors.
- [ ] **low disk space** — with <1GB free, app should warn user. no crash from failed writes.
- [ ] **large database (>10GB)** — search still returns results within 2 seconds. app doesn't freeze on startup.

### 9. AI integration

- [ ] **Apple Intelligence (macOS 26+)** — /ai/chat/completions endpoint works with on-device model. JSON mode returns valid JSON.
- [ ] **Apple Intelligence on macOS < 26** — app does NOT crash on launch. feature is gracefully disabled.
- [ ] **Ollama not running** — creating an Ollama preset shows input fields (not stuck loading). user can type model name manually.
- [ ] **daily summary** — generates valid JSON. no "JSON Parse error: Unexpected identifier 'Here'" errors.
- [ ] **streaming responses** — SSE streaming from /ai/chat/completions works. tokens arrive incrementally.

### 10. settings persistence

- [ ] **settings survive restart** — change any setting, quit, relaunch. setting is preserved.
- [ ] **settings store race condition** — rapidly toggle settings while recording is active. no crash (was a Sentry top crash).
- [ ] **overlay mode switch** — change from fullscreen to window mode. setting saves. next shortcut press uses new mode.
- [ ] **FPS setting** — change capture FPS. recording interval changes accordingly.
- [ ] **language/OCR engine setting** — change OCR language. new language used on next capture cycle.

## platform-specific edge cases

### macOS
- [ ] notched MacBook Pro (14"/16") — tray not behind notch
- [ ] non-notched MacBook (Air/13") — tray works normally
- [ ] Apple Silicon (M1/M2/M3/M4) — all features work
- [ ] Intel Mac — all features work (Apple Intelligence disabled)
- [ ] macOS 15 (Sequoia) — permissions flow works
- [ ] macOS 26 (Tahoe) — Apple Intelligence works
- [ ] external display only (clamshell) — recording works

### Windows
- [ ] Windows 11 — all features work
- [ ] high-DPI display (150%, 200%) — OCR captures at correct resolution
- [ ] multiple monitors — all detected and recorded
- [ ] COM thread conflict — no crashes from audio/vision thread conflicts

### Linux
- [ ] Wayland — screen capture works
- [ ] X11 — screen capture works
- [ ] PipeWire audio — audio capture works
- [ ] PulseAudio — audio capture works

## how to run

### before every release
1. run through sections 1-4 completely (these are where 90% of regressions happen)
2. spot-check sections 5-10

### before merging window/tray/dock changes
run section 1 and 2 completely. these are the most fragile.

### before merging vision/OCR changes
run section 3 and 5 completely.

### before merging audio changes
run section 4 completely.

## known limitations (not bugs)

- tray icon on notched MacBooks can end up behind the notch if menu bar is crowded. Cmd+drag to reposition. dock menu is the fallback.
- macOS only shows permission prompts once (NotDetermined → Denied is permanent). must use System Settings to re-grant.
- debug builds use ~3-5x more CPU than release builds for vision pipeline.
- first frame after app launch always triggers OCR (intentional — no previous frame to compare against).

## log locations

```
macOS:   ~/.screenpipe/screenpipe-app.YYYY-MM-DD.log
Windows: %USERPROFILE%\.screenpipe\screenpipe-app.YYYY-MM-DD.log
Linux:   ~/.screenpipe/screenpipe-app.YYYY-MM-DD.log
```

### what to grep for

```bash
# crashes/errors
grep -E "panic|SIGABRT|ERROR|error" ~/.screenpipe/screenpipe-app.*.log

# monitor events
grep -E "Monitor.*disconnect|Monitor.*reconnect|Starting vision" ~/.screenpipe/screenpipe-app.*.log

# frame skip rate (debug level only)
grep "Hash match" ~/.screenpipe/screenpipe-app.*.log

# queue health
grep "Queue stats" ~/.screenpipe/screenpipe-app.*.log

# DB contention
grep "Slow DB" ~/.screenpipe/screenpipe-app.*.log

# audio issues
grep -E "audio.*timeout|audio.*error|device.*disconnect" ~/.screenpipe/screenpipe-app.*.log
```
