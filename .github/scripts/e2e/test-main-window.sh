#!/usr/bin/env bash
# Test suite: Main window UI
# Opens the window, verifies timeline loads, search works, navigation
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

setup

# ── Tests ───────────────────────────────────────────────────────────────────

test_open_main_window() {
    # Cmd+Ctrl+S is the global shortcut to show screenpipe
    bb_shortcut "s" "cmd,ctrl"
    sleep 3
    # Window title is just "screenpipe" (exact match or the window might be AXWindow with no title in --app scope)
    # Check for the window's webview content as proof it's open
    assert_exists "role:AXWebArea" "$TIMEOUT_MEDIUM"
}

test_window_has_webview() {
    assert_exists "role:AXWebArea"
}

test_search_button_exists() {
    assert_exists "title~:search"
}

test_timeline_has_time_labels() {
    # Timeline shows hour labels like "10 AM", "9 AM" etc
    local scrape
    scrape=$(bb_scrape)
    echo "$scrape" | python3 -c "
import json, sys, re
d = json.load(sys.stdin)
texts = [item.get('text','') for item in d.get('data',{}).get('items',[])]
has_time = any(re.search(r'\d{1,2}\s*(AM|PM)', t) for t in texts)
if not has_time:
    sys.exit(1)
"
}

test_timeline_has_app_labels() {
    # Timeline shows app names for current frames
    local scrape
    scrape=$(bb_scrape)
    # Just verify we have some static text with meaningful content (not just UI chrome)
    echo "$scrape" | python3 -c "
import json, sys
d = json.load(sys.stdin)
texts = [item.get('text','') for item in d.get('data',{}).get('items',[])]
# Filter out empty/generic texts
meaningful = [t for t in texts if len(t) > 2 and t not in ('text', 'static text', 'group', 'button')]
if len(meaningful) < 3:
    sys.exit(1)
"
}

test_notifications_region_exists() {
    assert_exists "title~:Notifications"
}

test_open_search_panel() {
    bb_shortcut "k" "cmd,ctrl"
    sleep 1
    # Search input should appear
    assert_exists "role:AXTextField" "$TIMEOUT_MEDIUM"
}

test_close_search_panel() {
    bb_press "Escape"
    sleep 1
}

test_screenpipe_menu_exists() {
    # The app's own menu bar
    assert_exists "role:AXMenuBarItem AND title:screenpipe"
}

test_edit_menu_exists() {
    assert_exists "role:AXMenuBarItem AND title:Edit"
}

test_about_menu_item() {
    assert_exists "role:AXMenuItem AND title:About screenpipe"
}

test_check_for_updates_item() {
    assert_exists "title~:Check for Updates"
}

# ── Run ─────────────────────────────────────────────────────────────────────

echo -e "${BOLD}suite: main window UI${NC}"
echo ""

run_test "open main window (⌃⌘S)"      test_open_main_window
run_test "window has webview"           test_window_has_webview
run_test "search button exists"         test_search_button_exists
run_test "timeline has time labels"     test_timeline_has_time_labels
run_test "timeline has app labels"      test_timeline_has_app_labels
run_test "notifications region exists"  test_notifications_region_exists
run_test "open search panel (⌃⌘K)"     test_open_search_panel
run_test "close search panel (Esc)"     test_close_search_panel
run_test "screenpipe menu exists"       test_screenpipe_menu_exists
run_test "edit menu exists"             test_edit_menu_exists
run_test "about menu item"             test_about_menu_item
run_test "check for updates item"       test_check_for_updates_item

bb_screenshot "02-main-window"

summary
