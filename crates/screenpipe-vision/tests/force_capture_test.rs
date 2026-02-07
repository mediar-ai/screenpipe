/// Tests for the force-capture minimum FPS guarantee.
///
/// The bug: when a user sets 0.2 FPS, they expect at least 1 frame every 5 seconds.
/// But if the screen is static (diff < 0.02 threshold), ALL frames are skipped
/// indefinitely — the user gets 0 frames in the timeline for minutes.
///
/// The fix: track when the last frame was captured. If more than 2× the base
/// interval has passed, force-capture even if diff is below threshold.
///
/// Run with: cargo test -p screenpipe-vision --test force_capture_test -- --nocapture

use std::time::Duration;

/// Pure decision function matching the logic in continuous_capture.
/// Returns (should_skip, is_force_capture).
fn should_skip_frame(
    diff: f64,
    skip_threshold: f64,
    time_since_last_capture: Duration,
    force_capture_deadline: Duration,
) -> (bool, bool) {
    let below_threshold = diff < skip_threshold;
    let force_capture = time_since_last_capture >= force_capture_deadline;

    if below_threshold && !force_capture {
        (true, false) // skip
    } else if below_threshold && force_capture {
        (false, true) // force-capture (below threshold but deadline exceeded)
    } else {
        (false, false) // normal capture (above threshold)
    }
}

/// Whether a force-captured frame (diff=0.0) should enter the max_average tracker.
/// In the real code: `current_diff > max_avg_value || (force_capture && max_average.is_none())`
fn should_accept_frame(
    diff: f64,
    max_avg_value: f64,
    force_capture: bool,
    has_max_average: bool,
) -> bool {
    diff > max_avg_value || (force_capture && !has_max_average)
}

// ==================== Basic skip/force logic ====================

#[test]
fn test_normal_capture_above_threshold() {
    // diff=0.05 > threshold=0.02 → capture normally
    let (skip, force) = should_skip_frame(0.05, 0.02, Duration::from_secs(1), Duration::from_secs(10));
    assert!(!skip);
    assert!(!force);
}

#[test]
fn test_skip_below_threshold_within_deadline() {
    // diff=0.01 < threshold=0.02, only 3s since last capture, deadline=10s → skip
    let (skip, force) = should_skip_frame(0.01, 0.02, Duration::from_secs(3), Duration::from_secs(10));
    assert!(skip);
    assert!(!force);
}

#[test]
fn test_force_capture_below_threshold_past_deadline() {
    // diff=0.001 < threshold=0.02, BUT 11s since last capture > deadline=10s → force
    let (skip, force) = should_skip_frame(0.001, 0.02, Duration::from_secs(11), Duration::from_secs(10));
    assert!(!skip, "should NOT skip — deadline exceeded");
    assert!(force, "should be force-capture");
}

#[test]
fn test_force_capture_zero_diff_past_deadline() {
    // diff=0.0 (hash-identical frame), but deadline exceeded → force
    let (skip, force) = should_skip_frame(0.0, 0.02, Duration::from_secs(15), Duration::from_secs(10));
    assert!(!skip);
    assert!(force);
}

#[test]
fn test_normal_capture_above_threshold_past_deadline() {
    // diff=0.05 > threshold, deadline also exceeded → normal capture (not force)
    let (skip, force) = should_skip_frame(0.05, 0.02, Duration::from_secs(15), Duration::from_secs(10));
    assert!(!skip);
    assert!(!force, "should be normal capture, not force");
}

// ==================== Deadline calculation for various FPS ====================

#[test]
fn test_deadline_at_0_2_fps() {
    // 0.2 FPS → interval = 5s → deadline = 10s
    let interval = Duration::from_secs_f64(1.0 / 0.2);
    let deadline = interval.mul_f64(2.0);
    assert_eq!(interval, Duration::from_secs(5));
    assert_eq!(deadline, Duration::from_secs(10));

    // At t=9s → still within deadline, should skip if below threshold
    let (skip, _) = should_skip_frame(0.001, 0.02, Duration::from_secs(9), deadline);
    assert!(skip);

    // At t=10s → deadline reached, force capture
    let (skip, force) = should_skip_frame(0.001, 0.02, Duration::from_secs(10), deadline);
    assert!(!skip);
    assert!(force);
}

#[test]
fn test_deadline_at_0_5_fps() {
    // 0.5 FPS → interval = 2s → deadline = 4s
    let interval = Duration::from_secs_f64(1.0 / 0.5);
    let deadline = interval.mul_f64(2.0);
    assert_eq!(interval, Duration::from_secs(2));
    assert_eq!(deadline, Duration::from_secs(4));
}

#[test]
fn test_deadline_at_1_fps() {
    // 1 FPS → interval = 1s → deadline = 2s
    let interval = Duration::from_secs_f64(1.0 / 1.0);
    let deadline = interval.mul_f64(2.0);
    assert_eq!(interval, Duration::from_secs(1));
    assert_eq!(deadline, Duration::from_secs(2));
}

// ==================== max_average tracker acceptance ====================

