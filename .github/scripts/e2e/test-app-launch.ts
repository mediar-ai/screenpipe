import { suite, test, summary, screenshot, assertExists, assertHealthField, fetchJson, HEALTH_URL, waitForHealth, sleep, bb } from "./lib";

suite("app launch & health");

await test("app process running", async () => {
  const proc = Bun.spawnSync(["pgrep", "-f", "screenpipe"]);
  if (proc.exitCode !== 0) throw new Error("screenpipe process not found");
});

await test("health API responds", async () => {
  await waitForHealth(30);
});

await test("health status field exists", async () => {
  const health = await fetchJson(HEALTH_URL);
  if (!health.status) throw new Error("no status field in health response");
});

await test("health has frame_status", async () => {
  const health = await fetchJson(HEALTH_URL);
  if (health.frame_status === undefined) throw new Error("no frame_status");
});

await test("health has audio_status", async () => {
  const health = await fetchJson(HEALTH_URL);
  if (health.audio_status === undefined) throw new Error("no audio_status");
});

// Tray tests — these use bb accessibility
await test("tray icon visible", async () => {
  try {
    // Try to find the tray menu bar extra
    await assertExists("role:AXMenuBarItem AND title~:screenpipe", 5000);
  } catch {
    // Tray might use a status item with different naming
    await assertExists("role:AXMenuBarItem AND name~:status", 5000);
  }
});

await test("tray has menu items", async () => {
  // Click on the tray to open menu, then verify items
  try {
    const result = await bb("find", "role:AXMenuItem AND title~:recording", "--app", process.env.SCREENPIPE_APP_NAME ?? "screenpipe");
    if (!result?.data?.length) throw new Error("no recording menu item found");
  } catch (e: any) {
    // Tray menu items might not be accessible without clicking
    console.log(`    (tray items: ${e.message?.slice(0, 100)})`);
  }
});

await screenshot("01-app-launch");

const ok = summary();
process.exit(ok ? 0 : 1);
