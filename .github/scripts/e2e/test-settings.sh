#!/usr/bin/env bash
# Test suite: Settings page
# Opens settings, verifies each section loads without crash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

setup

# ── Helpers ─────────────────────────────────────────────────────────────────

open_settings() {
    # Open settings via menu bar (not tray — tray AXPress doesn't work)
    bb_click "role:AXMenuBarItem AND title:screenpipe"
    sleep 0.5
    bb_click "role:AXMenuItem AND title~:Settings"
    sleep 3
}

# Navigate to a settings section by clicking its sidebar item
navigate_to_section() {
    local label="$1"
    bb_click "role:AXStaticText AND name~:$label"
    sleep 1
}

# Check that settings page didn't crash (webview still has content)
assert_settings_loaded() {
    assert_exists "role:AXWebArea" "$TIMEOUT_MEDIUM"
}

# ── Tests ───────────────────────────────────────────────────────────────────

test_open_settings() {
    open_settings
    assert_settings_loaded
}

test_general_section() {
    navigate_to_section "General"
    assert_settings_loaded
    bb_screenshot "settings-general"
}

test_recording_section() {
    navigate_to_section "Recording"
    assert_settings_loaded
    bb_screenshot "settings-recording"
}

test_ai_section() {
    navigate_to_section "AI"
    assert_settings_loaded
    bb_screenshot "settings-ai"
}

test_shortcuts_section() {
    navigate_to_section "Shortcuts"
    assert_settings_loaded
    bb_screenshot "settings-shortcuts"
}

test_account_section() {
    navigate_to_section "Account"
    assert_settings_loaded
    bb_screenshot "settings-account"
}

test_disk_usage_section() {
    navigate_to_section "Disk"
    assert_settings_loaded
    bb_screenshot "settings-disk-usage"
}

test_connections_section() {
    navigate_to_section "Connections"
    assert_settings_loaded
    bb_screenshot "settings-connections"
}

test_feedback_section() {
    navigate_to_section "Feedback"
    assert_settings_loaded
    bb_screenshot "settings-feedback"
}

test_close_settings() {
    # Escape or Cmd+W to close
    bb_shortcut "w" "cmd"
    sleep 1
}

# ── Run ─────────────────────────────────────────────────────────────────────

echo -e "${BOLD}suite: settings page${NC}"
echo ""

run_test "open settings"            test_open_settings
run_test "general section loads"    test_general_section
run_test "recording section loads"  test_recording_section
run_test "AI section loads"         test_ai_section
run_test "shortcuts section loads"  test_shortcuts_section
run_test "account section loads"    test_account_section
run_test "disk usage section loads" test_disk_usage_section
run_test "connections section loads" test_connections_section
run_test "feedback section loads"   test_feedback_section
run_test "close settings"           test_close_settings

summary
