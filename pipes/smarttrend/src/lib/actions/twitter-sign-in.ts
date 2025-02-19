"use server";

import puppeteer, { type CookieParam } from "puppeteer-core";
import { eventEmitter } from "@/lib/events";
import { getBrowserWSEndpoint } from "@/lib/actions/connect-browser";

export async function signInToTwitter(): Promise<CookieParam[]> {
  const browserWSEndpoint = await getBrowserWSEndpoint();
  if (!browserWSEndpoint) {
    return [];
  }

  const browser = await puppeteer.connect({ browserWSEndpoint });
  const page = await browser.newPage();

  await page.goto("https://x.com/login", { waitUntil: "networkidle2" });

  if (page.url().startsWith("https://x.com/home")) {
    try {
      const cookies = await page.cookies();
      await page.close();
      await browser.disconnect();
      return cookies;
    } catch (error) {
      eventEmitter.emit("catchError", {
        title: "Error connecting to Twitter.",
        description: "Could not retrieve cookies.",
      });
      console.error("Error retrieving cookies:", error);
      return [];
    }
  }

  return await new Promise((resolve, reject) => {
    let disconnected = false;

    page.on("framenavigated", async (frame) => {
      if (frame.url().startsWith("https://x.com/home")) {
        try {
          if (!disconnected) {
            const cookies = await page.cookies();
            await page.close();
            await browser.disconnect();
            disconnected = true;
            resolve(cookies);
          }
        } catch (error) {
          eventEmitter.emit("catchError", {
            title: "Error connecting to Twitter.",
            description: "Could not retrieve cookies.",
          });
          console.error("Error retrieving cookies:", error);
          reject(error);
        }
      }
    });

    // Timeout in case login is not completed
    setTimeout(async () => {
      if (!disconnected) {
        await page.close();
        await browser.disconnect();
        disconnected = true;

        eventEmitter.emit("catchError", {
          title: "Error connecting to Twitter.",
          description: "Session timed out.",
        });
        console.error("Login timeout.");
        reject(new Error("Login timeout."));
      }
    }, 120_000);
  });
}
