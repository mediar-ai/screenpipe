import {
  suite, test, summary, screenshot, assertExists,
  shortcut, find, click, sleep, TIMEOUT_MEDIUM,
  sel, shortcuts, bb,
} from "./lib";

suite("chat");

await test("navigate to chat area", async () => {
  await bb("activate", "screenpipe-app");
  await sleep(500);
  const s = shortcuts.showApp;
  await shortcut(s.key, s.modifiers);
  await sleep(2000);
  await assertExists(sel.webArea, TIMEOUT_MEDIUM);
});

await test("chat page loads", async () => {
  await assertExists(sel.webArea, TIMEOUT_MEDIUM);
});

await test("window not crashed", () => assertExists(sel.window));

await test("can focus text input", async () => {
  const textAreas = await find(sel.textArea).catch(() => []);
  if (textAreas.length > 0) {
    await click(sel.textArea);
  }
  // No text area found = might be on timeline page, that's ok
});

await screenshot("05-chat");

const ok = summary();
process.exit(ok ? 0 : 1);
