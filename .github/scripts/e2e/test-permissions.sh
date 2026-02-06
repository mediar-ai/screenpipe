#!/usr/bin/env bash
# Test suite: Permissions
# Verifies permission state detection, banner visibility
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

setup

# ── Tests ───────────────────────────────────────────────────────────────────

test_no_permission_banner_when_granted() {
    # If all permissions are granted (expected on test machine),
    # there should be no red permission banner visible
    # Open the main window first
    bb_shortcut "s" "cmd,ctrl"
    sleep 2

    # Look for permission-related warning text
    local scrape
    scrape=$(bb_scrape 2>/dev/null || echo '{"data":{"items":[]}}')
    echo "$scrape" | python3 -c "
import json, sys
d = json.load(sys.stdin)
texts = [item.get('text','').lower() for item in d.get('data',{}).get('items',[])]
# If any text mentions 'permission' in a warning context, fail
for t in texts:
    if 'permission' in t and ('grant' in t or 'missing' in t or 'denied' in t or 'allow' in t):
        print(f'found permission warning: {t}', file=sys.stderr)
        sys.exit(1)
"
}

test_screen_recording_permission() {
    # Verify the app can actually capture screen (health says frame_status ok)
    assert_health_field "frame_status" "ok"
}

test_microphone_permission() {
    # Verify audio is working (health says audio_status ok)
    assert_health_field "audio_status" "ok"
}

test_accessibility_permission() {
    # If bb can read the app's accessibility tree, accessibility is granted
    local result
    result=$(bb tree --app "$APP_NAME" 2>&1)
    echo "$result" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if not d.get('success', False):
    sys.exit(1)
count = d.get('data', {}).get('element_count', 0)
if count < 5:
    sys.exit(1)
"
}

# ── Run ─────────────────────────────────────────────────────────────────────

echo -e "${BOLD}suite: permissions${NC}"
echo ""

run_test "no permission banner when granted"  test_no_permission_banner_when_granted
run_test "screen recording permission"        test_screen_recording_permission
run_test "microphone permission"              test_microphone_permission
run_test "accessibility permission"           test_accessibility_permission

bb_screenshot "04-permissions"

summary
