import {
  suite, test, summary, screenshot, assertExists, shortcut, bb,
  press, scrape, sleep, TIMEOUT_MEDIUM,
} from "./lib";

suite("main window UI");

await test("open main window (⌃⌘S)", async () => {
  // Activate app first to ensure shortcut is received
  await bb("activate", "screenpipe-app");
  await sleep(500);
  await shortcut("s", "cmd,ctrl");
  await sleep(3000);
  await assertExists("role:AXWebArea", TIMEOUT_MEDIUM);
});

await test("window has webview", () => assertExists("role:AXWebArea"));

await test("search button exists", () => assertExists("title~:search"));

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

await test("notifications region exists", () => assertExists("title~:Notifications"));

await test("open search panel (⌃⌘K)", async () => {
  await shortcut("k", "cmd,ctrl");
  await sleep(1000);
  await assertExists("role:AXTextField", TIMEOUT_MEDIUM);
});

await test("close search panel (Esc)", async () => {
  await press("Escape");
  await sleep(1000);
});

await test("screenpipe menu exists", () => assertExists("role:AXMenuBarItem AND title:screenpipe"));
await test("edit menu exists", () => assertExists("role:AXMenuBarItem AND title:Edit"));
await test("about menu item", () => assertExists("role:AXMenuItem AND title:About screenpipe"));
await test("check for updates item", () => assertExists("title~:Check for Updates"));

await screenshot("02-main-window");

const ok = summary();
process.exit(ok ? 0 : 1);
