#!/bin/bash

# Start virtual display
Xvfb :99 -screen 0 1024x768x16 &

# Start VNC server
x11vnc -display :99 -nopw -forever &

# Start PulseAudio server
pulseaudio --start

# Run the tests
cargo test --release -- --test-threads=1