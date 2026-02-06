#!/usr/bin/env bash
# Run all E2E test suites
# Usage: ./run-all.sh [--suite <name>]
# Without args: runs all suites in order
# With --suite: runs only the named suite (launch, window, settings, recording, permissions, onboarding, chat, api)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export ARTIFACTS_DIR="${ARTIFACTS_DIR:-/tmp/screenpipe-e2e/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$ARTIFACTS_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

SUITES=(
    "launch:test-app-launch.sh"
    "api:test-api.sh"
    "window:test-main-window.sh"
    "settings:test-settings.sh"
    "recording:test-recording.sh"
    "permissions:test-permissions.sh"
    "onboarding:test-onboarding.sh"
    "chat:test-chat.sh"
)

# Parse args
FILTER=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --suite) FILTER="$2"; shift 2 ;;
        *) echo "unknown arg: $1"; exit 1 ;;
    esac
done

echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   screenpipe e2e test runner         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""
echo "artifacts: $ARTIFACTS_DIR"
echo "time:      $(date)"
echo "host:      $(hostname)"
echo "os:        $(sw_vers -productVersion 2>/dev/null || echo 'unknown')"
echo "chip:      $(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo 'unknown')"
echo "memory:    $(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%.0fGB", $1/1073741824}')"
echo ""

# Preflight: check bb is available
if ! command -v bb &>/dev/null; then
    echo -e "${RED}error: bb (bigbrother) not found in PATH${NC}"
    echo "install: cd ~/Documents/bigbrother && cargo build --release && cp target/release/bb /usr/local/bin/"
    exit 1
fi

# Preflight: check app is running
if ! pgrep -f "screenpipe" > /dev/null 2>&1; then
    echo -e "${RED}error: screenpipe is not running${NC}"
    echo "start the app first, then run tests"
    exit 1
fi

# Preflight: check health API
if ! curl -sf "http://localhost:3030/health" > /dev/null 2>&1; then
    echo -e "${RED}warning: health API not responding, waiting 30s...${NC}"
    sleep 30
    if ! curl -sf "http://localhost:3030/health" > /dev/null 2>&1; then
        echo -e "${RED}error: health API still not responding${NC}"
        exit 1
    fi
fi

TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0
FAILED_SUITE_NAMES=()

for entry in "${SUITES[@]}"; do
    name="${entry%%:*}"
    script="${entry##*:}"

    # Skip if filter is set and doesn't match
    if [ -n "$FILTER" ] && [ "$name" != "$FILTER" ]; then
        continue
    fi

    echo ""
    echo -e "${BOLD}━━━ suite: $name ━━━${NC}"
    TOTAL_SUITES=$((TOTAL_SUITES + 1))

    if bash "$SCRIPT_DIR/$script" 2>&1 | tee "$ARTIFACTS_DIR/suite-${name}.log"; then
        PASSED_SUITES=$((PASSED_SUITES + 1))
    else
        FAILED_SUITES=$((FAILED_SUITES + 1))
        FAILED_SUITE_NAMES+=("$name")
    fi
done

echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   final results                      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "  suites run:    $TOTAL_SUITES"
echo -e "  suites passed: ${GREEN}$PASSED_SUITES${NC}"
echo -e "  suites failed: ${RED}$FAILED_SUITES${NC}"

if [ ${#FAILED_SUITE_NAMES[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}failed suites:${NC}"
    for name in "${FAILED_SUITE_NAMES[@]}"; do
        echo -e "  ${RED}✗${NC} $name (see $ARTIFACTS_DIR/suite-${name}.log)"
    done
fi

echo ""
echo "all artifacts: $ARTIFACTS_DIR"
echo "screenshots:   $(ls "$ARTIFACTS_DIR"/*.png 2>/dev/null | wc -l | tr -d ' ')"

if [ "$FAILED_SUITES" -gt 0 ]; then
    exit 1
fi
