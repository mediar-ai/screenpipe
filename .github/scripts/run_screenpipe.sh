#!/bin/bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export PULSE_SERVER=unix:${XDG_RUNTIME_DIR}/pulse/native
./target/release/screenpipe --debug > screenpipe_output.log 2>&1 &
SCREENPIPE_PID=$!
echo $SCREENPIPE_PID > screenpipe.pid
sleep 60
