import {
  suite, test, summary, screenshot, assertExists, shortcut, bb,
  press, scrape, sleep, TIMEOUT_MEDIUM,
  sel, shortcuts, IS_WINDOWS, IS_MACOS,
} from "./lib";

suite("main window UI");

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

if (IS_MACOS) {
  await test("screenpipe menu exists", () => assertExists("role:AXMenuBarItem AND title:screenpipe"));
  await test("edit menu exists", () => assertExists("role:AXMenuBarItem AND title:Edit"));
  await test("about menu item", () => assertExists("role:AXMenuItem AND title:About screenpipe"));
  await test("check for updates item", () => assertExists("title~:Check for Updates"));
}

if (IS_WINDOWS) {
  // Windows app has a title bar with the app name
  await test("window title contains screenpipe", () =>
    assertExists(sel.titleContains("screenpipe")));
}

await screenshot("02-main-window");

const ok = summary();
process.exit(ok ? 0 : 1);
