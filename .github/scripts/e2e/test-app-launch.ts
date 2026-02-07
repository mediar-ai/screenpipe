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

await screenshot("01-tray-health");

const ok = summary();
process.exit(ok ? 0 : 1);
