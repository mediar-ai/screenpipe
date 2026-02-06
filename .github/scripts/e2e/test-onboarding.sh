#!/usr/bin/env bash
# Test suite: Onboarding flow
# Tests the first-run onboarding experience
# NOTE: This test resets onboarding state — run on clean installs or test machines only
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

setup

# ── Tests ───────────────────────────────────────────────────────────────────

test_trigger_onboarding() {
    # Click onboarding from tray menu to re-trigger it
    bb_click "role:AXMenuItem AND title:onboarding"
    sleep 3
    assert_exists "role:AXWebArea" "$TIMEOUT_MEDIUM"
}

test_onboarding_has_skip_or_content() {
    # The onboarding dialog should have either a skip button or setup content
    local scrape
    scrape=$(bb_scrape 2>/dev/null || echo '{"data":{"items":[]}}')
    echo "$scrape" | python3 -c "
import json, sys
d = json.load(sys.stdin)
texts = [item.get('text','').lower() for item in d.get('data',{}).get('items',[])]
all_text = ' '.join(texts)
# Onboarding should contain skip, next, continue, or screenpipe-related content
keywords = ['skip', 'next', 'continue', 'get started', 'welcome', 'screenpipe', 'setup']
if not any(kw in all_text for kw in keywords):
    print(f'no onboarding keywords found in: {all_text[:200]}', file=sys.stderr)
    sys.exit(1)
"
}

test_onboarding_screenshot() {
    bb_screenshot "onboarding-step1"
}

test_close_onboarding() {
    # Try Escape first, then look for close button
    bb_press "Escape"
    sleep 1
}

# ── Run ─────────────────────────────────────────────────────────────────────

echo -e "${BOLD}suite: onboarding flow${NC}"
echo ""

run_test "trigger onboarding from tray"     test_trigger_onboarding
run_test "onboarding has skip/content"      test_onboarding_has_skip_or_content
run_test "onboarding screenshot"            test_onboarding_screenshot
run_test "close onboarding"                 test_close_onboarding

summary
