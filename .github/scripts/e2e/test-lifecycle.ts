/**
 * App Lifecycle & Process Tests
 *
 * TESTING.md coverage:
 * - S8: Clean quit, force quit recovery, port conflict, orphaned processes
 * - S9: DB integrity after crash, concurrent DB access
 * - S14: COM thread conflict (Windows)
 *
 * These tests kill and restart screenpipe, so they run LAST.
 */

import {
  suite, test, summary, screenshot, fetchJson, sleep,
  HEALTH_URL, IS_WINDOWS, IS_MACOS, isScreenpipeRunning,
} from "./lib";

suite("lifecycle & stability");

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Get list of screenpipe-related PIDs */
function getScreenpipePids(): number[] {
  if (IS_WINDOWS) {
    const proc = Bun.spawnSync([
      "powershell", "-NoProfile", "-Command",
      "Get-Process -Name 'screenpipe*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id",
    ]);
    return proc.stdout.toString().trim().split(/\r?\n/).filter(Boolean).map(Number).filter(n => !isNaN(n));
  } else {
    const proc = Bun.spawnSync(["pgrep", "-f", "screenpipe"]);
    return proc.stdout.toString().trim().split(/\n/).filter(Boolean).map(Number).filter(n => !isNaN(n));
  }
}

/** Check if port 3030 is in use */
function isPortInUse(): boolean {
  if (IS_WINDOWS) {
    const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command",
      "Get-NetTCPConnection -LocalPort 3030 -ErrorAction SilentlyContinue | Select-Object -First 1"]);
    return proc.stdout.toString().trim().length > 0;
  } else {
    const proc = Bun.spawnSync(["lsof", "-i", ":3030"]);
    return proc.exitCode === 0;
  }
}

/** Find screenpipe executable path */
function findScreenpipeExe(): string | null {
  if (IS_WINDOWS) {
    const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command",
      "(Get-Process -Name 'screenpipe*' -ErrorAction SilentlyContinue | Select-Object -First 1).Path"]);
    const path = proc.stdout.toString().trim();
    return path || null;
  } else {
    const proc = Bun.spawnSync(["bash", "-c", "ps aux | grep -i screenpipe | grep -v grep | head -1 | awk '{print $11}'"]);
    const path = proc.stdout.toString().trim();
    return path || null;
  }
}

/** Start screenpipe app (best effort) */
function startScreenpipe(exePath: string) {
  if (IS_WINDOWS) {
    Bun.spawnSync(["powershell", "-NoProfile", "-Command",
      `Start-Process '${exePath}'`]);
  } else {
    Bun.spawnSync(["open", "-a", exePath]);
  }
}

/** Wait for health API with timeout */
async function waitForHealthUp(timeoutS: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutS * 1000) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return true;
    } catch {}
    await sleep(2000);
  }
  return false;
}

// ── Pre-flight: record exe path before we kill anything ─────────────────────

const exePath = findScreenpipeExe();
console.log(`  screenpipe exe: ${exePath ?? "not found"}`);

// ── S9: Concurrent DB access under load ─────────────────────────────────────

await test("concurrent DB access (50 requests)", async () => {
  const promises = Array.from({ length: 50 }, (_, i) =>
    fetch(`http://localhost:3030/search?limit=1&q=test${i}`)
      .then(r => ({ ok: r.ok, status: r.status }))
      .catch(e => ({ ok: false, status: 0, error: e.message }))
  );
  const results = await Promise.all(promises);
  const failures = results.filter(r => !r.ok);
  if (failures.length > 5) {
    throw new Error(`${failures.length}/50 requests failed (>10% failure rate)`);
  }
});

await test("mixed read/write concurrent access", async () => {
  // Interleave search and health requests (simulating real usage)
  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(fetch(`http://localhost:3030/search?limit=1&content_type=ocr`).then(r => r.ok));
    promises.push(fetch(HEALTH_URL).then(r => r.ok));
    promises.push(fetch(`http://localhost:3030/search?limit=5&q=e2e`).then(r => r.ok));
  }
  const results = await Promise.all(promises);
  const failures = results.filter(r => !r);
  if (failures.length > 3) {
    throw new Error(`${failures.length}/60 mixed requests failed`);
  }
});

// ── S14: COM thread conflict (Windows) ──────────────────────────────────────

if (IS_WINDOWS) {
  await test("audio + vision both active (COM no conflict)", async () => {
    const health = await fetchJson(HEALTH_URL);
    // frame_status must be ok (vision thread using COM for screen capture)
    if (health.frame_status !== "ok") {
      throw new Error(`frame_status: ${health.frame_status} (vision COM may be broken)`);
    }
    // If audio is configured, it should also work (audio thread using COM for WASAPI)
    if (health.audio_status === "ok") {
      console.log("  both audio + vision COM threads active");
    } else {
      console.log(`  vision COM ok, audio: ${health.audio_status} (may not be configured)`);
    }
  });
}

// ── S5: CPU on idle screen ──────────────────────────────────────────────────

