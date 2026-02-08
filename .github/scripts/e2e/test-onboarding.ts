import {
  suite, test, summary, screenshot, assertExists, click,
  press, scrape, sleep, TIMEOUT_MEDIUM,
  sel, IS_WINDOWS, IS_MACOS, bb, shortcuts, shortcut,
} from "./lib";

suite("onboarding flow");

if (IS_MACOS) {
  await test("trigger onboarding", async () => {
    await click("role:AXMenuBarItem AND title:screenpipe");
    await sleep(500);
    try {
      await click("role:AXMenuItem AND title:onboarding");
    } catch {
      await press("Escape");
      await sleep(500);
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
}

if (IS_WINDOWS) {
  // On Windows, onboarding UI tests are limited due to WebView2 UIA constraints.
  // We verify the app is responsive.
  await test("screenpipe responsive", async () => {
    const result = await bb("find", "name~:screenpi");
    if ((result?.data ?? []).length === 0) throw new Error("screenpipe not found");
  });

  await test("screenshot", () => screenshot("onboarding-windows"));
}

const ok = summary();
process.exit(ok ? 0 : 1);
