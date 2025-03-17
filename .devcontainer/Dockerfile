# Use the specified base image
FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04

# Switch to the vscode user
USER vscode

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Update package lists and install dependencies
RUN sudo apt-get update && sudo apt-get install -y \
    g++ \
    ffmpeg \
    tesseract-ocr \
    cmake \
    libavformat-dev \
    libavfilter-dev \
    libavdevice-dev \
    libssl-dev \
    libtesseract-dev \
    libxdo-dev \
    libsdl2-dev \
    libclang-dev \
    libxtst-dev \
    libx11-dev \
    libxext-dev \
    libxrandr-dev \
    libxinerama-dev \
    libxcursor-dev \
    libxi-dev \
    libgl1-mesa-dev \
    libasound2-dev \
    libpulse-dev \
    curl \
    pkg-config \
    libsqlite3-dev \
    sqlite3 \
    libbz2-dev \
    zlib1g-dev \
    libonig-dev \
    libayatana-appindicator3-dev \
    libsamplerate-dev \
    libwebrtc-audio-processing-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    librsvg2-dev \
    patchelf \
    xvfb \
    x11-utils \
    x11-xserver-utils \
    x11-apps \
    xdotool \
    openbox \
    xterm \
    fonts-liberation \
    imagemagick \
    fonts-dejavu \
    alsa-utils \
    pulseaudio \
    pulseaudio-utils \
    && sudo apt-get clean \
    && sudo rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

EXPOSE 3000 3030
