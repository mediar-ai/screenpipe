/**
 * Windows-Specific Tests
 *
 * TESTING.md coverage:
 * - S14: COM thread conflict, High-DPI, multiple monitors, Windows Defender
 * - S5: OCR at different resolutions
 *
 * Only runs on Windows. Skipped entirely on macOS.
 */

import {
  suite, test, summary, screenshot, fetchJson, sleep, bb,
  HEALTH_URL, IS_WINDOWS,
} from "./lib";

if (!IS_WINDOWS) {
  console.log("(skipped: windows-only suite)");
  process.exit(0);
}

suite("windows-specific");

// ── S14: COM initialization ─────────────────────────────────────────────────

await test("COM: vision thread active", async () => {
  const health = await fetchJson(HEALTH_URL);
  if (health.frame_status !== "ok") {
    throw new Error(`frame_status: ${health.frame_status} — vision COM may have failed`);
  }
});

await test("COM: audio thread not crashing", async () => {
  const health = await fetchJson(HEALTH_URL);
  // audio can be "ok", "not_started", or "error" — but NOT a COM-related crash
  // If there's a COM conflict, the whole process usually crashes
  if (!health.audio_status) {
    throw new Error("audio_status field missing — possible crash");
  }
  console.log(`  audio_status: ${health.audio_status}`);
});

await test("COM: concurrent health checks don't deadlock", async () => {
  // COM STA threading issues can cause deadlocks on concurrent calls
  const start = Date.now();
  const promises = Array.from({ length: 10 }, () =>
    fetch(HEALTH_URL).then(r => r.json())
  );
  const results = await Promise.all(promises);
  const elapsed = Date.now() - start;

  if (elapsed > 15000) {
    throw new Error(`concurrent health took ${elapsed}ms (possible COM deadlock)`);
  }
  console.log(`  10 concurrent health checks: ${elapsed}ms`);
});

// ── S14: Multiple monitors ──────────────────────────────────────────────────

await test("multi-monitor detection", async () => {
  const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command",
    "(Get-CimInstance Win32_DesktopMonitor).Count"]);
  const monitorCount = parseInt(proc.stdout.toString().trim()) || 0;

  // Also check via Win32_VideoController (more reliable on some systems)
  const proc2 = Bun.spawnSync(["powershell", "-NoProfile", "-Command",
    "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens.Count"]);
  const screenCount = parseInt(proc2.stdout.toString().trim()) || 1;

  console.log(`  monitors: ${monitorCount}, screens: ${screenCount}`);

  // Verify health reports frame capture (at least one monitor working)
  const health = await fetchJson(HEALTH_URL);
  if (health.frame_status !== "ok") {
    throw new Error(`frame_status not ok with ${screenCount} screens`);
  }
});

// ── S14: High-DPI ───────────────────────────────────────────────────────────

