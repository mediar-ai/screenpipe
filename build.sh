#!/bin/bash

# Set environment variables
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/myapp.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="rbBzfx6bg6#^3^"
export PKG_CONFIG_PATH="/usr/local/opt/ffmpeg/lib/pkgconfig:$PKG_CONFIG_PATH"
export PKG_CONFIG_ALLOW_CROSS=1

# Build the application
cargo build --release --features metal --target aarch64-apple-darwin

# Navigate to the example app directory
cd examples/apps/screenpipe-app-tauri

# Install dependencies
bun install

# Run pre-build script (requires sudo)
sudo bun scripts/pre_build.js

# Build the Tauri application
bun tauri build --target aarch64-apple-darwin -- --features metal