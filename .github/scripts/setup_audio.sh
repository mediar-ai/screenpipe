#!/bin/bash
pulseaudio --kill || true
sleep 2
pulseaudio --start --log-target=syslog --system=false --disallow-exit --exit-idle-time=-1 --daemon
pulseaudio --check
pactl load-module module-null-sink sink_name=virtual_speaker
pactl set-default-sink virtual_speaker
pactl load-module module-virtual-source source_name=virtual_mic master=virtual_speaker.monitor
pactl set-default-source virtual_mic
echo "defaults.pcm.card 0" > ~/.asoundrc
echo "defaults.ctl.card 0" >> ~/.asoundrc
pactl list short sinks
pactl list short sources
pactl info
