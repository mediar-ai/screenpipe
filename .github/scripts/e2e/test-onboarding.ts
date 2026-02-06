import {
  suite, test, summary, screenshot, assertExists, click,
  press, scrape, sleep, TIMEOUT_MEDIUM,
  sel, IS_WINDOWS, IS_MACOS, bb, shortcuts, shortcut,
} from "./lib";

suite("onboarding flow");

await test("trigger onboarding", async () => {
  if (IS_MACOS) {
    await click("role:AXMenuBarItem AND title:screenpipe");
    await sleep(500);
    try {
      await click("role:AXMenuItem AND title:onboarding");
    } catch {
      await press("Escape");
      await sleep(500);
    }
  } else {
    // On Windows, try to trigger onboarding via tray or menu
    await bb("activate", "screenpipe-app");
    await sleep(500);
    const s = shortcuts.showApp;
    await shortcut(s.key, s.modifiers);
    await sleep(2000);
    // Try to find onboarding trigger in the UI
    try {
      await click(sel.titleContains("onboarding"));
    } catch {
      // May not be available if already completed — that's ok
    }
  }
  await sleep(3000);
  await assertExists(sel.webArea, TIMEOUT_MEDIUM);
});

await test("onboarding has skip/content", async () => {
  const result = await scrape();
  const texts: string[] = (result?.data?.items ?? []).map((i: any) => (i.text ?? "").toLowerCase());
  const allText = texts.join(" ");
  const keywords = ["skip", "next", "continue", "get started", "welcome", "screenpipe", "setup"];
  if (!keywords.some((kw) => allText.includes(kw))) {
    throw new Error(`no onboarding keywords found in: ${allText.slice(0, 200)}`);
  }
});

await test("onboarding screenshot", () => screenshot("onboarding-step1"));

await test("close onboarding", async () => {
  await press("Escape");
  await sleep(1000);
});

const ok = summary();
process.exit(ok ? 0 : 1);
