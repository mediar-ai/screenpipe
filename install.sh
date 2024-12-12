#!/bin/sh

# Function to detect OS and architecture
get_os_arch() {
    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)

    case "$arch" in
    x86_64) arch="x86_64" ;;
    aarch64 | arm64)
        # Only allow arm64 on macOS
        if [ "$os" != "darwin" ]; then
            echo >&2 "error: arm64/aarch64 is only supported on macOS"
            exit 1
        fi
        arch="aarch64"
        ;;
    *)
        echo >&2 "error: unsupported architecture: $arch"
        exit 1
        ;;
    esac

    case "$os" in
    darwin)
        echo "apple-darwin" "$arch"
        ;;
    linux)
        # Block Linux arm64
        if [ "$arch" = "aarch64" ]; then
            echo >&2 "error: Linux arm64/aarch64 is not supported yet"
            exit 1
        fi
        echo "unknown-linux-gnu" "$arch"
        ;;
    *)
        echo >&2 "error: unsupported operating system: $os"
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

if ! OS_ARCH=$(get_os_arch); then
    # get_os_arch already printed the error message
    exit 1
fi

os=$(echo "$OS_ARCH" | cut -d' ' -f1)
arch=$(echo "$OS_ARCH" | cut -d' ' -f2)

FILENAME="screenpipe-${VERSION}-${arch}-${os}.tar.gz"
URL="https://github.com/mediar-ai/screenpipe/releases/download/v${VERSION}/${FILENAME}"

TMP_DIR=$(mktemp -d)
cd "$TMP_DIR" || exit 1

# Check dependencies on Linux
if [ "$os" = "unknown-linux-gnu" ]; then
    # Check for required libraries
    NEED_ALSA=0
    NEED_FFMPEG=0

    if ! ldconfig -p | grep -q "libasound.so.2" >/dev/null 2>&1; then
        NEED_ALSA=1
    fi
    if ! command -v ffmpeg >/dev/null 2>&1; then
        NEED_FFMPEG=1
    fi

    # Install missing dependencies based on package manager
    if [ $NEED_ALSA -eq 1 ] || [ $NEED_FFMPEG -eq 1 ]; then
        if command -v apt-get >/dev/null 2>&1; then
            # Ubuntu/Debian
            PKGS=""
            [ $NEED_ALSA -eq 1 ] && PKGS="$PKGS libasound2-dev" && echo "installing libasound2-dev..."
            [ $NEED_FFMPEG -eq 1 ] && PKGS="$PKGS ffmpeg" && echo "installing ffmpeg..."
            sudo apt-get install -qq -y $PKGS >/dev/null 2>&1
        elif command -v dnf >/dev/null 2>&1; then
            # Fedora/RHEL
            PKGS=""
            [ $NEED_ALSA -eq 1 ] && PKGS="$PKGS alsa-lib" && echo "installing alsa-lib..."
            [ $NEED_FFMPEG -eq 1 ] && PKGS="$PKGS ffmpeg" && echo "installing ffmpeg..."
            sudo dnf install -q -y $PKGS >/dev/null 2>&1
        elif command -v pacman >/dev/null 2>&1; then
            # Arch Linux
            PKGS=""
            [ $NEED_ALSA -eq 1 ] && PKGS="$PKGS alsa-lib" && echo "installing alsa-lib..."
            [ $NEED_FFMPEG -eq 1 ] && PKGS="$PKGS ffmpeg" && echo "installing ffmpeg..."
            sudo pacman -S --noconfirm --quiet $PKGS >/dev/null 2>&1
        elif command -v zypper >/dev/null 2>&1; then
            # OpenSUSE
            PKGS=""
            [ $NEED_ALSA -eq 1 ] && PKGS="$PKGS alsa-lib" && echo "installing alsa-lib..."
            [ $NEED_FFMPEG -eq 1 ] && PKGS="$PKGS ffmpeg" && echo "installing ffmpeg..."
            sudo zypper --quiet --non-interactive install $PKGS >/dev/null 2>&1
        fi
    fi
fi

