#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$SCRIPT_DIR/ScreenCaptureService"
BUILD_DIR="${1:-$SCRIPT_DIR/build}"
BUNDLE_ID="${2:-screenpi.pe.ScreenCaptureService}"
SIGNING_IDENTITY="${3:-}"

# Create output directory structure
OUTPUT_DIR="$BUILD_DIR/ScreenCaptureService.xpc/Contents"
mkdir -p "$OUTPUT_DIR/MacOS"

echo "Building ScreenCaptureService XPC..."
echo "  Source: $SERVICE_DIR"
echo "  Output: $OUTPUT_DIR"
echo "  Bundle ID: $BUNDLE_ID"

# Compile Swift code
swiftc \
    -O \
    -whole-module-optimization \
    -target arm64-apple-macos12.3 \
    -target x86_64-apple-macos12.3 \
    -sdk "$(xcrun --show-sdk-path)" \
    -framework Foundation \
    -framework ScreenCaptureKit \
    -framework CoreGraphics \
    -framework AppKit \
    -o "$OUTPUT_DIR/MacOS/ScreenCaptureService" \
    "$SERVICE_DIR/ScreenCaptureService.swift"

# Generate Info.plist with correct bundle ID
cat > "$OUTPUT_DIR/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>ScreenCaptureService</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>ScreenCaptureService</string>
    <key>CFBundlePackageType</key>
    <string>XPC!</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>XPCService</key>
    <dict>
        <key>ServiceType</key>
        <string>Application</string>
    </dict>
</dict>
</plist>
EOF

# Code sign if identity provided
if [ -n "$SIGNING_IDENTITY" ]; then
    echo "Signing XPC service with identity: $SIGNING_IDENTITY"
    codesign --force --options runtime \
        --entitlements "$SERVICE_DIR/ScreenCaptureService.entitlements" \
        --sign "$SIGNING_IDENTITY" \
        "$BUILD_DIR/ScreenCaptureService.xpc"
fi

echo "XPC service built successfully at: $BUILD_DIR/ScreenCaptureService.xpc"
