#!/usr/bin/env bash
# Test suite: App launch and basic health
# Verifies the app starts, backend comes up, tray icon works
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

setup

# ── Tests ───────────────────────────────────────────────────────────────────

test_app_process_running() {
    pgrep -f "screenpipe" > /dev/null 2>&1
}

test_health_api_responds() {
    curl -sf "$HEALTH_URL" > /dev/null 2>&1
}

test_health_status_healthy() {
    assert_health_field "status" "healthy"
}

test_health_frame_status_ok() {
    assert_health_field "frame_status" "ok"
}

test_health_audio_status_ok() {
    assert_health_field "audio_status" "ok"
}

test_tray_icon_exists() {
    # The tray (status) menu bar item has name "status menu"
    assert_exists "role:AXMenuBarItem AND name~:status"
}

test_tray_shows_recording() {
    assert_exists "title:● recording"
}

test_tray_version_present() {
    assert_exists "title~:version"
}

test_tray_settings_item() {
    assert_exists "role:AXMenuItem AND title:settings"
}

test_tray_quit_item() {
    assert_exists "role:AXMenuItem AND title:quit screenpipe"
}

test_tray_changelog_item() {
    assert_exists "role:AXMenuItem AND title:changelog"
}

test_tray_show_screenpipe_item() {
    assert_exists "title~:show screenpipe"
}

test_tray_stop_recording_item() {
    assert_exists "role:AXMenuItem AND title:stop recording"
}

test_tray_start_recording_item() {
    assert_exists "role:AXMenuItem AND title:start recording"
}

test_tray_send_feedback_item() {
    assert_exists "role:AXMenuItem AND title:send feedback"
}

# ── Run ─────────────────────────────────────────────────────────────────────

echo -e "${BOLD}suite: app launch & health${NC}"
echo ""

run_test "app process running"          test_app_process_running
run_test "health API responds"          test_health_api_responds
run_test "health status healthy"        test_health_status_healthy
run_test "health frame_status ok"       test_health_frame_status_ok
run_test "health audio_status ok"       test_health_audio_status_ok
run_test "tray icon exists"             test_tray_icon_exists
run_test "tray shows recording"         test_tray_shows_recording
run_test "tray version present"         test_tray_version_present
run_test "tray settings item"           test_tray_settings_item
run_test "tray quit item"               test_tray_quit_item
run_test "tray changelog item"          test_tray_changelog_item
run_test "tray show screenpipe"         test_tray_show_screenpipe_item
run_test "tray stop recording"          test_tray_stop_recording_item
run_test "tray start recording"         test_tray_start_recording_item
run_test "tray send feedback"           test_tray_send_feedback_item

bb_screenshot "01-tray-health"

summary
