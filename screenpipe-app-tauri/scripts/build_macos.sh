#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Create a symlink for codesign wrapper
mkdir -p "$SCRIPT_DIR/bin"
ln -sf "$SCRIPT_DIR/codesign_wrapper.sh" "$SCRIPT_DIR/bin/codesign"

# Clean up any existing bundle
rm -rf src-tauri/target/release/bundle

# Run tauri build with our codesign wrapper taking precedence
PATH="$SCRIPT_DIR/bin:$PATH" bun tauri build