await test("CPU not spiking on idle (10s sample)", async () => {
  if (IS_WINDOWS) {
    // Measure screenpipe CPU over 10s
    const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command", `
      $samples = @()
      for ($i = 0; $i -lt 5; $i++) {
        $cpu = (Get-Process -Name 'screenpipe*' -ErrorAction SilentlyContinue | Measure-Object -Property CPU -Sum).Sum
        $samples += $cpu
        Start-Sleep -Seconds 2
      }
      $delta = $samples[-1] - $samples[0]
      Write-Output $delta
    `], { timeout: 30_000 });
    const cpuDelta = parseFloat(proc.stdout.toString().trim());
    if (!isNaN(cpuDelta) && cpuDelta > 50) {
      throw new Error(`high CPU usage on idle: ${cpuDelta.toFixed(1)}s CPU time in 10s`);
    }
    console.log(`  CPU delta over 10s: ${isNaN(cpuDelta) ? "N/A" : cpuDelta.toFixed(1)}s`);
  } else {
    // macOS: use ps to sample CPU %
    const proc = Bun.spawnSync(["bash", "-c",
      "ps aux | grep -i screenpipe | grep -v grep | awk '{sum+=$3} END {print sum}'"]);
    const cpuPct = parseFloat(proc.stdout.toString().trim());
    if (!isNaN(cpuPct) && cpuPct > 30) {
      throw new Error(`high CPU on idle: ${cpuPct.toFixed(1)}%`);
    }
    console.log(`  CPU usage: ${isNaN(cpuPct) ? "N/A" : cpuPct.toFixed(1)}%`);
  }
});

// ── S8: No orphaned ffmpeg/bun processes ────────────────────────────────────

await test("no orphaned ffmpeg processes", async () => {
  if (IS_WINDOWS) {
    const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command",
      "(Get-Process -Name 'ffmpeg' -ErrorAction SilentlyContinue).Count"]);
    const count = parseInt(proc.stdout.toString().trim()) || 0;
    // Some ffmpeg processes may be expected during recording, but >10 suggests leak
    if (count > 10) {
      throw new Error(`${count} ffmpeg processes running (possible orphan leak)`);
    }
    console.log(`  ffmpeg processes: ${count}`);
  } else {
    const proc = Bun.spawnSync(["bash", "-c", "pgrep -c ffmpeg || echo 0"]);
    const count = parseInt(proc.stdout.toString().trim()) || 0;
    if (count > 10) {
      throw new Error(`${count} ffmpeg processes (possible orphan leak)`);
    }
    console.log(`  ffmpeg processes: ${count}`);
  }
});

// ── S8: Force quit + recovery ───────────────────────────────────────────────

await test("force quit + recovery (DB intact)", async () => {
  if (!exePath) {
    console.log("  (skipped: could not find screenpipe exe path)");
    return;
  }

  // Record a search result count before kill
  let preKillCount = 0;
  try {
    const pre = await fetchJson("http://localhost:3030/search?limit=1&content_type=ocr");
    preKillCount = pre?.pagination?.total ?? 0;
  } catch {}

  // Force kill screenpipe
  console.log("  force killing screenpipe...");
  if (IS_WINDOWS) {
    Bun.spawnSync(["powershell", "-NoProfile", "-Command",
      "Get-Process -Name 'screenpipe*' -ErrorAction SilentlyContinue | Stop-Process -Force"]);
  } else {
    Bun.spawnSync(["pkill", "-9", "-f", "screenpipe"]);
  }
  await sleep(3000);

  // Verify it's dead
  if (isScreenpipeRunning()) {
    throw new Error("screenpipe still running after force kill");
  }

  // Restart
  console.log("  restarting screenpipe...");
  startScreenpipe(exePath);

  // Wait for health API
  const recovered = await waitForHealthUp(60);
  if (!recovered) {
    throw new Error("health API did not come back within 60s after force quit");
  }

  // Verify DB is intact — search should still work
  await sleep(5000);
  const post = await fetchJson("http://localhost:3030/search?limit=1&content_type=ocr");
  const postKillCount = post?.pagination?.total ?? 0;

  // Total should be >= pre-kill (new frames may have been added)
  if (postKillCount < preKillCount * 0.9) {
    throw new Error(`DB may be corrupted: pre=${preKillCount}, post=${postKillCount}`);
  }
  console.log(`  DB intact: pre=${preKillCount}, post=${postKillCount}`);
});

// ── S8: Port conflict on restart ────────────────────────────────────────────

await test("port 3030 not conflicting", async () => {
  // After recovery, verify only one process owns port 3030
  if (IS_WINDOWS) {
    const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command",
      "(Get-NetTCPConnection -LocalPort 3030 -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen').Count"]);
    const count = parseInt(proc.stdout.toString().trim()) || 0;
    if (count > 1) {
      throw new Error(`${count} listeners on port 3030 (port conflict)`);
    }
    if (count === 0) {
      console.log("  (no listeners yet, app may still be starting)");
    } else {
      console.log(`  port 3030 listeners: ${count}`);
    }
  } else {
    const proc = Bun.spawnSync(["bash", "-c", "lsof -i :3030 -sTCP:LISTEN | tail -n +2 | wc -l"]);
    const count = parseInt(proc.stdout.toString().trim()) || 0;
    if (count > 1) {
      throw new Error(`${count} listeners on port 3030 (port conflict)`);
    }
  }
});

// ── S8: Health stable after restart ─────────────────────────────────────────

await test("health stable after restart (10s)", async () => {
  for (let i = 0; i < 5; i++) {
    const health = await fetchJson(HEALTH_URL);
    if (health.frame_status !== "ok") {
      throw new Error(`frame_status degraded at check ${i}: ${health.frame_status}`);
    }
    await sleep(2000);
  }
});

await screenshot("09-lifecycle");

const ok = summary();
process.exit(ok ? 0 : 1);
