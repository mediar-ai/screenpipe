import { test, expect, chromium } from "@playwright/test";

// bunx playwright test tests/e2e/app.spec.ts --grep "basic app functionality" --timeout 300000

test("basic app functionality", async () => {
  test.setTimeout(120000); // 2 minutes timeout

  // Connect to the running Tauri application
  const browser = await chromium.connectOverCDP("http://localhost:9223");
  console.log("browser", browser);
  const context = browser.contexts()[0];
  console.log("context", context);
  const page = context.pages()[0];

  try {
    // Wait for the app to be fully loaded
    await page.waitForLoadState("networkidle");

    // Basic title check
    await expect(page).toHaveTitle(/screenpipe/);

    // Check if main container is visible
    await expect(page.locator("#app")).toBeVisible();
  } finally {
    await browser.close();
  }
});
