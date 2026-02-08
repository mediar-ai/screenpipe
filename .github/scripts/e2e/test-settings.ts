import {
  suite, test, summary, screenshot, assertExists, click,
  shortcut, sleep, TIMEOUT_MEDIUM,
  sel, shortcuts, IS_WINDOWS, IS_MACOS, bb,
} from "./lib";

suite("settings page");

// Settings UI tests require full window access which is only
// reliably available on macOS via accessibility APIs.
// On Windows, Tauri WebView2 UIA tree access is limited.
if (IS_MACOS) {
  async function openSettings() {
    await click("role:AXMenuBarItem AND title:screenpipe");
    await sleep(500);
    await click("role:AXMenuItem AND title:Settings...");
    await sleep(3000);
  }

  async function navigateTo(label: string) {
    await click(sel.staticText(label));
    await sleep(1000);
  }

  async function assertLoaded() {
    await assertExists(sel.webArea, TIMEOUT_MEDIUM);
  }

  await test("open settings", async () => {
    await openSettings();
    await assertLoaded();
  });

  const sections = ["General", "Recording", "AI", "Shortcuts", "Account", "Disk", "Connections", "Feedback"];
  for (const section of sections) {
    await test(`${section.toLowerCase()} section loads`, async () => {
      await navigateTo(section);
      await assertLoaded();
      await screenshot(`settings-${section.toLowerCase()}`);
    });
  }

  await test("close settings", async () => {
    const s = shortcuts.closeWindow;
    await shortcut(s.key, s.modifiers);
    await sleep(1000);
  });
}

if (IS_WINDOWS) {
  // On Windows, verify we can at least send the show shortcut
  // and take a screenshot showing the state
  await test("send show shortcut", async () => {
    const s = shortcuts.showApp;
    await shortcut(s.key, s.modifiers);
    await sleep(2000);
  });

  await test("screenshot of app state", async () => {
    await screenshot("settings-windows");
  });
}

const ok = summary();
process.exit(ok ? 0 : 1);
