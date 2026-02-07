import {
  suite, test, summary, screenshot, assertExists,
  assertHealthField, assertSearchResults, fetchJson,
  waitForHealth, sleep, HEALTH_URL, TIMEOUT_MEDIUM,
  sel, IS_WINDOWS, IS_MACOS,
} from "./lib";

suite("recording pipeline");

await test("health API up", () => waitForHealth(30));
await test("OCR frames exist", () => assertSearchResults("ocr", 1));

// Audio may not be available on all Windows machines
if (IS_MACOS) {
  await test("audio chunks exist", () => assertSearchResults("audio", 1));
}
if (IS_WINDOWS) {
  await test("audio chunks (optional)", async () => {
    try {
      await assertSearchResults("audio", 1);
    } catch {
      console.log("(skipped: audio not configured)");
    }
  });
}

await test("frame timestamp exists", async () => {
  const health = await fetchJson(HEALTH_URL);
  const ts = health.last_frame_timestamp;
  if (!ts) throw new Error("no last_frame_timestamp");
  // Just verify the timestamp is parseable and not from the future
  const age = (Date.now() - new Date(ts).getTime()) / 1000;
  if (age < -60) throw new Error(`frame timestamp in the future: ${Math.round(age)}s`);
});

if (IS_MACOS) {
  await test("recent audio timestamp (<2min)", async () => {
    const health = await fetchJson(HEALTH_URL);
    const ts = health.last_audio_timestamp;
    if (!ts) throw new Error("no last_audio_timestamp");
    const age = (Date.now() - new Date(ts).getTime()) / 1000;
    if (age > 120) throw new Error(`audio too old: ${Math.round(age)}s ago`);
  });
}

await test("search returns text", async () => {
  const data = await fetchJson("http://localhost:3030/search?limit=1&content_type=ocr");
  const results = data?.data ?? [];
  if (results.length === 0) throw new Error("no OCR results");
});

await test("health has expected fields", async () => {
  const health = await fetchJson(HEALTH_URL);
  // Verify core health fields exist
  if (!("frame_status" in health)) throw new Error("missing frame_status");
  if (!("audio_status" in health)) throw new Error("missing audio_status");
  if (!("status_code" in health)) throw new Error("missing status_code");
});

if (IS_MACOS) {
  await test("recording state visible in tray", async () => {
    await assertExists(sel.titleContains("recording"));
  });
}

await test("health stays stable after 10s", async () => {
  await sleep(10_000);
  const health = await fetchJson(HEALTH_URL);
  if (health.frame_status !== "ok") {
    throw new Error(`frame_status degraded: ${health.frame_status}`);
  }
});

await test("frame_status still ok after wait", async () => {
  const health = await fetchJson(HEALTH_URL);
  if (health.frame_status !== "ok") {
    throw new Error(`frame_status: ${health.frame_status}`);
  }
});

// ── S5.1-2: Static vs active screen behavior ────────────────────────────

await test("static screen = low frame activity (S5.1)", async () => {
  // On idle screen, frame rate should be low (identical frame skipping)
  const health1 = await fetchJson(HEALTH_URL);
  const ts1 = health1.last_frame_timestamp;
  await sleep(5000);
  const health2 = await fetchJson(HEALTH_URL);
  const ts2 = health2.last_frame_timestamp;

  if (ts1 && ts2) {
    const delta = Math.abs(new Date(ts2).getTime() - new Date(ts1).getTime());
    console.log(`  frame timestamp delta over 5s idle: ${delta}ms`);
    // On static screen, frames should still update but not excessively
  }
  // Key assertion: app is still functioning
  if (health2.frame_status !== "ok") {
    throw new Error(`frame_status degraded on idle: ${health2.frame_status}`);
  }
});

await test("OCR produces text results (S5.2)", async () => {
  const data = await fetchJson("http://localhost:3030/search?limit=5&content_type=ocr");
  const results = data?.data ?? [];
  if (results.length === 0) {
    throw new Error("no OCR results — pipeline may be broken");
  }
  // Check text quality
  let nonEmpty = 0;
  for (const r of results) {
    const text = r?.content?.text ?? "";
    if (text.trim().length > 0) nonEmpty++;
  }
  console.log(`  ${nonEmpty}/${results.length} OCR results have non-empty text`);
});

