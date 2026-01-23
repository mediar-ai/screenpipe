#!/bin/bash
# Local test script for Vertex AI proxy
#
# Usage:
# 1. Create .dev.vars with your credentials (see .dev.vars.example)
# 2. Start the worker: npm run dev (in another terminal)
# 3. Run this script: ./test-vertex-local.sh

HOST=${HOST:-http://localhost:8787}
TOKEN=${TOKEN:-test-token}

echo "Testing against: $HOST"
echo ""

# Test 1: Health check
echo "=== Test 1: Health check ==="
curl -s "$HOST/test"
echo ""
echo ""

# Test 2: Non-streaming request to /v1/messages
echo "=== Test 2: Non-streaming /v1/messages ==="
curl -s -X POST "$HOST/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "claude-3-5-sonnet-v2@20241022",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "Say hello in exactly 3 words."}
    ]
  }' | jq .
echo ""

# Test 3: Streaming request to /v1/messages
echo "=== Test 3: Streaming /v1/messages ==="
curl -s -X POST "$HOST/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "claude-3-5-sonnet-v2@20241022",
    "max_tokens": 100,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Count from 1 to 3."}
    ]
  }' | while read -r line; do
    echo "$line"
done
echo ""

echo "=== Done ==="
