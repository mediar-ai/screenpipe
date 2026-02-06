import {
  suite, test, summary, screenshot, assertExists, click,
  press, scrape, sleep, TIMEOUT_MEDIUM,
} from "./lib";

suite("onboarding flow");

await test("trigger onboarding from tray", async () => {
  // Use app menu bar (tray AXPress unreliable)
  await click("role:AXMenuBarItem AND title:screenpipe");
  await sleep(500);
  // Onboarding might be a menu item or we trigger via tray
  // Try finding the onboarding tray item directly
  try {
    await click("role:AXMenuItem AND title:onboarding");
  } catch {
    // Fall back to pressing escape and trying tray
    await press("Escape");
    await sleep(500);
  }
  await sleep(3000);
  await assertExists("role:AXWebArea", TIMEOUT_MEDIUM);
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
