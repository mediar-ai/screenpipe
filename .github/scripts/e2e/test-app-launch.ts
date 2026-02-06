import {
  suite, test, summary, screenshot, assertExists, assertHealthField,
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

await test("health status healthy", () => assertHealthField("status", "healthy"));
await test("health frame_status ok", () => assertHealthField("frame_status", "ok"));
await test("health audio_status ok", () => assertHealthField("audio_status", "ok"));

if (IS_MACOS) {
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
  // Windows system tray tests — tray icons live in notification area
  // bb on Windows can find elements via UIA in the notification area
  await test("tray icon accessible", async () => {
    // On Windows, the tray icon is in the system notification area
    // Try to find screenpipe in the notification overflow or tray
    await assertExists(sel.titleContains("screenpipe"), 10_000);
  });
}

await screenshot("01-tray-health");

const ok = summary();
process.exit(ok ? 0 : 1);
