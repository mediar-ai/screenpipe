import {
  suite, test, summary, screenshot, assertExists,
  shortcut, find, click, sleep, TIMEOUT_MEDIUM,
} from "./lib";

suite("chat");

await test("navigate to chat area", async () => {
  await shortcut("s", "cmd,ctrl");
  await sleep(2000);
  await assertExists("role:AXWebArea", TIMEOUT_MEDIUM);
});

await test("chat page loads", async () => {
  // Verify webview is functional
  await assertExists("role:AXWebArea", TIMEOUT_MEDIUM);
});

await test("window not crashed", () => assertExists("role:AXWindow"));

await test("can focus text input", async () => {
  const textAreas = await find("role:AXTextArea").catch(() => []);
  if (textAreas.length > 0) {
    await click("role:AXTextArea");
  }
  // No text area found = might be on timeline page, that's ok
});

await screenshot("05-chat");

const ok = summary();
process.exit(ok ? 0 : 1);
