#!/bin/bash

# Check if running on macOS and needs sudo
if [[ "$(uname)" == "Darwin" && "$EUID" -ne 0 ]]; then
    echo "On macOS, please run with sudo to handle security measures"
    exit 1
fi

# Function to detect OS and architecture
get_os_arch() {
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    local arch=$(uname -m)

    case "$arch" in
    x86_64) arch="x86_64" ;;
    aarch64 | arm64) arch="aarch64" ;;
    *)
        echo "Unsupported architecture: $arch"
        exit 1
        ;;
    esac

    case "$os" in
    darwin)
        echo "apple-darwin" "$arch"
        ;;
    linux)
        echo "unknown-linux-gnu" "$arch"
        ;;
    *)
        echo "Unsupported OS: $os"
        exit 1
        ;;
    esac
}

echo "Fetching latest version from GitHub..."
LATEST_RELEASE=$(curl -s https://api.github.com/repos/mediar-ai/screenpipe/releases/latest)
VERSION=$(echo "$LATEST_RELEASE" | grep -o '"tag_name": "v[^"]*"' | cut -d'"' -f4 | sed 's/^v//')

if [ -z "$VERSION" ]; then
    echo "Failed to fetch latest version"
    exit 1
fi

echo "Latest version: $VERSION"

read os arch <<<$(get_os_arch)

FILENAME="screenpipe-${VERSION}-${arch}-${os}.tar.gz"
URL="https://github.com/mediar-ai/screenpipe/releases/download/v${VERSION}/${FILENAME}"

TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

echo "Downloading screenpipe v${VERSION} for ${arch}-${os}..."
curl -L "$URL" -o "$FILENAME"

echo "Extracting..."
tar xzf "$FILENAME"

echo "Installing..."
INSTALL_DIR="/usr/local/screenpipe"

# Remove existing installation
rm -rf "$INSTALL_DIR"

# Create the exact directory structure needed
mkdir -p "$INSTALL_DIR/screenpipe-vision/lib"

# Copy files maintaining the expected structure
cp lib/libscreenpipe_arm64.dylib "$INSTALL_DIR/screenpipe-vision/lib/"
cp bin/screenpipe "$INSTALL_DIR/"

# Fix binary linking on macOS
if [[ "$(uname)" == "Darwin" ]]; then
    echo "Fixing binary linking..."
    cd "$INSTALL_DIR"

    echo "Current library paths:"
    otool -L "./screenpipe"

    # Remove any existing rpaths
    install_name_tool -delete_rpath "@executable_path/screenpipe-vision/lib" "./screenpipe" 2>/dev/null || true

    # Add new rpath
    install_name_tool -add_rpath "@executable_path/screenpipe-vision/lib" "./screenpipe"

    # Change the library path in the binary
    install_name_tool -change "screenpipe-vision/lib/libscreenpipe_arm64.dylib" "@rpath/libscreenpipe_arm64.dylib" "./screenpipe"

    # Also try changing the library id
    install_name_tool -id "@rpath/libscreenpipe_arm64.dylib" "$INSTALL_DIR/screenpipe-vision/lib/libscreenpipe_arm64.dylib"

    echo "Updated library paths:"
    otool -L "./screenpipe"
    otool -L "$INSTALL_DIR/screenpipe-vision/lib/libscreenpipe_arm64.dylib"
fi

# Remove quarantine attributes on macOS
if [[ "$(uname)" == "Darwin" ]]; then
    echo "Removing quarantine attributes..."
    xattr -r -d com.apple.quarantine "$INSTALL_DIR" 2>/dev/null || true
fi

# Set proper permissions
chown -R root:wheel "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"

# Create symlink in /usr/local/bin
ln -sf "$INSTALL_DIR/screenpipe" "/usr/local/bin/screenpipe"

# Cleanup
cd
rm -rf "$TMP_DIR"

echo "Installation complete!"
