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
  await test("screen recording permission (S6.1)", () => assertHealthField("frame_status", "ok"));

  await test("bb can enumerate windows (S6.1)", async () => {
    const result = await bb("apps");
    const apps = result?.data ?? [];
    if (apps.length === 0) throw new Error("bb cannot list any windows");
  });

  await test("bb can take screenshot (S6.1)", async () => {
    await screenshot("permissions-screenshot-test");
  });

  await test("bb keyboard input works (S6.1)", async () => {
    await bb("press", "Escape");
  });

  await test("no permission banner visible (S6.4)", async () => {
    // On Windows, there's no macOS-style permission banner
    // but we verify the app doesn't show its own permission error
    const { fetchJson, HEALTH_URL } = await import("./lib");
    const health = await fetchJson(HEALTH_URL);
    if (health.frame_status !== "ok") {
      console.log(`  warning: frame_status=${health.frame_status} — may indicate permission issue`);
    }
    // App should not be showing a "permission denied" state
    if (health.status === "error" && String(health.message ?? "").toLowerCase().includes("permission")) {
      throw new Error("permission error detected in health status");
    }
    console.log("  no permission errors detected");
  });

  await test("app can access filesystem for DB (S6.1)", async () => {
    // Verify app has filesystem permission by checking search works
    const { fetchJson } = await import("./lib");
    const data = await fetchJson("http://localhost:3030/search?limit=1");
    if (!data?.data) {
      throw new Error("search failed — possible filesystem permission issue");
    }
    console.log("  filesystem access OK (search works)");
  });
}

await screenshot("04-permissions");

const ok = summary();
process.exit(ok ? 0 : 1);
