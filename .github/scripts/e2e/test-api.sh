#!/usr/bin/env bash
# Test suite: REST API endpoints
# Verifies all critical API endpoints respond correctly
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

setup

BASE="http://localhost:3030"

# ── Helpers ─────────────────────────────────────────────────────────────────

assert_http_ok() {
    local url="$1"
    local status
    status=$(curl -sf -o /dev/null -w "%{http_code}" "$url")
    [ "$status" = "200" ]
}

assert_json_field() {
    local url="$1"
    local field="$2"
    curl -sf "$url" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('$field') is not None, f'missing field: $field'"
}

# ── Tests ───────────────────────────────────────────────────────────────────

test_health_endpoint() {
    assert_http_ok "$BASE/health"
}

test_search_ocr() {
    assert_http_ok "$BASE/search?limit=1&content_type=ocr"
}

test_search_audio() {
    assert_http_ok "$BASE/search?limit=1&content_type=audio"
}

test_search_with_query() {
    assert_http_ok "$BASE/search?limit=1&q=test"
}

test_search_pagination() {
    assert_http_ok "$BASE/search?limit=5&offset=0"
}

test_search_response_structure() {
    curl -sf "$BASE/search?limit=1" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert 'data' in d, 'missing data field'
assert 'pagination' in d, 'missing pagination field'
assert isinstance(d['data'], list), 'data is not a list'
"
}

test_health_response_structure() {
    curl -sf "$BASE/health" | python3 -c "
import json, sys
d = json.load(sys.stdin)
required = ['status', 'status_code', 'frame_status', 'audio_status', 'message']
for field in required:
    assert field in d, f'missing field: {field}'
"
}

test_pipes_endpoint() {
    # /pipes/list should exist (may require auth → 403, or return 200)
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/pipes/list" 2>/dev/null || echo "000")
    # Accept 200, 403 (auth required), or 404 — not 500
    [ "$status" = "200" ] || [ "$status" = "403" ] || [ "$status" = "404" ]
}

test_search_date_range() {
    # Search with date range should work
    local today
    today=$(date -u +%Y-%m-%dT00:00:00Z)
    assert_http_ok "$BASE/search?limit=1&start_time=$today"
}

test_concurrent_requests() {
    # Fire 5 concurrent requests — app shouldn't crash
    local pids=()
    for i in $(seq 1 5); do
        curl -sf "$BASE/search?limit=1" > /dev/null 2>&1 &
        pids+=($!)
    done
    # Wait for all and check they succeeded
    local failed=0
    for pid in "${pids[@]}"; do
        if ! wait "$pid"; then
            failed=$((failed + 1))
        fi
    done
    [ "$failed" -eq 0 ]
}

test_large_search_limit() {
    # Large limit shouldn't crash the server
    assert_http_ok "$BASE/search?limit=100&content_type=ocr"
}

test_invalid_content_type() {
    # Invalid content type should return error, not crash
    local status
    status=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/search?content_type=invalid" 2>/dev/null || echo "000")
    # Should return 400 or 200 with empty results — not 500
    [ "$status" != "500" ]
}

# ── Run ─────────────────────────────────────────────────────────────────────

echo -e "${BOLD}suite: REST API${NC}"
echo ""

run_test "GET /health"                  test_health_endpoint
run_test "GET /search (ocr)"            test_search_ocr
run_test "GET /search (audio)"          test_search_audio
run_test "GET /search (query)"          test_search_with_query
run_test "GET /search (pagination)"     test_search_pagination
run_test "search response structure"    test_search_response_structure
run_test "health response structure"    test_health_response_structure
run_test "GET /pipes/list"              test_pipes_endpoint
run_test "search with date range"       test_search_date_range
run_test "5 concurrent requests"        test_concurrent_requests
run_test "large search limit (100)"     test_large_search_limit
run_test "invalid content type (!500)"  test_invalid_content_type

summary
