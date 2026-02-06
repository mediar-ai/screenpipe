import {
  suite, test, summary, screenshot, assertExists, click,
  shortcut, sleep, TIMEOUT_MEDIUM,
} from "./lib";

suite("settings page");

async function openSettings() {
  await click("role:AXMenuBarItem AND title:screenpipe");
  await sleep(500);
  // "Settings..." (with ellipsis) is the exact menu item title
  await click("role:AXMenuItem AND title:Settings...");
  await sleep(3000);
}

async function navigateTo(label: string) {
  await click(`role:AXStaticText AND name~:${label}`);
  await sleep(1000);
}

async function assertLoaded() {
  await assertExists("role:AXWebArea", TIMEOUT_MEDIUM);
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
  await shortcut("w", "cmd");
  await sleep(1000);
});

const ok = summary();
process.exit(ok ? 0 : 1);
