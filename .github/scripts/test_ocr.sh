#!/bin/bash
set -e

# Create test image with clear text
convert -size 400x150 xc:white -font DejaVu-Sans -pointsize 32 -fill black -draw "text 20,80 'Hello, Screenpipe OCR'" test_image.png

# Display the image
DISPLAY=:99 display test_image.png &
DISPLAY_PID=$!

# Wait for OCR with retries (up to 60 seconds)
MAX_RETRIES=6
RETRY_INTERVAL=10
OCR_FOUND=false

for i in $(seq 1 $MAX_RETRIES); do
  echo "Attempt $i/$MAX_RETRIES: Waiting ${RETRY_INTERVAL}s for OCR..."
  sleep $RETRY_INTERVAL

  # Show resource usage
  ps -p $(cat screenpipe.pid) -o %cpu,%mem,cmd || true

  # Check for OCR text
  OCR_TEXT=$(sqlite3 $HOME/.screenpipe/db.sqlite "SELECT text FROM ocr_text;" 2>/dev/null || echo "")

  if echo "$OCR_TEXT" | grep -qi "Hello, Screenpipe OCR"; then
    OCR_FOUND=true
    break
  fi

  # Show what we found so far
  echo "OCR text found so far: $(echo "$OCR_TEXT" | head -c 200)"
done

kill $DISPLAY_PID 2>/dev/null || true

if [ "$OCR_FOUND" = true ]; then
  echo "OCR test passed: Text was recognized"
else
  echo "OCR test failed: Text was not recognized after ${MAX_RETRIES} attempts"
  echo "Final OCR text in database:"
  sqlite3 $HOME/.screenpipe/db.sqlite "SELECT text FROM ocr_text;" 2>/dev/null | head -20 || echo "(empty)"
  echo ""
  echo "Last 100 lines of log:"
  tail -n 100 screenpipe_output.log
  exit 1
fi
