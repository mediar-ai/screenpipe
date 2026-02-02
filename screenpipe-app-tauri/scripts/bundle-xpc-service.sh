#!/bin/bash
# Bundle XPC service into the Tauri app bundle for macOS
# This script should be run after the app is built but before distribution

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SRC_TAURI_DIR="$PROJECT_DIR/src-tauri"

# Configuration
BUNDLE_ID="${TAURI_BUNDLE_IDENTIFIER:-screenpi.pe}"
XPC_BUNDLE_ID="$BUNDLE_ID.ScreenCaptureService"
SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-}"

# Determine app bundle path
if [ -n "$1" ]; then
    APP_BUNDLE="$1"
elif [ -d "$SRC_TAURI_DIR/target/release/bundle/macos/screenpipe.app" ]; then
    APP_BUNDLE="$SRC_TAURI_DIR/target/release/bundle/macos/screenpipe.app"
elif [ -d "$SRC_TAURI_DIR/target/release/bundle/macos/screenpipe - Development.app" ]; then
    APP_BUNDLE="$SRC_TAURI_DIR/target/release/bundle/macos/screenpipe - Development.app"
elif [ -d "$SRC_TAURI_DIR/target/debug/bundle/macos/screenpipe - Development.app" ]; then
    APP_BUNDLE="$SRC_TAURI_DIR/target/debug/bundle/macos/screenpipe - Development.app"
else
    echo "Error: Could not find app bundle. Please specify the path as argument."
    echo "Usage: $0 /path/to/screenpipe.app"
    exit 1
fi

echo "Bundling XPC service into: $APP_BUNDLE"
echo "Bundle ID: $XPC_BUNDLE_ID"

# Build XPC service
XPC_BUILD_DIR="$SRC_TAURI_DIR/target/xpc-build"
mkdir -p "$XPC_BUILD_DIR"

echo "Building XPC service..."
"$SRC_TAURI_DIR/XPCServices/build-xpc-service.sh" "$XPC_BUILD_DIR" "$XPC_BUNDLE_ID" "$SIGNING_IDENTITY"

# Create XPCServices directory in app bundle
XPC_DEST_DIR="$APP_BUNDLE/Contents/XPCServices"
mkdir -p "$XPC_DEST_DIR"

# Copy XPC service bundle
echo "Copying XPC service to app bundle..."
cp -R "$XPC_BUILD_DIR/ScreenCaptureService.xpc" "$XPC_DEST_DIR/"

# Re-sign the entire app bundle if signing identity is provided
if [ -n "$SIGNING_IDENTITY" ]; then
    echo "Re-signing app bundle with XPC service..."
    codesign --force --deep --options runtime \
        --entitlements "$SRC_TAURI_DIR/entitlements.plist" \
        --sign "$SIGNING_IDENTITY" \
        "$APP_BUNDLE"
fi

echo "XPC service bundled successfully!"
echo "XPC service location: $XPC_DEST_DIR/ScreenCaptureService.xpc"

# Verify the XPC service is in place
if [ -d "$XPC_DEST_DIR/ScreenCaptureService.xpc" ]; then
    echo "Verification: XPC service bundle exists"
    ls -la "$XPC_DEST_DIR/ScreenCaptureService.xpc/Contents/"
else
    echo "Error: XPC service bundle not found after copying"
    exit 1
fi
