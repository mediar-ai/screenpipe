import {
  suite, test, summary, screenshot, assertExists,
  assertHealthField, assertSearchResults, fetchJson,
  waitForHealth, sleep, HEALTH_URL, TIMEOUT_MEDIUM,
  sel,
} from "./lib";

suite("recording pipeline");

await test("health API up", () => waitForHealth(30));
await test("OCR frames exist", () => assertSearchResults("ocr", 1));
await test("audio chunks exist", () => assertSearchResults("audio", 1));

await test("recent frame timestamp (<5min)", async () => {
  const health = await fetchJson(HEALTH_URL);
  const ts = health.last_frame_timestamp;
  if (!ts) throw new Error("no last_frame_timestamp");
  const age = (Date.now() - new Date(ts).getTime()) / 1000;
  if (age > 300) throw new Error(`frame too old: ${Math.round(age)}s ago`);
});

await test("recent audio timestamp (<2min)", async () => {
  const health = await fetchJson(HEALTH_URL);
  const ts = health.last_audio_timestamp;
  if (!ts) throw new Error("no last_audio_timestamp");
  const age = (Date.now() - new Date(ts).getTime()) / 1000;
  if (age > 120) throw new Error(`audio too old: ${Math.round(age)}s ago`);
});

await test("search returns text", async () => {
  const data = await fetchJson("http://localhost:3030/search?limit=1&content_type=ocr");
  const results = data?.data ?? [];
  if (results.length === 0) throw new Error("no OCR results");
});

await test("monitors detected in health", async () => {
  const health = await fetchJson(HEALTH_URL);
  const details = health.device_status_details ?? "";
  if (!details) throw new Error("no device_status_details");
});

await test("recording state visible in tray", async () => {
  await assertExists(sel.titleContains("recording"));
});

await test("health stays healthy after 10s", async () => {
  await sleep(10_000);
  await assertHealthField("status", "healthy");
});

await test("frames still fresh after wait", async () => {
  const health = await fetchJson(HEALTH_URL);
  const ts = health.last_frame_timestamp;
  if (!ts) throw new Error("no last_frame_timestamp");
  const age = (Date.now() - new Date(ts).getTime()) / 1000;
  if (age > 300) throw new Error(`frame too old: ${Math.round(age)}s ago`);
});

await screenshot("03-recording");

const ok = summary();
process.exit(ok ? 0 : 1);
