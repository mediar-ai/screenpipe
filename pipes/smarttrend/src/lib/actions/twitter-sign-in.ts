"use server";

import puppeteer, { type CookieParam } from "puppeteer";

export async function signInToTwitter(): Promise<CookieParam[]> {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto("https://x.com/login", { waitUntil: "networkidle2" });

  return new Promise((resolve, reject) => {
    let closed = false;

    page.on("framenavigated", async (frame) => {
      const url = frame.url();

      if (url.startsWith("https://x.com/home")) {
        try {
          if (!closed) {
            const cookies = await page.cookies();
            await browser.close();
            closed = true;
            resolve(cookies);
          }
        } catch (error) {
          console.error("Error retrieving cookies:", error);
          reject(error);
        }
      }
    });

    // Timeout in case login is not completed
    setTimeout(async () => {
      if (!closed) {
        console.error("Login timeout. Closing browser.");
        await browser.close();
        closed = true;
        reject(new Error("Login timeout"));
      }
    }, 120_000);
  });
}
