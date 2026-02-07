import {
  suite, test, summary, screenshot, assertHealthField,
  assertExists, bb, fetchJson, HEALTH_URL,
  sel, IS_WINDOWS, IS_MACOS, isScreenpipeRunning,
} from "./lib";

suite("app launch & health");

await test("app process running", async () => {
  if (!isScreenpipeRunning()) throw new Error("screenpipe process not found");
});

await test("health API responds", async () => {
  const res = await fetch("http://localhost:3030/health");
  if (!res.ok) throw new Error(`health returned ${res.status}`);
});

await test("health frame_status ok", () => assertHealthField("frame_status", "ok"));

await test("health status acceptable", async () => {
  const health = await fetchJson(HEALTH_URL);
  const status = health.status;
  // Accept "healthy" or "degraded" (audio may not be configured on all machines)
  if (status !== "healthy" && status !== "degraded") {
    throw new Error(`health.status: expected "healthy" or "degraded", got "${status}"`);
  }
  if (status === "degraded" && health.frame_status !== "ok") {
    throw new Error(`degraded but frame_status is "${health.frame_status}" (expected ok)`);
  }
});

if (IS_MACOS) {
  await test("health audio_status ok", () => assertHealthField("audio_status", "ok"));

  // macOS tray tests use AX-specific selectors
  await test("tray icon exists", () => assertExists("role:AXMenuBarItem AND name~:status"));
  await test("tray shows recording", () => assertExists("title:● recording"));
  await test("tray version present", () => assertExists("title~:version"));
  await test("tray settings item", () => assertExists("role:AXMenuItem AND title:settings"));
  await test("tray quit item", () => assertExists("role:AXMenuItem AND title:quit screenpipe"));
  await test("tray changelog item", () => assertExists("role:AXMenuItem AND title:changelog"));
  await test("tray show screenpipe", () => assertExists("title~:show screenpipe"));
  await test("tray stop recording", () => assertExists("role:AXMenuItem AND title:stop recording"));
  await test("tray start recording", () => assertExists("role:AXMenuItem AND title:start recording"));
  await test("tray send feedback", () => assertExists("role:AXMenuItem AND title:send feedback"));
}

if (IS_WINDOWS) {
  // Windows: verify the screenpipe-app process has a window handle
  // Tauri windows on Windows appear as Pane elements with class "screenpi.pe-sic"
  await test("tray pane exists", async () => {
    const result = await bb("find", "name~:screenpi");
    const elements = result?.data ?? [];
    if (elements.length === 0) {
      throw new Error("screenpipe pane/tray element not found in UIA tree");
    }
  });
}

// ── S8: App startup checks ──────────────────────────────────────────────

await test("health status_code is valid (S8)", async () => {
  const health = await fetchJson(HEALTH_URL);
  const code = health.status_code;
  if (typeof code !== "number") {
    throw new Error(`status_code is not a number: ${typeof code}`);
  }
  // Valid codes: 200 (healthy), 206 (degraded), etc.
  if (code < 200 || code >= 500) {
    throw new Error(`status_code ${code} indicates server error`);
  }
  console.log(`  status_code: ${code}`);
});

await test("health has timestamp info (S8)", async () => {
  const health = await fetchJson(HEALTH_URL);
  const frameTs = health.last_frame_timestamp;
  const audioTs = health.last_audio_timestamp;

  if (frameTs) {
    const age = (Date.now() - new Date(frameTs).getTime()) / 1000;
    console.log(`  last frame: ${Math.round(age)}s ago`);
    if (age > 300) {
      console.log("  warning: last frame >5min ago");
    }
  }
  if (audioTs) {
    const age = (Date.now() - new Date(audioTs).getTime()) / 1000;
    console.log(`  last audio: ${Math.round(age)}s ago`);
  }
});

// ── S5.8: Corrupt pixel buffer handling ─────────────────────────────────

await test("health API doesn't expose internal errors (S5.8)", async () => {
  // Fetch health multiple times rapidly — internal errors should not leak
  const results = [];
  for (let i = 0; i < 5; i++) {
    const health = await fetchJson(HEALTH_URL);
    results.push(health);
  }

  for (const h of results) {
    const statusStr = JSON.stringify(h);
    if (statusStr.toLowerCase().includes("panic") || statusStr.toLowerCase().includes("segfault")) {
      throw new Error("internal error leaked in health response");
    }
  }
  console.log("  no internal errors in 5 health checks");
});

// ── S9.4: Event listener race condition proxy ───────────────────────────

await test("concurrent API calls don't race (S9.4)", async () => {
  // Fire search + health + pipes simultaneously — tests internal event handling
  const start = Date.now();
  const [search, health, pipes] = await Promise.all([
    fetch("http://localhost:3030/search?limit=1").then(r => ({ ok: r.ok })).catch(() => ({ ok: false })),
    fetch(HEALTH_URL).then(r => ({ ok: r.ok })).catch(() => ({ ok: false })),
    fetch("http://localhost:3030/pipes/list").then(r => ({ ok: r.ok || r.status === 404 })).catch(() => ({ ok: false })),
  ]);
  const elapsed = Date.now() - start;

  if (!search.ok) throw new Error("search failed in concurrent call");
  if (!health.ok) throw new Error("health failed in concurrent call");
  console.log(`  3 concurrent API calls: ${elapsed}ms`);
});

await screenshot("01-tray-health");

const ok = summary();
process.exit(ok ? 0 : 1);
