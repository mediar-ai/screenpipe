import {
  suite, test, summary, fetchJson, assertHealthField,
  assertSearchResults, httpStatus, HEALTH_URL, SEARCH_URL,
} from "./lib";

const BASE = "http://localhost:3030";

suite("REST API");

await test("GET /health", async () => {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error(`status ${res.status}`);
});

await test("GET /search (ocr)", async () => {
  const res = await fetch(`${BASE}/search?limit=1&content_type=ocr`);
  if (!res.ok) throw new Error(`status ${res.status}`);
});

await test("GET /search (audio)", async () => {
  const res = await fetch(`${BASE}/search?limit=1&content_type=audio`);
  if (!res.ok) throw new Error(`status ${res.status}`);
});

await test("GET /search (query)", async () => {
  const res = await fetch(`${BASE}/search?limit=1&q=test`);
  if (!res.ok) throw new Error(`status ${res.status}`);
});

await test("GET /search (pagination)", async () => {
  const res = await fetch(`${BASE}/search?limit=5&offset=0`);
  if (!res.ok) throw new Error(`status ${res.status}`);
});

await test("search response structure", async () => {
  const data = await fetchJson(`${BASE}/search?limit=1`);
  if (!("data" in data)) throw new Error("missing 'data' field");
  if (!("pagination" in data)) throw new Error("missing 'pagination' field");
  if (!Array.isArray(data.data)) throw new Error("data is not an array");
});

await test("health response structure", async () => {
  const data = await fetchJson(`${BASE}/health`);
  for (const field of ["status", "status_code", "frame_status", "audio_status", "message"]) {
    if (!(field in data)) throw new Error(`missing '${field}' field`);
  }
});

await test("GET /pipes/list", async () => {
  const status = await httpStatus(`${BASE}/pipes/list`);
  // 200, 403 (auth), or 404 are fine — not 500
  if (status === 500) throw new Error("server error 500");
  if (status === 0) throw new Error("connection refused");
});

await test("search with date range", async () => {
  const today = new Date().toISOString().split("T")[0] + "T00:00:00Z";
  const res = await fetch(`${BASE}/search?limit=1&start_time=${today}`);
  if (!res.ok) throw new Error(`status ${res.status}`);
});

await test("5 concurrent requests", async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () => fetch(`${BASE}/search?limit=1`))
  );
  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) throw new Error(`${failures.length}/5 requests failed`);
});

await test("large search limit (100)", async () => {
  const res = await fetch(`${BASE}/search?limit=100&content_type=ocr`);
  if (!res.ok) throw new Error(`status ${res.status}`);
});

await test("invalid content type (!500)", async () => {
  const status = await httpStatus(`${BASE}/search?content_type=invalid`);
  if (status === 500) throw new Error("server returned 500 on invalid content_type");
});

const ok = summary();
process.exit(ok ? 0 : 1);
