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

echo "fetching latest version from github..."
LATEST_RELEASE=$(curl -s https://api.github.com/repos/mediar-ai/screenpipe/releases/latest)
VERSION=$(echo "$LATEST_RELEASE" | grep -o '"tag_name": "v[^"]*"' | cut -d'"' -f4 | sed 's/^v//')

if [ -z "$VERSION" ]; then
    echo "failed to fetch latest version"
    exit 1
fi

echo "latest version: $VERSION"

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
    xcode-select -p &>/dev/null
    if [ $? -ne 0 ]; then
        echo "command line tools for xcode not found. installing from softwareupdate…"
        touch /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
        PROD=$(softwareupdate -l | grep "\*.*Command Line" | tail -n 1 | sed 's/^[^C]* //')
        softwareupdate -i "$PROD" --verbose
    else
        echo "command line tools for xcode have been installed."
    fi

    # Check if ffmpeg is installed
    if ! command -v ffmpeg >/dev/null 2>&1; then
        echo "installing ffmpeg..."

        if [ "$arch" = "aarch64" ]; then
            FFMPEG_URL="https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip"
        else
            FFMPEG_URL="https://ffmpeg.martin-riedl.de/redirect/latest/macos/amd64/release/ffmpeg.zip"
        fi

        echo "downloading ffmpeg from: $FFMPEG_URL"
        if ! curl -sL "$FFMPEG_URL" -o ffmpeg.zip; then
            echo "failed to download ffmpeg"
            exit 1
        fi

        if ! unzip -q ffmpeg.zip; then
            echo "failed to extract ffmpeg"
            exit 1
        fi
        rm ffmpeg.zip

        # Verify code signing on macOS
        echo "verifying code signature..."
        if ! codesign -v ./ffmpeg 2>/dev/null; then
            echo "warning: binary is not signed or signature is invalid"
            read -p "do you want to continue anyway? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo "installation aborted"
                exit 1
            fi
        fi

        # Verify the binary runs and check version
        echo "verifying binary..."
        if ! FFMPEG_VERSION=$(./ffmpeg -version | head -n1); then
            echo "binary verification failed"
            exit 1
        fi
        echo "detected version: $FFMPEG_VERSION"

        # Move to local bin
        mkdir -p "$HOME/.local/bin"
        mv ffmpeg "$HOME/.local/bin/"
        chmod +x "$HOME/.local/bin/ffmpeg"

        # Remove quarantine attribute
        xattr -d com.apple.quarantine "$HOME/.local/bin/ffmpeg" 2>/dev/null || true

        echo "ffmpeg installed successfully"
    fi
fi

# Install Bun if not present
if ! command -v bun >/dev/null 2>&1; then
    echo "installing bun..."
    if [ "$(uname)" = "Darwin" ] || [ "$os" = "unknown-linux-gnu" ]; then
        curl -fsSL https://bun.sh/install | bash
        
        # Source the updated profile to make bun available
        if [ -f "$HOME/.bashrc" ]; then
            . "$HOME/.bashrc"
        elif [ -f "$HOME/.zshrc" ]; then
            . "$HOME/.zshrc"
        fi
        
        echo "bun installed successfully"
    else
        echo "error: unsupported operating system for bun installation"
        exit 1
    fi
fi

echo "downloading screenpipe v${VERSION} for ${arch}-${os}..."

# Add debug output for download
echo "downloading from url: $URL"
if ! curl -sL "$URL" -o "$FILENAME"; then
    echo "download failed"
    exit 1
fi

# Verify download
if ! gzip -t "$FILENAME" 2>/dev/null; then
    echo "downloaded file is not in valid gzip format"
    exit 1
fi

echo "extracting..."
if ! tar xzf "$FILENAME"; then
    echo "extraction failed"
    exit 1
fi

echo "installing..."
INSTALL_DIR="$HOME/.local/screenpipe"

# Remove existing installation
rm -rf "$INSTALL_DIR"

# Create install directory
if ! mkdir -p "$INSTALL_DIR/screenpipe-vision/lib"; then
    echo "Failed to create install directory"
    exit 1
fi


# Copy binary
if ! cp bin/screenpipe "$INSTALL_DIR/"; then
    echo "Failed to copy binary"
    exit 1
fi

# Remove quarantine attributes on macOS
if [ "$(uname)" = "Darwin" ]; then
    echo "removing quarantine attributes..."
    xattr -r -d com.apple.quarantine "$INSTALL_DIR" 2>/dev/null || true
fi

# Create symlink in user's bin directory
mkdir -p "$HOME/.local/bin"
if ! ln -sf "$INSTALL_DIR/screenpipe" "$HOME/.local/bin/screenpipe"; then
    echo "Failed to create symlink"
    exit 1
fi

echo "adding ~/.local/bin to path..."

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

echo "shell_config: $SHELL_CONFIG"

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

echo "
███████╗ ██████╗██████╗ ███████╗███████╗███╗   ██╗██████╗ ██╗██████╗ ███████╗
██╔════╝██╔════╝██╔══██╗██╔════╝██╔════╝████╗  ██║██╔══██╗██║██╔══██╗██╔════╝
███████╗██║     ██████╔╝█████╗  █████╗  ██╔██╗ ██║██████╔╝██║██████╔╝█████╗  
╚════██║██║     ██╔══██╗██╔══╝  ██╔══╝  ██║╚██╗██║██╔═══╝ ██║██╔═══╝ ██╔══╝  
███████║╚██████╗██║  ██║███████╗███████╗██║ ╚████║██║     ██║██║     ███████╗
╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═══╝╚═╝     ╚═╝╚═╝     ╚══════╝
"

echo "installation complete! 🚀"
echo "to get started:"
echo "1. restart your terminal or run: source $SHELL_CONFIG"
echo "2. run: screenpipe"
echo "3. allow permissions on macos (screen, mic) if needed"
echo ""
echo "╭──────────────────────────────────────────╮"
echo "│  join our discord:                       │"
echo "│  --> https://discord.gg/dU9EBuw7Uq       │"
echo "│                                          │"
echo "│  check the docs:                         │"
echo "│  --> https://docs.screenpi.pe            │"
echo "╰──────────────────────────────────────────╯"
