#!/bin/bash

log() {
    echo -e "\e[1;34m[INFO]\e[0m $1"
}
export XDG_SESSION_TYPE="x11"
export WAYLAND_DISPLAY=""

# Change directory to Screenpipe folder
cd /workspaces/screenpipe/

log "Installing dependencies"
.github/scripts/install_dependencies.sh

log "Verifying Tesseract installation"
.github/scripts/verify_tesseract.sh

log "Building CLI"
cargo build --release

log "Setting up virtual display with window manager"
.github/scripts/setup_display.sh

log "Setting up audio"
.github/scripts/setup_audio.sh

log "Running Screenpipe"
.github/scripts/run_screenpipe.sh

log "Testing OCR"
.github/scripts/test_ocr.sh

log "Testing Audio Capture"
.github/scripts/test_audio_capture.sh

log "Stopping Screenpipe"
.github/scripts/stop_screenpipe.sh

log "Checking for crashes and expected behavior"
.github/scripts/check_logs.sh

log "Checking final storage usage"
du -ha ~/.screenpipe/data
