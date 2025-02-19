"use server";

import puppeteer, { type CookieParam } from "puppeteer-core";
import { getBrowserWSEndpoint } from "@/lib/actions/connect-browser";

export async function signInToTwitter(): Promise<CookieParam[]> {
  const browserWSEndpoint = await getBrowserWSEndpoint();
  const browser = await puppeteer.connect({ browserWSEndpoint });
  const page = await browser.newPage();

  await page.goto("https://x.com/login", { waitUntil: "networkidle2" });

  return new Promise((resolve, reject) => {
    let disconnected = false;

    page.on("framenavigated", async (frame) => {
      const url = frame.url();

      if (url.startsWith("https://x.com/home")) {
        try {
          if (!disconnected) {
            const cookies = await page.cookies();
            await page.close();
            await browser.disconnect();
            disconnected = true;
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
      if (!disconnected) {
        console.error("Login timeout.");
        await page.close();
        await browser.disconnect();
        disconnected = true;
        reject(new Error("Login timeout"));
      }
    }, 120_000);
  });
}
