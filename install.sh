#!/bin/sh

# Define the GitHub repository
REPO="louis030195/screen-pipe"

# Get the latest release
LATEST_RELEASE=$(curl -s https://api.github.com/repos/$REPO/releases/latest | grep "tag_name" | cut -d '"' -f 4)

# Determine the OS and set the appropriate binary name
OS=$(uname -s)
case $OS in
    Linux*)     BINARY="screenpipe-linux";;
    Darwin*)    BINARY="screenpipe-macos";;
    *)          echo "Unsupported OS: $OS"; exit 1;;
esac

# Create the local bin directory if it doesn't exist
mkdir -p $HOME/.local/bin

# Download the latest release binary to the local bin directory
curl -L "https://github.com/$REPO/releases/download/$LATEST_RELEASE/$BINARY" -o $HOME/.local/bin/screenpipe

# Make the binary executable
chmod +x $HOME/.local/bin/screenpipe

echo "screenpipe installed successfully! Please add $HOME/.local/bin to your PATH if it's not already included."