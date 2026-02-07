import {
  suite, test, summary, screenshot, assertExists,
  shortcut, find, click, sleep, TIMEOUT_MEDIUM,
  sel, shortcuts, bb, IS_WINDOWS, IS_MACOS,
} from "./lib";

suite("chat");

if (IS_MACOS) {
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
  });
}

if (IS_WINDOWS) {
  // On Windows, the Tauri WebView2 UIA tree is limited.
  // We verify the process is alive and take a screenshot.
  await test("screenpipe process alive", async () => {
    const result = await bb("find", "name~:screenpi");
    const elements = result?.data ?? [];
    if (elements.length === 0) throw new Error("screenpipe not found");
  });
}

await screenshot("05-chat");

const ok = summary();
process.exit(ok ? 0 : 1);