# Check macOS dependencies
if [ "$(uname)" = "Darwin" ]; then

    # Check if Xcode tools are installed
    xcode-select -p &
    >/dev/null
    if [ $? -ne 0 ]; then
        echo "Command Line Tools for Xcode not found. Installing from softwareupdate…"
        # This temporary file prompts the 'softwareupdate' utility to list the Command Line Tools
        touch /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
        PROD=$(softwareupdate -l | grep "\*.*Command Line" | tail -n 1 | sed 's/^[^C]* //')
        softwareupdate -i "$PROD" --verbose
    else
        echo "Command Line Tools for Xcode have been installed."
    fi

    # Check if ffmpeg is installed
    if ! command -v ffmpeg >/dev/null 2>&1; then
        echo "installing ffmpeg..."
        FFMPEG_VERSION="7.1"
        FFMPEG_URL="https://evermeet.cx/ffmpeg/ffmpeg-${FFMPEG_VERSION}.zip"

        # Download and extract ffmpeg
        curl -L "$FFMPEG_URL" -o ffmpeg.zip
        unzip -q ffmpeg.zip
        rm ffmpeg.zip

        # Move to local bin
        mkdir -p "$HOME/.local/bin"
        mv ffmpeg "$HOME/.local/bin/"
        chmod +x "$HOME/.local/bin/ffmpeg"

        # Remove quarantine attribute
        xattr -d com.apple.quarantine "$HOME/.local/bin/ffmpeg" 2>/dev/null || true

        echo "ffmpeg installed successfully"
    fi
fi

echo "Downloading screenpipe v${VERSION} for ${arch}-${os}..."

# Add debug output for download
echo "Downloading from URL: $URL"
if ! curl -L "$URL" -o "$FILENAME"; then
    echo "Download failed"
    exit 1
fi

# Verify download
if ! gzip -t "$FILENAME" 2>/dev/null; then
    echo "Downloaded file is not in valid gzip format"
    exit 1
fi

echo "Extracting..."
if ! tar xzf "$FILENAME"; then
    echo "Extraction failed"
    exit 1
fi

echo "Installing..."
INSTALL_DIR="$HOME/.local/screenpipe"

# Remove existing installation
rm -rf "$INSTALL_DIR"

# Create install directory
if ! mkdir -p "$INSTALL_DIR/screenpipe-vision/lib"; then
    echo "Failed to create install directory"
    exit 1
fi

# Copy files
if [ "$(uname)" = "Darwin" ]; then
    if ! cp lib/libscreenpipe_arm64.dylib "$INSTALL_DIR/screenpipe-vision/lib/"; then
        echo "Failed to copy library"
        exit 1
    fi
fi

if ! cp bin/screenpipe "$INSTALL_DIR/"; then
    echo "Failed to copy binary"
    exit 1
fi

# Fix binary linking on macOS
if [ "$(uname)" = "Darwin" ]; then
    echo "Fixing binary linking..."
    cd "$INSTALL_DIR" || exit 1

    # Remove any existing rpaths
    install_name_tool -delete_rpath "@executable_path/screenpipe-vision/lib" "./screenpipe" 2>/dev/null || true

    # Add new rpath
    install_name_tool -add_rpath "@executable_path/screenpipe-vision/lib" "./screenpipe"

    # Change the library path in the binary
    install_name_tool -change "screenpipe-vision/lib/libscreenpipe_arm64.dylib" "@rpath/libscreenpipe_arm64.dylib" "./screenpipe"

    # Also try changing the library id
    install_name_tool -id "@rpath/libscreenpipe_arm64.dylib" "$INSTALL_DIR/screenpipe-vision/lib/libscreenpipe_arm64.dylib"
fi

# Remove quarantine attributes on macOS
if [ "$(uname)" = "Darwin" ]; then
    echo "Removing quarantine attributes..."
    xattr -r -d com.apple.quarantine "$INSTALL_DIR" 2>/dev/null || true
fi

# Create symlink in user's bin directory
mkdir -p "$HOME/.local/bin"
if ! ln -sf "$INSTALL_DIR/screenpipe" "$HOME/.local/bin/screenpipe"; then
    echo "Failed to create symlink"
    exit 1
fi

echo "Adding ~/.local/bin to PATH..."

# Detect shell and update appropriate config file
SHELL_CONFIG=""
case "$SHELL" in
    */zsh)
        SHELL_CONFIG="$HOME/.zshrc"
        ;;
    */bash)
        SHELL_CONFIG="$HOME/.bashrc"
        ;;
esac

echo "SHELL_CONFIG: $SHELL_CONFIG"

if [ -n "$SHELL_CONFIG" ]; then
    echo "" >>"$SHELL_CONFIG"
    echo 'export PATH="$HOME/.local/bin:$PATH"' >>"$SHELL_CONFIG"
    echo "Please restart your terminal or run: source $SHELL_CONFIG"
else
    echo "Please add ~/.local/bin to your PATH manually"
fi

# Cleanup
cd || exit 1
rm -rf "$TMP_DIR"

echo "Installation complete!"
