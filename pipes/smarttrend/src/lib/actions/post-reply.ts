"use server";

import puppeteer, { type CookieParam } from "puppeteer-core";
import { eventEmitter } from "@/lib/events";
import { getBrowserWSEndpoint } from "@/lib/actions/connect-browser";
import type { Suggestion } from "@/lib/actions/run-bot";

export async function postReply(
  cookies: CookieParam[],
  suggestion: Suggestion,
): Promise<boolean> {
  const browserWSEndpoint = await getBrowserWSEndpoint();
  if (!browserWSEndpoint) {
    return false;
  }

  const browser = await puppeteer.connect({ browserWSEndpoint });

  const page = await browser.newPage();

  try {
    await page.setCookie(...cookies);

    const url = `https://x.com/${suggestion.handle}/status/${suggestion.tweetId}`;
    console.log(`Replying to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle2" });

    await page.waitForSelector('div[role="textbox"]', { visible: true });
    await page.click('div[role="textbox"]');
    await page.type('div[role="textbox"]', suggestion.reply, { delay: 15 });

    await page.waitForSelector('button[data-testid="tweetButtonInline"]', {
      visible: true,
    });
    await page.click('button[data-testid="tweetButtonInline"]');

    console.log("Reply posted.");
    await page.close();
    return true;
  } catch (e) {
    console.error("Error posting reply:", e);
    eventEmitter.emit("catchError", {
      title: "Error posting reply.",
      description: "Could not access browser instance.",
    });
    await page.close();
    return false;
  }
}
