

## screenpipe-universal

captures video and audio from any device that supports HDMI (mac, pc, iphone, android, tv, etc.)

and build the context for AGI

### Create a systemd service file:
```
[Unit]
Description=screenpipe universal capture service
After=network.target bluetooth.target
Wants=bluetooth.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/screenpipe-universal
Restart=always
RestartSec=3
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
```
