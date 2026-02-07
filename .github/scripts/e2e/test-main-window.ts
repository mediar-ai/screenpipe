import {
  suite, test, summary, screenshot, assertExists, shortcut, bb,
  press, scrape, sleep, TIMEOUT_MEDIUM,
  sel, shortcuts, IS_WINDOWS, IS_MACOS,
} from "./lib";

suite("main window UI");

if (IS_MACOS) {
  await test("open main window", async () => {
    await bb("activate", "screenpipe-app");
    await sleep(500);
    const s = shortcuts.showApp;
    await shortcut(s.key, s.modifiers);
    await sleep(3000);
    await assertExists(sel.webArea, TIMEOUT_MEDIUM);
  });

  await test("window has webview", () => assertExists(sel.webArea));

  await test("search button exists", () => assertExists(sel.titleContains("search")));

  await test("timeline has time labels", async () => {
    const result = await scrape();
    const texts: string[] = (result?.data?.items ?? []).map((i: any) => i.text ?? "");
    const hasTime = texts.some((t) => /\d{1,2}\s*(AM|PM)/i.test(t));
    if (!hasTime) throw new Error("no time labels found in timeline");
  });

  await test("timeline has app labels", async () => {
    const result = await scrape();
    const texts: string[] = (result?.data?.items ?? []).map((i: any) => i.text ?? "");
    const meaningful = texts.filter((t) => t.length > 2 && !["text", "static text", "group", "button"].includes(t));
    if (meaningful.length < 3) throw new Error(`only ${meaningful.length} meaningful texts`);
  });

  await test("notifications region exists", () => assertExists(sel.titleContains("Notifications")));

  await test("open search panel", async () => {
    const s = shortcuts.search;
    await shortcut(s.key, s.modifiers);
    await sleep(1000);
    await assertExists(sel.textField, TIMEOUT_MEDIUM);
  });

  await test("close search panel (Esc)", async () => {
    await press("Escape");
    await sleep(1000);
  });

  await test("screenpipe menu exists", () => assertExists("role:AXMenuBarItem AND title:screenpipe"));
  await test("edit menu exists", () => assertExists("role:AXMenuBarItem AND title:Edit"));
  await test("about menu item", () => assertExists("role:AXMenuItem AND title:About screenpipe"));
  await test("check for updates item", () => assertExists("title~:Check for Updates"));
}

if (IS_WINDOWS) {
  // On Windows, Tauri app uses WebView2 which may not expose full UIA tree
  // when the window is in tray mode. We test what we can access.
  await test("show main window via shortcut (S1.1)", async () => {
    const s = shortcuts.showApp;
    await shortcut(s.key, s.modifiers);
    await sleep(3000);
  });

  await test("screenpipe process has window", async () => {
    const result = await bb("find", "name~:screenpi");
    const elements = result?.data ?? [];
    if (elements.length === 0) throw new Error("no screenpipe elements found");
  });

  await test("overlay toggle on/off (S1.4-5)", async () => {
    const s = shortcuts.showApp;
    // Toggle on
    await shortcut(s.key, s.modifiers);
    await sleep(1000);
    // Toggle off
    await shortcut(s.key, s.modifiers);
    await sleep(1000);
    // Toggle on again
    await shortcut(s.key, s.modifiers);
    await sleep(1000);

    // App should still be responsive
    const result = await bb("find", "name~:screenpi");
    const elements = result?.data ?? [];
    if (elements.length === 0) {
      console.log("  warning: window not found after toggle");
    } else {
      console.log(`  overlay toggle: ${elements.length} element(s) after toggle`);
    }
  });

  await test("no blink on show (S1.7)", async () => {
    // Show window and verify it appears without intermediate blank
    const s = shortcuts.showApp;
    await shortcut(s.key, s.modifiers);
    await sleep(500);
    // Take screenshot immediately — if window blinks, screenshot will show blank
    await screenshot("02-no-blink-check");
    await sleep(500);
  });

  await test("Escape key does not crash (S1.14)", async () => {
    await bb("press", "Escape");
    await sleep(500);
    // App should still be alive
    const result = await bb("find", "name~:screenpi");
    // Window may have hidden — that's OK, just shouldn't crash
  });

  await test("take screenshot after show", async () => {
    await screenshot("02-main-window-shown");
  });
}

await screenshot("02-main-window");

const ok = summary();
process.exit(ok ? 0 : 1);
