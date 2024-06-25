#!/bin/sh

# Define the GitHub repository
REPO="louis030195/screen-pipe"

# Get the latest release
LATEST_RELEASE=$(curl -s https://api.github.com/repos/$REPO/releases/latest | grep "tag_name" | cut -d '"' -f 4)

# Download the latest release binary
curl -L "https://github.com/$REPO/releases/download/$LATEST_RELEASE/screenpipe" -o /usr/local/bin/screenpipe

# Make the binary executable
chmod +x /usr/local/bin/screenpipe

echo "screenpipe installed successfully!"