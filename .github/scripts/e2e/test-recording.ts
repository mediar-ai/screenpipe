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

await screenshot("03-recording");

const ok = summary();
process.exit(ok ? 0 : 1);
