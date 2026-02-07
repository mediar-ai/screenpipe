import {
  suite, test, summary, screenshot, assertHealthField,
  shortcut, scrape, tree, sleep, IS_WINDOWS, IS_MACOS,
  shortcuts, sel, bb,
} from "./lib";

suite("permissions");

if (IS_MACOS) {
  await test("no permission banner when granted", async () => {
    await shortcut("s", "cmd,ctrl");
    await sleep(2000);
    const result = await scrape();
    const texts: string[] = (result?.data?.items ?? []).map((i: any) => (i.text ?? "").toLowerCase());
    const allText = texts.join(" ");
    const warningKeywords = ["permission", "grant", "missing", "denied", "allow"];
    for (const kw of warningKeywords) {
      if (allText.includes(kw) && (allText.includes("grant") || allText.includes("missing") || allText.includes("denied"))) {
        throw new Error(`permission warning found: "${kw}" in UI text`);
      }
    }
  });

  await test("screen recording permission", () => assertHealthField("frame_status", "ok"));
  await test("microphone permission", () => assertHealthField("audio_status", "ok"));

  await test("accessibility permission", async () => {
    const result = await tree();
    if (!result?.success) throw new Error("cannot read accessibility tree");
    const count = result?.data?.element_count ?? 0;
    if (count < 5) throw new Error(`only ${count} elements — accessibility may not be granted`);
  });
}

if (IS_WINDOWS) {
  await test("screen recording permission", () => assertHealthField("frame_status", "ok"));

  await test("bb can enumerate windows", async () => {
    const result = await bb("apps");
    const apps = result?.data ?? [];
    if (apps.length === 0) throw new Error("bb cannot list any windows");
  });

  await test("bb can take screenshot", async () => {
    await screenshot("permissions-screenshot-test");
  });

  await test("bb keyboard input works", async () => {
    await bb("press", "Escape");
  });
}

await screenshot("04-permissions");

const ok = summary();
process.exit(ok ? 0 : 1);
