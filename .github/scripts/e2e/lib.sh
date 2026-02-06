#!/usr/bin/env bash
# E2E test library — shared helpers for all test scripts
# Requires: bb (bigbrother CLI) in PATH

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
APP_NAME="screenpipe-app"
APP_BUNDLE="screenpipe"
HEALTH_URL="http://localhost:3030/health"
SEARCH_URL="http://localhost:3030/search"
TIMEOUT_SHORT=5000
TIMEOUT_MEDIUM=15000
TIMEOUT_LONG=60000
ARTIFACTS_DIR="${ARTIFACTS_DIR:-/tmp/screenpipe-e2e}"

# ── State ───────────────────────────────────────────────────────────────────
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_NAMES=()

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ─────────────────────────────────────────────────────────────────

setup() {
    mkdir -p "$ARTIFACTS_DIR"
    echo -e "${BOLD}${CYAN}═══ screenpipe e2e tests ═══${NC}"
    echo "artifacts: $ARTIFACTS_DIR"
    echo "time:      $(date)"
    echo ""
}

# Run a single test. Usage: run_test "test name" test_function
run_test() {
    local name="$1"
    local func="$2"
    TESTS_RUN=$((TESTS_RUN + 1))

    echo -ne "  ${BOLD}[$TESTS_RUN]${NC} $name ... "

    local start_time
    start_time=$(python3 -c "import time; print(int(time.time()*1000))")

    local output
    if output=$($func 2>&1); then
        local end_time
        end_time=$(python3 -c "import time; print(int(time.time()*1000))")
        local duration=$(( end_time - start_time ))
        echo -e "${GREEN}PASS${NC} (${duration}ms)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        local end_time
        end_time=$(python3 -c "import time; print(int(time.time()*1000))")
        local duration=$(( end_time - start_time ))
        echo -e "${RED}FAIL${NC} (${duration}ms)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        FAILED_NAMES+=("$name")
        # Save failure output (sanitize filename)
        local safe_name
        safe_name=$(echo "$name" | tr ' /' '-_')
        echo "$output" > "$ARTIFACTS_DIR/fail-${TESTS_RUN}-${safe_name}.log"
        # Take screenshot on failure
        bb screenshot --output "$ARTIFACTS_DIR/fail-${TESTS_RUN}.png" 2>/dev/null || true
    fi
}

# Print summary and exit with appropriate code
summary() {
    echo ""
    echo -e "${BOLD}═══ results ═══${NC}"
    echo -e "  total:  $TESTS_RUN"
    echo -e "  passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "  failed: ${RED}$TESTS_FAILED${NC}"

    if [ ${#FAILED_NAMES[@]} -gt 0 ]; then
        echo ""
        echo -e "${RED}failed tests:${NC}"
        for name in "${FAILED_NAMES[@]}"; do
            echo -e "  ${RED}✗${NC} $name"
        done
    fi

    echo ""
    echo "artifacts: $ARTIFACTS_DIR"
    echo "screenshots: $(ls "$ARTIFACTS_DIR"/*.png 2>/dev/null | wc -l | tr -d ' ')"

    if [ "$TESTS_FAILED" -gt 0 ]; then
        exit 1
    fi
}

# ── bb wrappers ─────────────────────────────────────────────────────────────

# Assert element exists. Usage: assert_exists "selector" [timeout_ms]
assert_exists() {
    local selector="$1"
    local timeout="${2:-$TIMEOUT_SHORT}"
    bb wait --selector "$selector" --app "$APP_NAME" --timeout "$timeout" > /dev/null 2>&1
}

# Assert element does NOT exist.
assert_not_exists() {
    local selector="$1"
    local result
    if result=$(bb find "$selector" --app "$APP_NAME" --timeout 2000 2>&1); then
        # Check if data array is empty
        local count
        count=$(echo "$result" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null || echo "0")
        [ "$count" = "0" ]
    else
        # find failed = element doesn't exist = good
        return 0
    fi
}

# Click an element. Usage: bb_click "selector"
bb_click() {
    local selector="$1"
    bb click "$selector" --app "$APP_NAME" > /dev/null 2>&1
}

# Type text
bb_type() {
    bb type "$1" > /dev/null 2>&1
}

# Press key
bb_press() {
    bb press "$1" > /dev/null 2>&1
}

# Keyboard shortcut
bb_shortcut() {
    local key="$1"
    local mods="${2:-cmd}"
    bb shortcut "$key" --modifiers "$mods" > /dev/null 2>&1
}

# Get scrape text from app
bb_scrape() {
    bb scrape --app "$APP_NAME" 2>/dev/null
}

# Take screenshot
bb_screenshot() {
    local name="${1:-screenshot}"
    bb screenshot --output "$ARTIFACTS_DIR/${name}.png" > /dev/null 2>&1
}

# Wait for app process
wait_for_app() {
    local timeout="${1:-30}"
    local elapsed=0
    while ! pgrep -f "$APP_BUNDLE" > /dev/null 2>&1; do
        sleep 1
        elapsed=$((elapsed + 1))
        if [ "$elapsed" -ge "$timeout" ]; then
            echo "app did not start within ${timeout}s"
            return 1
        fi
    done
}

# Wait for health API
wait_for_health() {
    local timeout="${1:-60}"
    local elapsed=0
    while true; do
        if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
        if [ "$elapsed" -ge "$timeout" ]; then
            echo "health API did not respond within ${timeout}s"
            return 1
        fi
    done
}

# Check health API field. Usage: assert_health_field "status" "healthy"
assert_health_field() {
    local field="$1"
    local expected="$2"
    local actual
    actual=$(curl -sf "$HEALTH_URL" | python3 -c "import json,sys; print(json.load(sys.stdin).get('$field',''))")
    [ "$actual" = "$expected" ]
}

# Check search has results. Usage: assert_search_results "content_type" min_count
assert_search_results() {
    local content_type="$1"
    local min_count="${2:-1}"
    local count
    count=$(curl -sf "${SEARCH_URL}?limit=${min_count}&content_type=${content_type}" | \
        python3 -c "import json,sys; print(len(json.load(sys.stdin).get('data',[])))")
    [ "$count" -ge "$min_count" ]
}
