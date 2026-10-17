// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
//! Opt-in native acceptance in a disposable macOS guest. No mocked topology.
#[cfg(target_os = "macos")]
mod native {
    use screenpipe_engine::focus_aware_controller::FocusAwareController;
    use screenpipe_engine::focus_tracker::{new_tracker, FocusTracker};
    use screenpipe_screen::monitor::{list_monitors, SafeMonitor};
    use serde_json::Value;
    use std::io::{BufRead, BufReader, Write};
    use std::process::{Child, ChildStdin, Command, Stdio};
    use std::sync::{mpsc, Arc};
    use std::time::{Duration, Instant};
    struct Fixture {
        child: Child,
        input: ChildStdin,
        output: mpsc::Receiver<String>,
        reader: Option<std::thread::JoinHandle<()>>,
    }
    impl Fixture {
        fn start() -> (Self, Value) {
            assert_eq!(
                std::env::var("SCREENPIPE_ISOLATED_VM_TEST").as_deref(),
                Ok("1")
            );
            let mut child = Command::new(std::env::var("SCREENPIPE_DISPLAY_FIXTURE").unwrap())
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .spawn()
                .unwrap();
            let input = child.stdin.take().unwrap();
            let stdout = child.stdout.take().unwrap();
            let (sender, output) = mpsc::channel();
            let reader = std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines() {
                    match line {
                        Ok(line) => {
                            if sender.send(line).is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
            });
            let mut fixture = Self {
                child,
                input,
                output,
                reader: Some(reader),
            };
            let initial = fixture.read();
            (fixture, initial)
        }
        fn read(&mut self) -> Value {
            let line = self
                .output
                .recv_timeout(Duration::from_secs(15))
                .expect("native display fixture failed to answer within 15 seconds");
            let v = serde_json::from_str(&line).unwrap();
            eprintln!("native topology: {line}");
            v
        }
        fn command(&mut self, command: &str) -> Value {
            writeln!(self.input, "{command}").unwrap();
            self.input.flush().unwrap();
            self.read()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = writeln!(self.input, "quit");
            let _ = self.input.flush();
            let _ = self.child.kill();
            let _ = self.child.wait();
            if let Some(reader) = self.reader.take() {
                let _ = reader.join();
            }
        }
    }
    async fn wait_mapping(
        controller: &FocusAwareController,
        monitors: &[SafeMonitor],
        expected: Option<u32>,
    ) {
        let deadline = Instant::now() + Duration::from_secs(12);
        loop {
            let focused: Vec<_> = monitors
                .iter()
                .filter(|m| controller.hosts_focus_for_monitor(m))
                .map(|m| m.id())
                .collect();
            if focused == expected.into_iter().collect::<Vec<_>>() {
                return;
            }
            assert!(
                Instant::now() < deadline,
                "controller mapping expected {expected:?}, got {focused:?}"
            );
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }
    fn verify_capture_marker(image: &image::DynamicImage, native: &Value) {
        // The helper paints a 200-point square at (+20,+20) on each display.
        // Sample its center in backing pixels, away from the cursor at (+100,+100).
        let x = (120. * image.width() as f64 / native["w"].as_f64().unwrap()) as u32;
        let y = (120. * image.height() as f64 / native["h"].as_f64().unwrap()) as u32;
        assert!(x < image.width() && y < image.height());
        let rgb = image.to_rgb8();
        let [red, green, blue] = rgb.get_pixel(x, y).0;
        let primary = native["main"].as_i64() == Some(1);
        let (dominant, other) = if primary { (red, blue) } else { (blue, red) };
        assert!(
        dominant > 150
            && dominant.saturating_sub(other) > 80
            && dominant.saturating_sub(green) > 80,
        "wrong display content: id={} primary={primary} pixel=({red},{green},{blue}) at ({x},{y})",
        native["id"]
    );
    }
    async fn wait_focus(tracker: &Arc<dyn FocusTracker>, expected: Option<u32>) {
        let deadline = Instant::now() + Duration::from_secs(12);
        loop {
            if tracker.current().map(|m| m.id) == expected {
                return;
            }
            assert!(
                Instant::now() < deadline,
                "focus expected {expected:?}, got {:?}",
                tracker.current()
            );
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }
    async fn verify_displays(native: &Value) -> Vec<SafeMonitor> {
        let monitors = list_monitors().await;
        let displays = native["displays"].as_array().unwrap();
        assert_eq!(
            monitors.len(),
            displays.len(),
            "capture backend must see actual CG displays"
        );
        for d in displays {
            let m = monitors
                .iter()
                .find(|m| m.id() as u64 == d["id"].as_u64().unwrap())
                .expect("missing native display");
            eprintln!(
                "capture topology id={} origin=({}, {}) dimensions={}x{} sck={}",
                m.id(),
                m.x(),
                m.y(),
                m.width(),
                m.height(),
                m.uses_sck_backend()
            );
            assert!(
                m.uses_sck_backend(),
                "native acceptance must not silently use the legacy fallback"
            );
            assert_eq!(m.x() as i64, d["x"].as_i64().unwrap());
            assert_eq!(m.y() as i64, d["y"].as_i64().unwrap());
            assert_eq!(
                m.width() as i64,
                d["w"].as_i64().unwrap(),
                "focus bounds must use display points"
            );
            assert_eq!(
                m.height() as i64,
                d["h"].as_i64().unwrap(),
                "focus bounds must use display points"
            );
        }
        monitors
    }
    async fn native_multi_monitor_focus_capture_gap_and_hotplug() {
        let (mut fixture, initial) = Fixture::start();
        assert_eq!(
            initial["displays"].as_array().unwrap().len(),
            2,
            "requires one base and one virtual display"
        );
        let primary = initial["displays"]
            .as_array()
            .unwrap()
            .iter()
            .find(|d| d["main"].as_i64() == Some(1))
            .unwrap()
            .clone();
        let primary_id = primary["id"].as_u64().unwrap() as u32;
        let width = primary["w"].as_i64().unwrap();
        verify_displays(&initial).await;
        let tracker = new_tracker();
        let controller = FocusAwareController::new(tracker.clone());
        for (label, x, y) in [
            ("right", width, 0),
            ("left", -1280, 0),
            ("above", 0, -720),
            ("offset", width, 400),
        ] {
            eprintln!("CASE {label}");
            let native = fixture.command(&format!("layout {x} {y}"));
            let requested = native["displays"]
                .as_array()
                .unwrap()
                .iter()
                .find(|d| d["id"] == native["extra"])
                .unwrap();
            assert_eq!(
                requested["x"].as_i64(),
                Some(x),
                "requested layout was not applied"
            );
            assert_eq!(
                requested["y"].as_i64(),
                Some(y),
                "requested layout was not applied"
            );
            assert_eq!(
                requested["mirror"].as_u64(),
                Some(0),
                "extended displays required"
            );
            let monitors = verify_displays(&native).await;
            for d in native["displays"].as_array().unwrap() {
                let px = d["x"].as_f64().unwrap() + 100.;
                let py = d["y"].as_f64().unwrap() + 100.;
                let actual = fixture.command(&format!("warp {px} {py}"));
                assert_eq!(actual["cursor_x"].as_f64().unwrap(), px);
                assert_eq!(actual["cursor_y"].as_f64().unwrap(), py);
                let id = d["id"].as_u64().unwrap() as u32;
                wait_focus(&tracker, Some(id)).await;
                wait_mapping(&controller, &monitors, Some(id)).await;
                assert!(!controller.resolution_degraded());
                for m in &monitors {
                    assert_eq!(controller.hosts_focus_for_monitor(m), m.id() == id);
                }
                let m = monitors.iter().find(|m| m.id() == id).unwrap();
                let frame = tokio::time::timeout(Duration::from_secs(20), m.capture_image())
                    .await
                    .unwrap()
                    .unwrap();
                assert!(frame.width() > 0 && frame.height() > 0);
                verify_capture_marker(&frame, d);
                if let Ok(dir) = std::env::var("SCREENPIPE_VM_EVIDENCE_DIR") {
                    std::fs::create_dir_all(&dir).unwrap();
                    frame.save(format!("{dir}/{label}-{id}.png")).unwrap();
                }
                eprintln!(
                    "CAPTURE {label} display={id} actual={}x{}",
                    frame.width(),
                    frame.height()
                );
            }
        }
        // An offset layout leaves a real rectangle outside every display. Confirm
        // where the OS cursor actually lands, rather than injecting tracker state.
        let gap = fixture.command(&format!("warp {} 200", width + 50));
        let gap_monitors = verify_displays(&gap).await;
        let actual_x = gap["cursor_x"].as_f64().unwrap();
        let actual_y = gap["cursor_y"].as_f64().unwrap();
        let literal_gap_supported = actual_x == (width + 50) as f64 && actual_y == 200.;
        eprintln!(
            "LITERAL_GAP requested=({},200) actual=({actual_x},{actual_y}) clamped={}",
            width + 50,
            !literal_gap_supported
        );
        if literal_gap_supported {
            wait_focus(&tracker, None).await;
            wait_mapping(&controller, &gap_monitors, None).await;
            assert!(!controller.resolution_degraded());
            tokio::time::sleep(Duration::from_secs(31)).await;
            assert!(controller.resolution_degraded());
            assert!(gap_monitors
                .iter()
                .all(|m| !controller.hosts_focus_for_monitor(m)));
            eprintln!("LITERAL_GAP: native off-display cursor held; grace degraded as expected");
        } else {
            let landing = gap["displays"]
                .as_array()
                .unwrap()
                .iter()
                .find(|d| {
                    let x = d["x"].as_f64().unwrap();
                    let y = d["y"].as_f64().unwrap();
                    actual_x >= x
                        && actual_x < x + d["w"].as_f64().unwrap()
                        && actual_y >= y
                        && actual_y < y + d["h"].as_f64().unwrap()
                })
                .expect("clamped cursor must land on an actual display");
            let landing_id = landing["id"].as_u64().unwrap() as u32;
            wait_focus(&tracker, Some(landing_id)).await;
            wait_mapping(&controller, &gap_monitors, Some(landing_id)).await;
            assert!(!controller.resolution_degraded());
            eprintln!("LITERAL_GAP UNSUPPORTED: macOS clamped the cursor onto a real display; no literal-gap reproduction or pass claimed");
        }
        fixture.command("warp 100 100");
        wait_focus(&tracker, Some(primary_id)).await;
        wait_mapping(&controller, &gap_monitors, Some(primary_id)).await;
        assert!(!controller.resolution_degraded());
        eprintln!("PRIMARY: cursor and attribution resolved on primary");
        // This intentionally omits the monitor watcher's fresh discovery while
        // rearranging real displays. It tests native resolution against stale
        // cached geometry, not a mocked tracker or the customer's literal gap.
        eprintln!("STALE_TOPOLOGY: withholding watcher discovery; native displays/cursor, not literal-gap/customer reproduction");
        let stale_native = fixture.command("layout -1280 0");
        let stale_extra_id = stale_native["extra"].as_u64().unwrap() as u32;
        let stale_extra = stale_native["displays"]
            .as_array()
            .unwrap()
            .iter()
            .find(|d| d["id"].as_u64() == Some(stale_extra_id as u64))
            .unwrap();
        assert_eq!(stale_extra["x"].as_i64(), Some(-1280));
        assert_eq!(stale_extra["y"].as_i64(), Some(0));
        assert_eq!(stale_extra["mirror"].as_u64(), Some(0));
        let stale_cursor = fixture.command("warp -1180 100");
        assert_eq!(stale_cursor["cursor_x"].as_f64(), Some(-1180.));
        assert_eq!(stale_cursor["cursor_y"].as_f64(), Some(100.));
        // Do not call list_monitors/verify_displays until after the grace check.
        wait_focus(&tracker, None).await;
        wait_mapping(&controller, &gap_monitors, None).await;
        assert!(!controller.resolution_degraded());
        tokio::time::sleep(Duration::from_secs(31)).await;
        assert!(
            controller.resolution_degraded(),
            "stale cached topology must degrade after grace"
        );
        assert!(gap_monitors
            .iter()
            .all(|m| !controller.hosts_focus_for_monitor(m)));
        let fresh_monitors = verify_displays(&stale_cursor).await;
        wait_focus(&tracker, Some(stale_extra_id)).await;
        wait_mapping(&controller, &fresh_monitors, Some(stale_extra_id)).await;
        assert!(!controller.resolution_degraded());
        let unchanged_cursor = fixture.command("report");
        assert_eq!(unchanged_cursor["cursor_x"].as_f64(), Some(-1180.));
        assert_eq!(unchanged_cursor["cursor_y"].as_f64(), Some(100.));
        eprintln!("STALE_TOPOLOGY PASS: native unresolved grace and attribution recovery after fresh discovery, without moving cursor");
        let restored = fixture.command(&format!("layout {width} 400"));
        let restored_extra = restored["displays"]
            .as_array()
            .unwrap()
            .iter()
            .find(|d| d["id"] == restored["extra"])
            .unwrap();
        assert_eq!(restored_extra["x"].as_i64(), Some(width));
        assert_eq!(restored_extra["y"].as_i64(), Some(400));
        let gap_monitors = verify_displays(&restored).await;
        // Remove the display that actually holds focus; removing an already-idle
        // display cannot expose stale focused identities after hot-unplug.
        let extra_before_remove = gap["extra"].as_u64().unwrap() as u32;
        fixture.command(&format!("warp {} 500", width + 100));
        wait_focus(&tracker, Some(extra_before_remove)).await;
        wait_mapping(&controller, &gap_monitors, Some(extra_before_remove)).await;
        let removed = fixture.command("remove");
        let remaining = verify_displays(&removed).await;
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id(), primary_id);
        // Explicitly return the pointer to the remaining display. The test makes
        // no promise that macOS automatically relocates a warped off-screen cursor.
        fixture.command("warp 100 100");
        wait_focus(&tracker, Some(primary_id)).await;
        wait_mapping(&controller, &remaining, Some(primary_id)).await;
        assert!(!controller.resolution_degraded());
        let recovered_frame =
            tokio::time::timeout(Duration::from_secs(20), remaining[0].capture_image())
                .await
                .unwrap()
                .unwrap();
        let remaining_native = &removed["displays"].as_array().unwrap()[0];
        verify_capture_marker(&recovered_frame, remaining_native);
        eprintln!("HOT_UNPLUG: focused secondary removed; primary focus and red capture recovered");
        let retina = fixture.command("add-retina");
        assert_eq!(verify_displays(&retina).await.len(), 2);
        let positioned = fixture.command(&format!("layout {width} 0"));
        let monitors = verify_displays(&positioned).await;
        let extra = positioned["extra"].as_u64().unwrap() as u32;
        let native_retina = positioned["displays"]
            .as_array()
            .unwrap()
            .iter()
            .find(|d| d["id"].as_u64() == Some(extra as u64))
            .unwrap();
        assert_eq!(native_retina["x"].as_i64(), Some(width));
        assert_eq!(native_retina["y"].as_i64(), Some(0));
        assert_eq!(
            native_retina["pixels_w"].as_u64().unwrap(),
            native_retina["w"].as_u64().unwrap() * 2,
            "retina must be actual 2x backing scale"
        );
        fixture.command(&format!("warp {} 100", width + 100));
        wait_focus(&tracker, Some(extra)).await;
        wait_mapping(&controller, &monitors, Some(extra)).await;
        let m = monitors.iter().find(|m| m.id() == extra).unwrap();
        let image = tokio::time::timeout(Duration::from_secs(20), m.capture_image())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            image.width() as u64,
            native_retina["pixels_w"].as_u64().unwrap()
        );
        assert_eq!(
            image.height() as u64,
            native_retina["pixels_h"].as_u64().unwrap()
        );
        verify_capture_marker(&image, native_retina);
        eprintln!("HIDPI_CAPTURE {}x{}", image.width(), image.height());
        if let Ok(dir) = std::env::var("SCREENPIPE_VM_EVIDENCE_DIR") {
            image.save(format!("{dir}/retina-native.png")).unwrap();
        }
        // Changing capture size must recreate the stream and preserve full content.
        struct RestoreCaptureWidth;
        impl Drop for RestoreCaptureWidth {
            fn drop(&mut self) {
                screenpipe_screen::monitor::set_sck_capture_max_width(0);
            }
        }
        let _restore_capture_width = RestoreCaptureWidth;
        for cap in [1280, 1920, 0] {
            screenpipe_screen::monitor::set_sck_capture_max_width(cap);
            let frame = tokio::time::timeout(Duration::from_secs(20), m.capture_image())
                .await
                .unwrap()
                .unwrap();
            let expected_width = if cap == 0 { 2560 } else { cap };
            assert_eq!(
                (frame.width(), frame.height()),
                (expected_width, expected_width * 9 / 16)
            );
            verify_capture_marker(&frame, native_retina);
            eprintln!("RETINA_CAP {cap}: {}x{}", frame.width(), frame.height());
        }
        // HD recording uses pixels before its own 1920 cap, independently of focus.
        let hd_monitor = m.clone();
        let mut hd = tokio::task::spawn_blocking(move || hd_monitor.start_hd_capture(2, &[], 0))
            .await
            .unwrap()
            .unwrap();
        assert_eq!((hd.width, hd.height), (1920, 1080));
        let hd_frame = tokio::time::timeout(Duration::from_secs(20), hd.frames.recv())
            .await
            .unwrap()
            .expect("HD stream produced no frame");
        assert_eq!(hd_frame.dimensions(), (1920, 1080));
        verify_capture_marker(&image::DynamicImage::ImageRgba8(hd_frame), native_retina);
        drop(hd);
        eprintln!("RETINA_HD: actual 1920x1080 frame, correct blue display content");
        // A 2x raster must not double the logical rectangle used for focus.
        for (x, expected) in [
            (width - 1, primary_id),
            (width, extra),
            (width + 1279, extra),
        ] {
            let actual = fixture.command(&format!("warp {x} 100"));
            assert_eq!(actual["cursor_x"].as_f64(), Some(x as f64));
            wait_focus(&tracker, Some(expected)).await;
            wait_mapping(&controller, &monitors, Some(expected)).await;
        }
        eprintln!("RETINA_BOUNDARIES: exactly one focused display at mixed-DPI edges");
        for (command, scale) in [("mode-standard", 1), ("mode-retina", 2)] {
            let changed = fixture.command(command);
            assert_eq!(
                changed["extra"].as_u64(),
                Some(extra as u64),
                "mode change must retain display ID"
            );
            let monitors = verify_displays(&changed).await;
            let native = changed["displays"]
                .as_array()
                .unwrap()
                .iter()
                .find(|d| d["id"].as_u64() == Some(extra as u64))
                .unwrap();
            assert_eq!(native["pixels_w"].as_u64(), Some(1280 * scale));
            let current = monitors.iter().find(|m| m.id() == extra).unwrap();
            let frame = tokio::time::timeout(Duration::from_secs(20), current.capture_image())
                .await
                .unwrap()
                .unwrap();
            assert_eq!(
                (frame.width(), frame.height()),
                (1280 * scale as u32, 720 * scale as u32)
            );
            verify_capture_marker(&frame, native);
            eprintln!(
                "SAME_ID_MODE {command}: display={extra}, {}x{}",
                frame.width(),
                frame.height()
            );
        }
        // Force the actual CoreGraphics backend directly, without wedging a
        // callback or permitting fallback to hide failures in the SCK cases.
        let fallback = SafeMonitor::from_xcap(
            xcap::Monitor::all()
                .unwrap()
                .into_iter()
                .find(|m| m.id().ok() == Some(extra))
                .unwrap(),
        );
        assert!(!fallback.uses_sck_backend());
        for (cap, expected_width) in [(1280, 1280), (1920, 1920), (0, 2560)] {
            screenpipe_screen::monitor::set_sck_capture_max_width(cap);
            let frame = tokio::time::timeout(Duration::from_secs(20), fallback.capture_image())
                .await
                .unwrap()
                .unwrap();
            assert_eq!(
                (frame.width(), frame.height()),
                (expected_width, expected_width * 9 / 16)
            );
            verify_capture_marker(&frame, native_retina);
            eprintln!("RETINA_CG_CAP {cap}: {}x{}", frame.width(), frame.height());
        }
        assert!(!controller.resolution_degraded());
        controller.shutdown();
        tracker.stop();
        // Drop reaps the helper process. Independently verify its virtual display
        // disappeared through the production enumeration path, creating no helper.
        drop(fixture);
        let cleanup_deadline = Instant::now() + Duration::from_secs(12);
        loop {
            let remaining = list_monitors().await;
            if remaining.len() == 1 && remaining[0].id() == primary_id {
                break;
            }
            assert!(
                Instant::now() < cleanup_deadline,
                "fixture display survived helper cleanup"
            );
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        eprintln!("PASS multi-monitor layouts, captures, stale-topology grace/recovery, hotplug and Retina; literal_gap={}", if literal_gap_supported { "native gap exercised" } else { "UNSUPPORTED (OS clamped cursor), not reproduced" });
    }

    #[cfg(target_os = "macos")]
    pub fn run() -> anyhow::Result<()> {
        if std::env::var("SCREENPIPE_ISOLATED_VM_TEST").as_deref() != Ok("1") {
            println!(
                "SKIP: requires SCREENPIPE_ISOLATED_VM_TEST=1 in a disposable logged-in Mac VM"
            );
            return Ok(());
        }
        // Exercise completion-before-loop, returned errors and panic propagation.
        assert_eq!(screenpipe_engine::macos_run_loop::run(|| 7)?, 7);
        let error = screenpipe_engine::macos_run_loop::run(|| Err::<(), _>("expected error"))?;
        assert_eq!(error, Err("expected error"));
        assert!(std::panic::catch_unwind(|| {
            let _ = screenpipe_engine::macos_run_loop::run(|| panic!("expected lifecycle panic"));
        })
        .is_err());
        screenpipe_engine::macos_run_loop::run(|| {
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(4)
                .enable_all()
                .build()
                .unwrap()
                .block_on(native_multi_monitor_focus_capture_gap_and_hotplug());
        })?;
        println!("PASS: native multi-monitor acceptance and main-loop shutdown");
        Ok(())
    }
}
#[cfg(target_os = "macos")]
fn main() -> anyhow::Result<()> {
    native::run()
}
#[cfg(not(target_os = "macos"))]
fn main() {
    println!("SKIP: macOS-only native acceptance");
}
