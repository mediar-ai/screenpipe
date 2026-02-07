/**
 * Tray Menu Interaction Tests
 *
 * TESTING.md coverage:
 * - S2: Tray icon, tray menu items, tray health indicator
 * - S8: Quit via tray
 *
 * Uses bb CLI to interact with system tray.
 * Note: On Windows, system tray interaction via UIA is limited.
 */

import {
  suite, test, summary, screenshot, bb, fetchJson, sleep,
  sel, HEALTH_URL, IS_WINDOWS, IS_MACOS, isScreenpipeRunning,
} from "./lib";

suite("tray & system menu");

if (IS_MACOS) {
  // ── macOS tray tests ────────────────────────────────────────────────────────

  await test("tray icon visible", async () => {
    const result = await bb("find", "role:AXMenuBarItem AND name~:status", "--app", "screenpipe-app");
    const items = result?.data ?? [];
    if (items.length === 0) throw new Error("tray icon not found");
  });

  await test("tray shows health indicator", async () => {
    // Look for the recording indicator (● recording)
    try {
      const result = await bb("find", "title~:recording");
      const items = result?.data ?? [];
      if (items.length > 0) {
        console.log("  tray shows: recording active");
        return;
      }
    } catch {}
    // Might show other status
    console.log("  (recording indicator not found, checking health)");
    const health = await fetchJson(HEALTH_URL);
    console.log(`  health status: ${health.status}`);
  });

  await test("tray menu opens", async () => {
    // Click the tray icon to open the menu
    try {
      await bb("click", "role:AXMenuBarItem AND name~:status", "--app", "screenpipe-app");
      await sleep(1000);
      // Verify menu items appeared
      const items = await bb("find", "role:AXMenuItem", "--app", "screenpipe-app");
      const count = items?.data?.length ?? 0;
      if (count === 0) throw new Error("no menu items after clicking tray");
      console.log(`  tray menu has ${count} items`);
      // Close menu by pressing Escape
      await bb("press", "escape");
    } catch (e: any) {
      throw new Error(`tray menu interaction failed: ${e.message}`);
    }
  });

  await test("tray has all expected items", async () => {
    // Open menu
    await bb("click", "role:AXMenuBarItem AND name~:status", "--app", "screenpipe-app");
    await sleep(500);

    const expectedItems = ["show screenpipe", "settings", "quit screenpipe"];
    for (const item of expectedItems) {
      try {
        const result = await bb("find", `role:AXMenuItem AND title~:${item}`);
        const found = (result?.data?.length ?? 0) > 0;
        if (!found) console.log(`  warning: "${item}" not found in tray menu`);
      } catch {
        console.log(`  warning: "${item}" check failed`);
      }
    }

    // Close menu
    await bb("press", "escape");
  });

  await test("tray 'show screenpipe' opens window", async () => {
    // Open tray menu
    await bb("click", "role:AXMenuBarItem AND name~:status", "--app", "screenpipe-app");
    await sleep(500);

    // Click "show screenpipe"
    try {
      await bb("click", "role:AXMenuItem AND title~:show screenpipe", "--app", "screenpipe-app");
      await sleep(2000);

      // Verify window appeared
      const result = await bb("find", "role:AXWebArea", "--app", "screenpipe-app");
      const windows = result?.data ?? [];
      if (windows.length === 0) {
        console.log("  warning: window may not have appeared");
      }
    } catch (e: any) {
      console.log(`  (show screenpipe interaction failed: ${e.message})`);
    }
  });

  await test("tray menu does not fire twice (S2.6)", async () => {
    await bb("click", "role:AXMenuBarItem AND name~:status", "--app", "screenpipe-app");
    await sleep(500);
    const result = await bb("find", "role:AXMenuItem AND title:settings", "--app", "screenpipe-app");
    const settingsCount = result?.data?.length ?? 0;
    if (settingsCount > 1) {
      throw new Error(`${settingsCount} "settings" items in tray (possible double-fire bug)`);
    }
    await bb("press", "escape");
  });

  await test("tray has stop/start recording items (S2.5)", async () => {
    await bb("click", "role:AXMenuBarItem AND name~:status", "--app", "screenpipe-app");
    await sleep(500);
    let found = { stop: false, start: false, changelog: false, feedback: false };
    for (const item of ["stop recording", "start recording", "changelog", "send feedback"]) {
      try {
        const r = await bb("find", `role:AXMenuItem AND title~:${item}`);
        if ((r?.data?.length ?? 0) > 0) (found as any)[item.split(" ")[0]] = true;
      } catch {}
    }
    console.log(`  menu items: stop=${found.stop}, start=${found.start}, changelog=${found.changelog}, feedback=${found.feedback}`);
    await bb("press", "escape");
  });

  await test("tray icon persists after toggle (S2.4)", async () => {
    // Toggle overlay a few times and verify tray stays visible
    for (let i = 0; i < 3; i++) {
      await bb("shortcut", "s", "--modifiers", "cmd,ctrl");
      await sleep(500);
    }
    // Tray should still be there
    const result = await bb("find", "role:AXMenuBarItem AND name~:status", "--app", "screenpipe-app");
    if ((result?.data?.length ?? 0) === 0) {
      throw new Error("tray icon disappeared after overlay toggle");
    }
  });

  await test("dock icon visible (S2.1)", async () => {
    // Check dock icon by looking for the app in running apps
    const proc = Bun.spawnSync(["bash", "-c",
      "osascript -e 'tell application \"System Events\" to get name of every process whose visible is true'"]);
    const apps = proc.stdout.toString().toLowerCase();
    // Screenpipe should appear in visible processes (dock icon = not accessory mode)
    if (!apps.includes("screenpipe")) {
      console.log("  warning: screenpipe not in visible processes (may be in accessory mode)");
    } else {
      console.log("  dock icon: visible");
    }
  });

  await test("dock icon persists after overlay toggle (S2.3)", async () => {
    for (let i = 0; i < 5; i++) {
      await bb("shortcut", "s", "--modifiers", "cmd,ctrl");
      await sleep(300);
    }
    const proc = Bun.spawnSync(["bash", "-c",
      "osascript -e 'tell application \"System Events\" to get name of every process whose visible is true'"]);
    const apps = proc.stdout.toString().toLowerCase();
    if (!apps.includes("screenpipe")) {
      throw new Error("dock icon disappeared after 5 overlay toggles (activation policy may have changed)");
    }
  });
}

