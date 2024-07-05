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

echo "screenpipe installed successfully!"

# Ask user if they want to add the directory to PATH
printf "Do you want to add $HOME/.local/bin to your PATH? (y/n): "
read add_to_path

if [ "$add_to_path" = "y" ] || [ "$add_to_path" = "Y" ]; then
    # Determine the shell configuration file
    if [ -n "$BASH_VERSION" ]; then
        config_file="$HOME/.bashrc"
    elif [ -n "$ZSH_VERSION" ]; then
        config_file="$HOME/.zshrc"
    else
        echo "Unsupported shell. Please add the following line to your shell configuration file manually:"
        echo "export PATH=\"\$HOME/.local/bin:\$PATH\""
        exit 0
    fi

    # Add the PATH modification to the shell configuration file
    echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$config_file"
    echo "Added $HOME/.local/bin to your PATH in $config_file"
    echo "Please run 'source $config_file' or start a new terminal session for the changes to take effect."
else
    echo "If you want to add screenpipe to your PATH later, add the following line to your shell configuration file:"
    echo "export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

echo "Installation complete!"