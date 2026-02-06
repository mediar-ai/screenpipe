import {
  suite, test, summary, screenshot, assertExists, click,
  shortcut, sleep, TIMEOUT_MEDIUM,
  sel, shortcuts, IS_WINDOWS, IS_MACOS, bb,
} from "./lib";

suite("settings page");

async function openSettings() {
  if (IS_MACOS) {
    await click("role:AXMenuBarItem AND title:screenpipe");
    await sleep(500);
    await click("role:AXMenuItem AND title:Settings...");
  } else {
    // On Windows, open via tray menu or navigate within the app
    // First ensure main window is open
    await bb("activate", "screenpipe-app");
    await sleep(500);
    const s = shortcuts.showApp;
    await shortcut(s.key, s.modifiers);
    await sleep(2000);
    // Try clicking a settings button/link in the UI
    try {
      await click(sel.titleContains("settings"));
    } catch {
      // Fallback: try the gear icon or settings text
      try {
        await click(sel.button("settings"));
      } catch {
        // Last resort: look for any settings-related element
        await click(sel.titleContains("Settings"));
      }
    }
  }
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

const ok = summary();
process.exit(ok ? 0 : 1);