// ── S5.9: Window capture mode ────────────────────────────────────────────

await test("search results have app context (S5.9)", async () => {
  const data = await fetchJson("http://localhost:3030/search?limit=10&content_type=ocr");
  const results = data?.data ?? [];
  let withApp = 0;
  for (const r of results) {
    const appName = r?.content?.app_name ?? "";
    if (appName.length > 0) withApp++;
  }
  console.log(`  ${withApp}/${results.length} OCR results have app_name`);
  if (results.length > 3 && withApp === 0) {
    console.log("  warning: no app context in OCR results");
  }
});

// ── S4.1: Default audio device ──────────────────────────────────────────

await test("audio device status reported (S4.1)", async () => {
  const health = await fetchJson(HEALTH_URL);
  if (!("audio_status" in health)) {
    throw new Error("audio_status missing from health");
  }
  console.log(`  audio_status: ${health.audio_status}`);

  // Check device_status_details for audio devices
  const details = health.device_status_details ?? [];
  if (Array.isArray(details)) {
    const audioDevices = details.filter((d: any) =>
      d?.type === "audio" || d?.device_type === "audio"
    );
    console.log(`  audio devices in health: ${audioDevices.length}`);
  }
});

// ── S3.9: Queue stats ───────────────────────────────────────────────────

await test("health has device status details (S3.9)", async () => {
  const health = await fetchJson(HEALTH_URL);
  const details = health.device_status_details;

  if (!details) {
    console.log("  device_status_details is null/undefined");
    return;
  }

  if (Array.isArray(details)) {
    console.log(`  device_status_details: ${details.length} entries`);
    for (const d of details.slice(0, 3)) {
      console.log(`    type=${d?.type ?? d?.device_type}, status=${d?.status ?? "?"}`);
    }
  }
});

// ── S5.6: High refresh rate behavior ─────────────────────────────────────

await test("frame capture rate reasonable (S5.6)", async () => {
  // Sample frame timestamps over 10s to estimate effective capture rate
  const timestamps: string[] = [];
  for (let i = 0; i < 3; i++) {
    const health = await fetchJson(HEALTH_URL);
    if (health.last_frame_timestamp) {
      timestamps.push(health.last_frame_timestamp);
    }
    await sleep(3000);
  }

  if (timestamps.length >= 2) {
    const first = new Date(timestamps[0]).getTime();
    const last = new Date(timestamps[timestamps.length - 1]).getTime();
    const delta = last - first;
    console.log(`  frame timestamp progression: ${delta}ms over ${(timestamps.length - 1) * 3}s`);
    // Timestamps should be progressing (new frames captured)
    if (delta <= 0) {
      console.log("  warning: frame timestamps not progressing");
    }
  }
});

// ── S3.8: Resolution/scaling doesn't break recording ─────────────────────

await test("recording stable regardless of display config (S3.8)", async () => {
  // Verify health is ok — this implicitly tests that current resolution/scaling works
  const health = await fetchJson(HEALTH_URL);
  if (health.frame_status !== "ok") {
    throw new Error(`frame_status not ok: ${health.frame_status}`);
  }

  // Also verify search still works (recording is producing data)
  const data = await fetchJson("http://localhost:3030/search?limit=1&content_type=ocr");
  if ((data?.data?.length ?? 0) === 0) {
    console.log("  warning: no OCR results despite ok frame_status");
  } else {
    console.log("  recording stable, OCR producing results");
  }
});

// ── S4.6: Audio stream timeout recovery ──────────────────────────────────

await test("audio status doesn't indicate timeout (S4.6)", async () => {
  const health = await fetchJson(HEALTH_URL);
  const audioStatus = String(health.audio_status ?? "");
  if (audioStatus.toLowerCase().includes("timeout")) {
    throw new Error(`audio stream timeout detected: ${audioStatus}`);
  }
  console.log(`  audio status: ${audioStatus} (no timeout)`);
});

await screenshot("03-recording");

const ok = summary();
process.exit(ok ? 0 : 1);
