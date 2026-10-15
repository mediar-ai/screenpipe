# Meeting provider icons

<!-- doc-covers: none -->

The native shortcut notification embeds 48 px PNGs in `MeetingJoinProvider` in
`apps/screenpipe-app-tauri/src-tauri/swift/shortcut_reminder.swift`. They display
at 18 points, use the actual join URL to select a service, and require no runtime
network request or installed meeting app. Unknown services use an SF Symbols
video icon. The original action label and destination remain unchanged. The shared Windows/Linux card uses the same PNGs from `apps/screenpipe-app-tauri/public/images/meeting-providers/`, with the same hostname matching and generic video fallback.

Sources:

- Google Meet: existing `apps/screenpipe-app-tauri/public/images/google-meet.png`.
- Zoom: [SVG Logos zoom-icon.svg](https://github.com/gilbarbara/logos/blob/4a5b550414be64d5c007574cd395d910d50e8950/logos/zoom-icon.svg).
- Microsoft Teams: [SVG Logos microsoft-teams.svg](https://github.com/gilbarbara/logos/blob/4a5b550414be64d5c007574cd395d910d50e8950/logos/microsoft-teams.svg).
- Webex: [Simple Icons webex.svg](https://github.com/simple-icons/simple-icons/blob/4d29a35c954699b389a834aacc97dd6e7e74143c/icons/webex.svg).

SVG Logos and Simple Icons distribute these assets under CC0-1.0. Product names
and logos remain trademarks of their respective owners. SVGs were rasterized
with AppKit, preserving aspect ratio in a transparent 48 x 48 canvas, then
encoded as base64 PNGs. Google Meet was resized from the existing PNG the same way.
