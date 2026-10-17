#!/usr/bin/env python3
# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Verify real CLI capture, automatic topology refresh, persistence and shutdown.

Run only in a disposable logged-in macOS VM with capture permissions already set.
The output directory must be new. No permission or account configuration is changed.
"""
import argparse
import json
import os
from pathlib import Path
import select
import signal
import sqlite3
import subprocess
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", required=True)
    parser.add_argument("--fixture", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--port", type=int, default=3049)
    args = parser.parse_args()
    if os.environ.get("SCREENPIPE_ISOLATED_VM_TEST") != "1":
        parser.error("requires SCREENPIPE_ISOLATED_VM_TEST=1 in a disposable VM")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    data = output / "recorder-data"
    data.mkdir()
    env = dict(os.environ, RUST_LOG="screenpipe_engine=info,screenpipe_screen=debug,sck_rs=debug")
    fixture = recorder = None
    snapshots = []
    with (output / "recorder.log").open("w") as log:
        try:
            fixture = subprocess.Popen(
                [args.fixture], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                text=True, env=env,
            )

            def topology(command=None):
                if command:
                    fixture.stdin.write(command + "\n")
                    fixture.stdin.flush()
                assert select.select([fixture.stdout], [], [], 15)[0], "fixture timed out"
                value = json.loads(fixture.stdout.readline())
                print("TOPOLOGY", command, json.dumps(value), flush=True)
                return value

            initial = topology()
            command = [
                args.engine, "record", "--disable-audio", "--disable-telemetry",
                "--data-dir", str(data), "--port", str(args.port),
                "--video-quality", "max", "--capture-max-width", "0",
                "--use-pii-removal=false", "--idle-capture-interval-ms", "1000",
                "--recording-detail", "more_detail",
            ]
            recorder = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env=env)
            print("CLI_PID", recorder.pid, "ARGS", command, flush=True)

            def boundary():
                return int(time.time() * 1000)

            def wait_frame(label, display, dimensions, after):
                # The recorder uses an exclusive SQLite VFS. Inspect its fsynced
                # images while live, then verify all DB references after shutdown.
                deadline = time.monotonic() + 100
                seen = set()
                while time.monotonic() < deadline:
                    assert recorder.poll() is None, f"recorder exited {recorder.returncode}"
                    candidates = sorted(
                        (path for path in data.rglob(f"*_m{display}.jpg")
                         if int(path.name.split("_")[0]) > after), reverse=True,
                    )[:12]
                    for path in candidates:
                        if path in seen:
                            continue
                        # Only remember a candidate once the writer closed it.
                        probe = subprocess.run(
                            ["/usr/bin/sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
                            text=True, capture_output=True, timeout=10,
                        )
                        if probe.returncode:
                            continue
                        seen.add(path)
                        actual = tuple(int(line.split(":")[1]) for line in probe.stdout.splitlines()
                                       if "pixelWidth:" in line or "pixelHeight:" in line)
                        print("FRAME", label, str(path), actual, flush=True)
                        if actual == dimensions:
                            snapshots.append({"phase": label, "path": str(path), "dimensions": actual})
                            print("PASS", label, flush=True)
                            return
                    time.sleep(1)
                raise AssertionError(f"no {dimensions} frame for {label}")

            primary = next(d for d in initial["displays"] if d["main"])
            width = int(primary["w"])
            topology(f"layout {width} 0")
            topology(f"warp {width + 100} 100")
            wait_frame("initial-1x", initial["extra"], (1280, 720), 0)
            after = boundary()
            topology("remove")
            topology("warp 100 100")
            wait_frame("hot-unplug-primary", primary["id"], (width, int(primary["h"])), after)
            after = boundary()
            retina = topology("add-retina")
            secondary = retina["extra"]
            topology(f"layout {width} 0")
            topology(f"warp {width + 100} 100")
            wait_frame("hot-add-retina", secondary, (2560, 1440), after)
            for mode, size in [("mode-standard", (1280, 720)), ("mode-retina", (2560, 1440))]:
                after = boundary()
                changed = topology(mode)
                assert changed["extra"] == secondary, "mode switch replaced display ID"
                topology(f"warp {width + 100} 100")
                wait_frame(mode, secondary, size, after)
            with urllib.request.urlopen(f"http://127.0.0.1:{args.port}/health", timeout=10) as response:
                health = json.load(response)
            assert health["status"] == "healthy" and health["frame_status"] == "ok", health
            print("HEALTH", health["status"], health["frame_status"], flush=True)
            recorder.send_signal(signal.SIGINT)
            code = recorder.wait(timeout=40)
            assert code == 0, f"unclean recorder shutdown: {code}"
            print("CLI_EXIT", code, flush=True)
            # Use the product verifier, which registers the hybrid storage
            # functions and checks payloads as well as SQLite integrity.
            verify = subprocess.run([args.engine, "db", "check"],
                                    env=dict(env, SCREENPIPE_DATA_DIR=str(data)),
                                    text=True, capture_output=True, timeout=60)
            (output / "storage-check.log").write_text(verify.stdout + verify.stderr)
            assert verify.returncode == 0, verify.stdout + verify.stderr
            # New installs use a versioned hybrid index; existing installs may
            # still use the legacy db.sqlite. Follow the active descriptor.
            descriptor = data / "storage.json"
            database = data / "db.sqlite"
            if descriptor.exists():
                database = (data / json.loads(descriptor.read_text())["index"]).resolve()
                assert data in database.parents, "index escaped fixture data directory"
            wal = Path(str(database) + "-wal")
            assert not wal.exists() or wal.stat().st_size == 0, "shutdown left uncheckpointed WAL"
            # With the process gone and no WAL, immutable avoids macOS SQLite
            # trying to create shared-memory sidecars through a read-only handle.
            with sqlite3.connect(f"file:{database}?mode=ro&immutable=1", uri=True) as db:
                for snapshot in snapshots:
                    count = db.execute("select count(*) from frames where snapshot_path=?",
                                       (snapshot["path"],)).fetchone()[0]
                    assert count > 0, f"snapshot lacks durable frame row: {snapshot}"
                rows = db.execute("select count(*) from frames").fetchone()[0]
            result = {"status": "passed", "snapshots": snapshots, "durable_rows": rows,
                      "integrity": "ok", "exit_code": code, "health": health["status"]}
            (output / "result.json").write_text(json.dumps(result, indent=2) + "\n")
            print("PASS actual CLI record, automatic hotplug/scale refresh, five durable phase snapshots, integrity and SIGINT", flush=True)
        finally:
            if recorder and recorder.poll() is None:
                recorder.send_signal(signal.SIGINT)
                try:
                    recorder.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    recorder.kill()
                    recorder.wait()
            if fixture and fixture.poll() is None:
                fixture.kill()
                fixture.wait()


if __name__ == "__main__":
    main()