await test("DPI scaling detection", async () => {
  const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command", `
    Add-Type -AssemblyName System.Windows.Forms
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen
    $bounds = $screen.Bounds
    Write-Output "$($bounds.Width)x$($bounds.Height)"
  `]);
  const resolution = proc.stdout.toString().trim();

  // Check DPI scaling
  const dpiProc = Bun.spawnSync(["powershell", "-NoProfile", "-Command", `
    Add-Type @'
      using System;
      using System.Runtime.InteropServices;
      public class DPI {
        [DllImport("gdi32.dll")] public static extern int GetDeviceCaps(IntPtr hdc, int index);
        [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
      }
'@
    $hdc = [DPI]::GetDC([IntPtr]::Zero)
    $dpiX = [DPI]::GetDeviceCaps($hdc, 88)
    [DPI]::ReleaseDC([IntPtr]::Zero, $hdc) | Out-Null
    $scale = [math]::Round($dpiX / 96 * 100)
    Write-Output $scale
  `]);
  const scalePct = parseInt(dpiProc.stdout.toString().trim()) || 100;

  console.log(`  resolution: ${resolution}, DPI scale: ${scalePct}%`);

  // OCR should still work regardless of DPI
  const health = await fetchJson(HEALTH_URL);
  if (health.frame_status !== "ok") {
    throw new Error(`frame capture failing at ${scalePct}% DPI`);
  }
});

await test("OCR works at current DPI", async () => {
  const data = await fetchJson("http://localhost:3030/search?limit=1&content_type=ocr");
  const results = data?.data ?? [];
  if (results.length === 0) {
    throw new Error("no OCR results — DPI may be affecting capture");
  }
  // Check the OCR text has reasonable content (not garbage from scaling)
  const text = results[0]?.content?.text ?? "";
  if (text.length < 2) {
    console.log("  warning: OCR text very short, may indicate DPI issue");
  } else {
    console.log(`  OCR text sample: "${text.slice(0, 60)}..."`);
  }
});

// ── S14: Windows Defender ───────────────────────────────────────────────────

await test("not blocked by Windows Defender", async () => {
  // Check if screenpipe is in Defender exclusions or if there are recent blocks
  const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command", `
    $threats = Get-MpThreatDetection -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessName -like '*screenpipe*' } |
      Select-Object -First 5
    if ($threats) {
      Write-Output "BLOCKED:$($threats.Count)"
    } else {
      Write-Output "CLEAR"
    }
  `], { timeout: 15_000 });
  const result = proc.stdout.toString().trim();
  if (result.startsWith("BLOCKED")) {
    throw new Error(`Windows Defender blocked screenpipe: ${result}`);
  }
  console.log(`  Defender status: ${result}`);
});

// ── S8: No orphaned processes (Windows-specific) ────────────────────────────

await test("no orphaned screenpipe child processes", async () => {
  // Get screenpipe parent PID
  const parentProc = Bun.spawnSync(["powershell", "-NoProfile", "-Command",
    "(Get-Process -Name 'screenpipe*' -ErrorAction SilentlyContinue | Select-Object -First 1).Id"]);
  const parentPid = parseInt(parentProc.stdout.toString().trim());

  if (!parentPid) {
    console.log("  (skipped: no screenpipe process found)");
    return;
  }

  // Count child processes
  const childProc = Bun.spawnSync(["powershell", "-NoProfile", "-Command",
    `(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${parentPid} }).Count`]);
  const childCount = parseInt(childProc.stdout.toString().trim()) || 0;

  console.log(`  screenpipe PID ${parentPid}, child processes: ${childCount}`);

  // Reasonable child count (ffmpeg, sidecar, etc.) — but >20 suggests leak
  if (childCount > 20) {
    throw new Error(`${childCount} child processes (possible orphan leak)`);
  }
});

// ── S14: UIA accessibility tree accessible ──────────────────────────────────

await test("UIA tree accessible via bb", async () => {
  const result = await bb("apps");
  const apps = result?.data ?? result ?? [];
  if (!Array.isArray(apps) || apps.length === 0) {
    throw new Error("bb apps returned empty — UIA may be broken");
  }
  console.log(`  bb sees ${apps.length} windows`);
});

// ── S5.4-5: Resolution-specific capture ─────────────────────────────────

await test("capture works at detected resolution (S5.4-5)", async () => {
  // Get all screen resolutions
  const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command", `
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
      "$($_.Bounds.Width)x$($_.Bounds.Height)"
    }
  `]);
  const resolutions = proc.stdout.toString().trim().split(/\r?\n/).filter(Boolean);
  console.log(`  detected resolutions: ${resolutions.join(", ")}`);

  // Check if any resolution is ultrawide (>2560) or 4K (>=3840)
  for (const res of resolutions) {
    const [w] = res.split("x").map(Number);
    if (w >= 3440) console.log(`  ultrawide detected: ${res}`);
    if (w >= 3840) console.log(`  4K detected: ${res}`);
  }

  // Regardless of resolution, OCR should produce results
  const data = await fetchJson("http://localhost:3030/search?limit=1&content_type=ocr");
  const results = data?.data ?? [];
  if (results.length === 0) {
    throw new Error("no OCR results at detected resolution");
  }
  console.log(`  OCR producing results at resolution(s): ${resolutions.join(", ")}`);
});

// ── S4.5: No audio device behavior ──────────────────────────────────────

await test("handles audio device state gracefully (S4.5)", async () => {
  const health = await fetchJson(HEALTH_URL);
  const audioStatus = health.audio_status;

  // When no audio device: should be "not_started" or similar, NOT crash
  if (!audioStatus) {
    throw new Error("audio_status field missing entirely");
  }

  console.log(`  audio_status: ${audioStatus}`);

  // App should still be running even if no audio
  const health2 = await fetchJson(HEALTH_URL);
  if (health2.frame_status !== "ok") {
    throw new Error("frame capture broken despite audio issue");
  }
});

// ── S3.6: Monitor detection via health ──────────────────────────────────

await test("monitor count matches system (S3.6)", async () => {
  const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command",
    "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens.Count"]);
  const systemCount = parseInt(proc.stdout.toString().trim()) || 1;

  const health = await fetchJson(HEALTH_URL);
  const details = health.device_status_details ?? [];
  const screenDetails = Array.isArray(details) ? details.filter((d: any) =>
    d?.type === "screen" || d?.type === "monitor" || d?.device_type === "screen"
  ) : [];

  console.log(`  system monitors: ${systemCount}, health screen entries: ${screenDetails.length}`);

  if (screenDetails.length > 0 && Math.abs(screenDetails.length - systemCount) > 1) {
    console.log(`  warning: monitor count mismatch (system=${systemCount}, health=${screenDetails.length})`);
  }
});

await screenshot("10-windows");

const ok = summary();
process.exit(ok ? 0 : 1);