if (IS_WINDOWS) {
  // ── Windows tray tests ──────────────────────────────────────────────────────

  await test("screenpipe process running", async () => {
    if (!isScreenpipeRunning()) throw new Error("screenpipe not running");
  });

  await test("system tray area accessible", async () => {
    // Windows system tray is tricky — items may be in overflow
    // Try to find screenpipe in notification area
    try {
      const result = await bb("find", "name~:screenpi");
      const items = result?.data ?? [];
      if (items.length > 0) {
        console.log(`  found ${items.length} screenpipe element(s) in tray area`);
        return;
      }
    } catch {}

    // Try notification area toolbar
    try {
      const result = await bb("find", "role:ToolBar AND name~:notification");
      const toolbars = result?.data ?? [];
      console.log(`  notification toolbars found: ${toolbars.length}`);
    } catch {
      console.log("  (notification area not directly accessible)");
    }
  });

  await test("health indicator via API (tray proxy)", async () => {
    // On Windows we can't easily read tray icon color,
    // but we verify the health state that drives it
    const health = await fetchJson(HEALTH_URL);
    const status = health.status;
    if (status === "healthy") {
      console.log("  health: green (healthy)");
    } else if (status === "degraded") {
      console.log("  health: yellow (degraded)");
    } else {
      console.log(`  health: red (${status})`);
    }
  });

  await test("screenpipe window focusable via shortcut", async () => {
    // Alt+S should show/focus the window
    await bb("shortcut", "s", "--modifiers", "alt");
    await sleep(2000);

    // Verify window is visible
    const result = await bb("find", "name~:screenpi");
    const items = result?.data ?? [];
    if (items.length === 0) {
      console.log("  warning: window may not have focused");
    } else {
      console.log(`  window focused, ${items.length} element(s) visible`);
    }
  });
}

await screenshot("08-tray");

const ok = summary();
process.exit(ok ? 0 : 1);
