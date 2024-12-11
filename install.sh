#!/bin/bash

set -e

echo "Installing Screenpipe..."

BASE_URL="https://api.github.com/repos/mediar-ai/screenpipe/releases"
DESTINATION=${SCREENPIPE_PATH:-"$HOME/screenpipe"}
TEMP_DIR=$(mktemp -d)

# Detect operating system and architecture
OS=$(uname -s)
ARCH=$(uname -m)
case $OS in
"Darwin")
  if [[ "$ARCH" == "arm64" ]]; then
    PATTERN="aarch64-apple-darwin"
  else
    PATTERN="x86_64-apple-darwin"
  fi
  ;;
"Linux")
  PATTERN="x86_64-unknown-linux-gnu"
  ;;
*)
  echo "Error: Unsupported operating system $OS"
  exit 1
  ;;
esac

# Fetch the latest release dynamically
echo "Fetching the latest release information from GitHub..."
RELEASE_INFO=$(curl -fsSL "$BASE_URL")
LATEST_RELEASE=$(echo "$RELEASE_INFO" | jq -r 'map(select(.prerelease == false)) | first | .tag_name')

if [[ -z "$LATEST_RELEASE" ]]; then
  echo "Error: No stable releases found."
  exit 1
fi

# Find the correct asset for the current OS and ARCH
echo "Searching for the correct asset for $OS ($ARCH)..."
DOWNLOAD_URL=$(echo "$RELEASE_INFO" | jq -r --arg PATTERN "$PATTERN" '
  map(select(.prerelease == false)) | first | .assets[] | select(.name | contains($PATTERN)) | .browser_download_url
')

if [[ -z "$DOWNLOAD_URL" ]]; then
  echo "Error: No matching asset found for $OS ($ARCH) in release $LATEST_RELEASE."
  exit 1
fi

echo "Downloading Screenpipe from $DOWNLOAD_URL..."
TEMP_FILE="$TEMP_DIR/screenpipe"
curl -fsSL "$DOWNLOAD_URL" -o "$TEMP_FILE"

# Create installation directory
INSTALL_DIR="$DESTINATION/bin"
if [[ ! -d "$INSTALL_DIR" ]]; then
  echo "Creating installation directory at $INSTALL_DIR..."
  mkdir -p "$INSTALL_DIR"
fi

# Handle extraction if necessary
echo "Extracting Screenpipe..."
if [[ "$DOWNLOAD_URL" == *.zip ]]; then
  echo "Unzipping Screenpipe..."
  unzip "$TEMP_FILE" -d "$TEMP_DIR"
  BIN_FILE=$(find "$TEMP_DIR" -type f -name "screenpipe" | head -n 1)
elif [[ "$DOWNLOAD_URL" == *.tar.gz ]]; then
  echo "Extracting Screenpipe tarball..."
  tar -xzvf "$TEMP_FILE" -C "$TEMP_DIR"
  BIN_FILE=$(find "$TEMP_DIR" -type f -name "screenpipe" | head -n 1)
else
  BIN_FILE="$TEMP_FILE"
fi

# Move binary to destination
echo "Installing Screenpipe to $INSTALL_DIR..."
mv "$BIN_FILE" "$INSTALL_DIR/screenpipe"
chmod +x "$INSTALL_DIR/screenpipe"

# Add to PATH if necessary
if [[ ! ":$PATH:" == *":$INSTALL_DIR:"* ]]; then
  echo "Adding $INSTALL_DIR to PATH..."
  echo "export PATH=\$PATH:$INSTALL_DIR" >> "$HOME/.bashrc"
  export PATH="$PATH:$INSTALL_DIR"
fi

# Install bun
echo "Installing bun..."
curl -fsSL https://bun.sh/install | bash

# Verify installation
if command -v screenpipe > /dev/null; then
  echo "Screenpipe installed successfully!"
  echo "Run 'screenpipe --help' to get started."
else
  echo "Error: Screenpipe installation failed."
  exit 1
fi

# Cleanup
rm -rf "$TEMP_DIR"
echo "Installation completed."
