import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:9223",
    trace: "on-first-retry",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "tauri",
      testMatch: /.*\.spec\.ts/,
    },
  ],
});
