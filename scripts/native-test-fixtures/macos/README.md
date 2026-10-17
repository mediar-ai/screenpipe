# Isolated macOS multi-display acceptance

Run only in a disposable, logged-in Mac VM. This fixture creates real WindowServer
virtual displays with private CGVirtualDisplay APIs, changes their arrangement,
warps the guest cursor, and places synthetic red/blue marker windows. It must
never run on a working user's desktop. It requires the exact opt-in
`SCREENPIPE_ISOLATED_VM_TEST=1` and removes its display when its process exits.
The private API declarations originate from Chromium; see `CHROMIUM-LICENSE`.

Build the fixture on macOS with ARC (required for display ownership/cleanup):

```sh
clang++ -fobjc-arc -framework Cocoa -framework CoreGraphics \
  -framework ApplicationServices -mmacosx-version-min=15.0 \
  scripts/native-test-fixtures/macos/display-fixture.mm \
  -o display-fixture
cargo test -p screenpipe-engine --test native_multi_monitor --no-run
cargo test -p screenpipe-a11y --lib --no-run
```

Transfer the corresponding native test binaries and helper to the guest. Grant
Screen Recording and Accessibility/Input Monitoring to the guest test processes
using the disposable VM's test-permission setup. No host permission changes.

```sh
SCREENPIPE_ISOLATED_VM_TEST=1 \
SCREENPIPE_DISPLAY_FIXTURE=/absolute/path/display-fixture \
SCREENPIPE_VM_EVIDENCE_DIR=/absolute/path/frames \
./native_multi_monitor
```

The manual executable uses the production standalone main-thread AppKit loop,
including immediate completion, error and panic cleanup checks. It skips without
the explicit VM opt-in and is not a new CI job.

The engine test asserts actual display geometry (right, negative-left, above,
offset), cursor positions, production tracker/controller attribution, distinct
red/blue capture content, stale-topology grace/recovery, focused-secondary removal,
Retina backing scale, native-resolution pixels, 1280/1920 capture caps, actual
1920x1080 HD frames, native CoreGraphics fallback width caps, mixed-DPI focus boundaries, same-ID 1x/2x mode changes,
and display cleanup. The helper accepts `mode-standard` and `mode-retina` to
change backing scale without replacing the display. It reports an OS-clamped literal
cursor-gap attempt as unsupported, never as a passing gap reproduction. The
stale-topology case rearranges the actual display while intentionally withholding
discovery, waits through the real grace, and verifies recovery after fresh
production enumeration without moving the cursor. It calls fresh production
monitor enumeration explicitly, so it does not test the automatic monitor-watcher
loop.
It checks the health predicate, not the live HTTP endpoint or packaged UI.

For cross-display typing, keep the helper running and send `layout X Y` through
its stdin. Each line returns JSON topology. Verify the requested layout and two
unmirrored displays, then run each native recorder acceptance with:

```sh
SCREENPIPE_ISOLATED_VM_TEST=1 \
SCREENPIPE_DISPLAY_FIXTURE=/absolute/path/display-fixture \
SCREENPIPE_E2E_DISPLAY_ORIGINS=0,0,1024,400 \
./a11y-tests --ignored live_recorder_keeps --nocapture
# Repeat with filter live_recorder_does_not to verify excluded-app handling.
```

Choose the origins from the actual topology; do not assume the example fits
another guest. The recorder test verifies actual AX window positions and distinct
native display membership. It explicitly controls synthetic modifiers and bounds
helper execution. Native input acceptance still allows 150ms observer settling.

Stop and reap the fixture process and verify only the base display remains.
Destroy the disposable guest and task-owned tunnels after collecting evidence.
These tests do not establish physical cable/dock behavior, persisted-frame app
attribution, packaged UI warnings or the customer's exact hardware incident.

For the actual standalone recorder, use a fresh output directory and the same VM
permissions. This verifies the automatic monitor watcher, persisted snapshots at
1x/2x, the live health response, SQLite integrity and SIGINT shutdown:

```sh
SCREENPIPE_ISOLATED_VM_TEST=1 python3 recorder-acceptance.py \
  --engine /absolute/path/screenpipe --fixture /absolute/path/display-fixture \
  --output /absolute/path/new-cli-evidence
```

The recorder disables audio and telemetry. This is a screen-capture test; it does
not validate audio, ffmpeg encoding or packaged desktop UI. Its database is read
only after the recorder exits, respecting the process-exclusive macOS VFS.
