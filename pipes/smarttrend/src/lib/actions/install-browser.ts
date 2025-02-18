"use server";

import {
  install,
  Browser,
  resolveBuildId,
  detectBrowserPlatform,
} from "@puppeteer/browsers";

export async function installBrowser(): Promise<string> {
  const platform = detectBrowserPlatform();
  const buildId = await resolveBuildId(Browser.CHROME, platform, "latest");
  const { executablePath } = await install({
    browser: Browser.CHROME,
    cacheDir: process.cwd(),
    platform,
    buildId,
  });
  return executablePath;
}
