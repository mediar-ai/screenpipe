#!/bin/bash
convert -size 300x100 xc:white -font DejaVu-Sans -pointsize 24 -fill black -draw "text 10,50 'Hello, Screenpipe OCR'" test_image.png
DISPLAY=:99 display test_image.png &
DISPLAY_PID=$!
sleep 30
kill $DISPLAY_PID
if grep -qi "Hello, Screenpipe OCR" screenpipe_output.log; then
  echo "OCR test passed: Text was recognized"
else
  echo "OCR test failed: Text was not recognized"
  echo "Last 100 lines of log:"
  tail -n 100 screenpipe_output.log
  exit 1
fi