#[test]
fn test_force_capture_zero_diff_accepted_into_tracker() {
    // Force-captured frame with diff=0.0, no existing max_average
    // Must be accepted, otherwise the force-captured frame is silently lost
    assert!(
        should_accept_frame(0.0, 0.0, true, false),
        "Force-captured frame with diff=0.0 MUST be accepted when no max_average exists"
    );
}

#[test]
fn test_normal_frame_not_accepted_if_diff_not_higher() {
    // Normal frame (not force), diff=0.01, max_avg_value=0.05
    assert!(
        !should_accept_frame(0.01, 0.05, false, true),
        "Normal frame with lower diff should not replace higher max_average"
    );
}

#[test]
fn test_normal_frame_accepted_if_diff_higher() {
    assert!(should_accept_frame(0.06, 0.05, false, true));
}

#[test]
fn test_force_capture_not_needed_if_max_average_exists() {
    // Force capture, but max_average already has a frame → don't override
    // (the existing frame has higher diff, let it be processed)
    assert!(
        !should_accept_frame(0.0, 0.05, true, true),
        "Force capture should not override existing higher-diff max_average"
    );
}

// ==================== Simulate user scenario ====================

#[test]
fn test_simulate_static_screen_at_0_2_fps() {
    // User: 0.2 FPS, no adaptive FPS, static screen (diff always 0.0)
    // Expected: at least 1 frame captured per 10 seconds (2× interval)
    let interval = Duration::from_secs(5); // 0.2 FPS
    let deadline = interval.mul_f64(2.0);  // 10s
    let threshold = 0.02;

    let mut captures = 0;
    let mut skips = 0;
    let total_seconds = 60; // Simulate 1 minute

    // Each "tick" is one interval (5 seconds)
    let ticks = total_seconds / interval.as_secs();
    let mut time_since_capture = Duration::ZERO;

    for _tick in 0..ticks {
        time_since_capture += interval;
        let diff = 0.0; // Completely static screen

        let (skip, force) = should_skip_frame(diff, threshold, time_since_capture, deadline);

        if skip {
            skips += 1;
        } else {
            captures += 1;
            time_since_capture = Duration::ZERO; // Reset on capture

            if force {
                // Verify force-capture frame would be accepted
                assert!(
                    should_accept_frame(0.0, 0.0, true, false),
                    "Force-captured frame must be accepted into tracker"
                );
            }
        }
    }

    println!(
        "Static screen 0.2 FPS for 60s: {} captures, {} skips ({} ticks)",
        captures, skips, ticks
    );

    // 60s / 10s deadline = 6 force captures
    // Pattern: skip at 5s, force at 10s, skip at 15s, force at 20s, ...
    assert_eq!(captures, 6, "Should get exactly 6 captures in 60s (every 10s)");
    assert_eq!(skips, 6, "Should skip 6 times (every other tick)");
}

#[test]
fn test_simulate_active_screen_at_0_2_fps() {
    // User: 0.2 FPS, screen changes every tick (diff > threshold)
    // Expected: every frame captured, force-capture never triggers
    let interval = Duration::from_secs(5);
    let deadline = interval.mul_f64(2.0);
    let threshold = 0.02;

    let mut captures = 0;
    let mut force_captures = 0;
    let ticks = 12; // 60s
    let mut time_since_capture = Duration::ZERO;

    for _tick in 0..ticks {
        time_since_capture += interval;
        let diff = 0.05; // Active screen, above threshold

        let (skip, force) = should_skip_frame(diff, threshold, time_since_capture, deadline);
        assert!(!skip);
        captures += 1;
        if force { force_captures += 1; }
        time_since_capture = Duration::ZERO;
    }

    assert_eq!(captures, 12, "All frames captured on active screen");
    assert_eq!(force_captures, 0, "No force-captures needed on active screen");
}

#[test]
fn test_simulate_intermittent_activity() {
    // Screen is static for 30s, then active for 10s, then static for 20s
    let interval = Duration::from_secs(5);
    let deadline = interval.mul_f64(2.0);
    let threshold = 0.02;

    // Timeline: tick 0-5 (static), tick 6-7 (active), tick 8-11 (static)
    let diffs = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.08, 0.06, 0.0, 0.0, 0.0, 0.0];
    let mut captures = 0;
    let mut force_captures = 0;
    let mut time_since_capture = Duration::ZERO;

    for &diff in &diffs {
        time_since_capture += interval;
        let (skip, force) = should_skip_frame(diff, threshold, time_since_capture, deadline);
        if !skip {
            captures += 1;
            if force { force_captures += 1; }
            time_since_capture = Duration::ZERO;
        }
    }

    println!(
        "Intermittent: {} captures ({} forced) out of {} ticks",
        captures, force_captures, diffs.len()
    );

    // Static ticks 0-5: skip,force,skip,force,skip,force = 3 force captures
    // Active ticks 6-7: 2 normal captures
    // Static ticks 8-11: skip,force,skip,force = 2 force captures
    // Total: 7 captures (5 forced + 2 normal)
    assert!(captures >= 5, "Should capture at least 5 frames: got {}", captures);
    assert!(captures <= 8, "Should not over-capture: got {}", captures);
    assert!(force_captures >= 3, "Should have at least 3 force captures: got {}", force_captures);
}
