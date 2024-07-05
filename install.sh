#!/bin/sh

# Define the GitHub repository
REPO="louis030195/screen-pipe"

# Get the latest release
LATEST_RELEASE=$(curl -s https://api.github.com/repos/$REPO/releases/latest | grep "tag_name" | cut -d '"' -f 4)

# Determine the OS and architecture
OS=$(uname -s)
ARCH=$(uname -m)

# Set the appropriate binary name based on OS and architecture
case $OS in
    Linux*)
        case $ARCH in
            x86_64) BINARY="screenpipe-linux.tar.gz";;
            *) echo "Unsupported architecture: $ARCH"; exit 1;;
        esac
        ;;
    Darwin*)
        case $ARCH in
            arm64) BINARY="screenpipe-macos";;
            *) echo "Unsupported architecture: $ARCH"; exit 1;;
        esac
        ;;
    *)
        echo "Unsupported OS: $OS"; exit 1;;
esac

# Create the local bin directory if it doesn't exist
mkdir -p $HOME/.local/bin

echo "Downloading $BINARY"

if [ "$OS" = "Linux" ]; then
    # Download and extract the tarball for Linux
    curl -L "https://github.com/$REPO/releases/download/$LATEST_RELEASE/$BINARY" -o /tmp/screenpipe-linux.tar.gz
    tar -xzvf /tmp/screenpipe-linux.tar.gz -C $HOME/.local/bin
    mv $HOME/.local/bin/screenpipe-linux/* $HOME/.local/bin/
    rm -rf $HOME/.local/bin/screenpipe-linux /tmp/screenpipe-linux.tar.gz
    chmod +x $HOME/.local/bin/screenpipe
else
    # Download the binary for macOS
    curl -L "https://github.com/$REPO/releases/download/$LATEST_RELEASE/$BINARY" -o $HOME/.local/bin/screenpipe
    chmod +x $HOME/.local/bin/screenpipe
fi

echo "screenpipe installed successfully! Please add $HOME/.local/bin to your PATH if it's not already included."