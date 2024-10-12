#!/bin/bash
Xvfb :99 -ac -screen 0 1280x1024x24 &
echo "DISPLAY=:99" >> $GITHUB_ENV
sleep 3
export DISPLAY=:99
mkdir -p ~/.config/openbox
echo '<openbox_config><menu><file>menu.xml</file></menu></openbox_config>' > ~/.config/openbox/rc.xml
openbox --config-file ~/.config/openbox/rc.xml &
sleep 3
xterm -fa 'Liberation Mono' -fs 10 -e "while true; do echo 'Keeping xterm open'; sleep 60; done" &
sleep 3
xdpyinfo || echo "xdpyinfo failed"
xrandr || echo "xrandr failed"
xwininfo -root -children || echo "xwininfo failed"
