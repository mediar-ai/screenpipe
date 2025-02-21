"use server";

import cron from "node-cron";
import { pipe, Settings } from "@screenpipe/js";
import puppeteer from "puppeteer-core";
import type { Browser, CookieParam, Page } from "puppeteer-core";
import {
  streamText,
  streamObject,
  TypeValidationError,
  type LanguageModel,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { ollama } from "ollama-ai-provider";
import { z } from "zod";
import * as store from "@/lib/store";
import { eventEmitter } from "@/lib/events";
import { getBrowserWSEndpoint } from "@/lib/actions/connect-browser";

export interface Tweet {
  tweetId: string | null;
  text: string | null;
  username: string | null;
  handle: string | null;
  timestamp: string | null;
  replies: number;
  retweets: number;
  likes: number;
  views: number;
}

export interface Suggestion {
  tweetId: string;
  handle: string;
  reason: string;
  reply: string;
}

let browser: Browser | null = null;
let pages: Page[] = [];

let profileJob: any = null;
let ocrJob: any = null;
let timelineJob: any = null;
let summaryJob: any = null;
let suggestionJob: any = null;

export async function runBot(
  settings: Settings,
  cookies: CookieParam[],
  prompt: string,
): Promise<boolean> {
  await stopBot();

  const model = await getModel(settings);
  if (!model) {
    eventEmitter.emit("catchError", {
      title: "Error finding AI model.",
      description: "Your AI model settings are not configured correctly.",
    });
    return false;
  }

  const browserWSEndpoint = await getBrowserWSEndpoint();
  if (!browserWSEndpoint) {
    return false;
  }

  browser = await puppeteer.connect({ browserWSEndpoint });

  launchProcesses(cookies, prompt, model);

  return true;
}

export async function stopBot(): Promise<void> {
  if (profileJob) {
    profileJob.stop();
    profileJob = null;
  }
  if (ocrJob) {
    ocrJob.stop();
    ocrJob = null;
  }
  if (timelineJob) {
    timelineJob.stop();
    timelineJob = null;
  }
  if (summaryJob) {
    summaryJob.stop();
    summaryJob = null;
  }
  if (suggestionJob) {
    suggestionJob.stop();
    suggestionJob = null;
  }
  if (browser) {
    await Promise.all(
      pages.filter((page) => !page.isClosed()).map((page) => page.close()),
    );
    pages.length = 0;
    await browser.disconnect();
    browser = null;
  }
}

export async function postReply(
  cookies: CookieParam[],
  suggestion: Suggestion,
): Promise<boolean> {
  if (!browser || !browser.connected) {
    await stopBot();
    return false;
  }

  const page = await browser.newPage();
  pages.push(page);

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
    if (!page.isClosed()) await page.close();
    return false;
  }
}

async function launchProcesses(
  cookies: CookieParam[],
  prompt: string,
  model: LanguageModel,
): Promise<void> {
  await Promise.all([
    profileProcess(cookies, model),
    ocrProcess(model),
    timelineProcess(cookies),
  ]);
  await Promise.all([summaryProcess(model), suggestionProcess(prompt, model)]);

  profileJob = cron.schedule("*/30 * * * *", () =>
    profileProcess(cookies, model),
  );
  ocrJob = cron.schedule("*/2 * * * *", () => ocrProcess(model));
  timelineJob = cron.schedule("*/2 * * * *", () => timelineProcess(cookies));
  summaryJob = cron.schedule("*/5 * * * *", () => summaryProcess(model));
  suggestionJob = cron.schedule("*/5 * * * *", () =>
    suggestionProcess(prompt, model),
  );
}

async function profileProcess(
  cookies: CookieParam[],
  model: LanguageModel,
  scrollLimit: number = 10,
): Promise<void> {
  if (!browser || !browser.connected) {
    await stopBot();
    return;
  }

  eventEmitter.emit("updateProgress", { process: 0, value: 0 });

  const page = await browser.newPage();
  pages.push(page);

  try {
    await page.setCookie(...cookies);
    await page.goto("https://x.com/home", { waitUntil: "networkidle2" });

    console.log("Navigating to profile...");
    await page.waitForSelector('a[aria-label="Profile"]');

    const profileUrl = await page.evaluate(() => {
      const profileLink: HTMLLinkElement | null = document.querySelector(
        'a[aria-label="Profile"]',
      );
      return profileLink ? profileLink.href : null;
    });

    await page.goto(`${profileUrl}/with_replies`, {
      waitUntil: "networkidle2",
    });

    await page.waitForSelector('div[data-testid="UserName"]', {
      visible: true,
    });

    console.log("Extracting profile data...");

    const profileData = await page.evaluate(() => {
      const nameElement: HTMLSpanElement | null = document.querySelector(
        'div[data-testid="UserName"] span',
      );
      const handleElement: HTMLDivElement | null = document.querySelector(
        'div[data-testid="UserId"]',
      );
      const bioElement: HTMLDivElement | null = document.querySelector(
        'div[data-testid="UserDescription"]',
      );
      // const statsElements: HTMLSpanElement | null = document.querySelectorAll(
      //   'div[data-testid="UserStats"] span',
      // );

      return {
        name: nameElement ? nameElement.innerText : null,
        handle: handleElement ? handleElement.innerText : null,
        bio: bioElement ? bioElement.innerText : null,
      };
    });

    let tweets = new Set<string>();

    for (let i = 0; i < scrollLimit; i++) {
      console.log(`Scrolling... (${i + 1}/${scrollLimit})`);

      // Extract tweets on the current view
      const newTweets = await scrapeTweets(page);
      newTweets.forEach((tweet) => tweets.add(JSON.stringify(tweet)));

      eventEmitter.emit("updateProgress", {
        process: 0,
        value: ((i + 1) / scrollLimit) * 50,
      });

      // Scroll down and wait for new content to load
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise((resolve) =>
        setTimeout(resolve, 500 + Math.random() * 500),
      );
    }

    const tweetArray = Array.from(tweets).map((s: string) => JSON.parse(s));

    const { fullStream } = await streamText({
      model,
      prompt: `
You are an AI assistant analyzing a Twitter user's profile and engagement patterns to generate a concise summary.

### **Instructions:**
- Analyze the user's bio, tweets, and engagement style to determine key themes.  
- Summarize their primary interests in a way that reflects both their focus areas and any unique perspectives they bring.
- Create a detailed description of their writing style (punctuation, grammar, habits, etc).
- Mention any repeated hashtags or frequently mentioned accounts, highlighting any notable connections or communities they engage with. 
- Keep the summary engaging and concise.

### **User Profile Data**
\`\`\`json
${JSON.stringify(profileData, null, 2)}
\`\`\`

### **User Tweets**
\`\`\`json
${JSON.stringify(tweetArray, null, 2)}
\`\`\`
            `,
    });

    let summary = "";
    let i = 0;
    for await (const chunk of fullStream) {
      const text = getText(chunk);
      if (text) {
        summary += text;

        if (i < 99) {
          eventEmitter.emit("updateProgress", {
            process: 0,
            value: 50 + (i + 1) / 2,
          });
        }

        i += 1;
      }
    }

    await store.pushSummary(summary);
  } catch (e) {
    console.error("Error in profile process:", e);
    if (browser)
      eventEmitter.emit("catchError", {
        title: "Error analyzing profile.",
        description: "Issue with AI model or browser instance.",
      });
  }

  if (!page.isClosed()) await page.close();
  eventEmitter.emit("updateProgress", { process: 0, value: 100 });
}

let lastCheck: Date | null = null;

async function ocrProcess(model: LanguageModel): Promise<void> {
  if (!browser || !browser.connected) {
    await stopBot();
    return;
  }

  eventEmitter.emit("updateProgress", { process: 1, value: 0 });

  try {
    console.log("Analyzing OCR data...");

    const res = await pipe.queryScreenpipe({
      contentType: "ocr",
      limit: 10,
      startTime: lastCheck ? lastCheck.toISOString() : undefined,
    });
    const context = res?.data.map((e) => e.content);

    const { fullStream } = await streamText({
      model,
      prompt: `
You are an AI assistant analyzing OCR-extracted text to identify key insights, trends, and relevant topics.

### **Instructions:**
- Summarize the main topics detected in the extracted text.
- Identify recurring themes or keywords and their context.
- Determine if the content relates to a specific niche, such as technology, politics, finance, gaming, or another domain.
- Analyze tone and intent (e.g., is the text informative, promotional, opinion-based, or casual?).
- Extract any actionable insights, such as trending discussions, important facts, or engagement opportunities.
- If applicable, suggest relevant hashtags, mentions, or follow-up content based on the extracted text.

### **Extracted OCR Data**
\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`
            `,
    });

    let summary = "";
    let i = 0;
    for await (const chunk of fullStream) {
      const text = getText(chunk);
      if (text) {
        summary += text;

        if (i < 99) {
          eventEmitter.emit("updateProgress", { process: 1, value: i + 1 });
        }

        i += 1;
      }
    }

    await store.pushSummary(summary);
    lastCheck = new Date();

    console.log("Analyzed OCR data.");
  } catch (e) {
    console.error("Error in OCR process:", e);
    if (browser)
      eventEmitter.emit("catchError", {
        title: "Error analyzing OCR data.",
        description: "AI model failed to generate a response.",
      });
  }

  eventEmitter.emit("updateProgress", { process: 1, value: 100 });
}

async function timelineProcess(
  cookies: CookieParam[],
  scrollLimit: number = 10,
): Promise<void> {
  if (!browser || !browser.connected) {
    await stopBot();
    return;
  }

  eventEmitter.emit("updateProgress", { process: 2, value: 0 });

  const page = await browser.newPage();
  pages.push(page);

  try {
    await page.setCookie(...cookies);
    await page.goto("https://x.com/home", { waitUntil: "networkidle2" });

    await page.waitForSelector("article");
    console.log("Extracting tweets...");

    let tweets = new Set<string>();

    for (let i = 0; i < scrollLimit; i++) {
      console.log(`Scrolling... (${i + 1}/${scrollLimit})`);

      // Extract tweets on the current view
      const newTweets = await scrapeTweets(page);
      newTweets.forEach((tweet) => tweets.add(JSON.stringify(tweet)));

      eventEmitter.emit("updateProgress", {
        process: 2,
        value: ((i + 1) / scrollLimit) * 100,
      });

      // Scroll down and wait for new content to load
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise((resolve) =>
        setTimeout(resolve, 500 + Math.random() * 500),
      );
    }

    // Convert set back to JSON array
    const tweetArray = Array.from(tweets).map(
      (s: string) => JSON.parse(s) as Tweet,
    );
    console.log(`Collected ${tweetArray.length} tweets.`);

    await store.pushTweets(tweetArray);
  } catch (e) {
    console.error("Error in timeline process:", e);
    if (browser)
      eventEmitter.emit("catchError", {
        title: "Error reading timeline.",
        description: "Could not access browser instance.",
      });
  }

  if (!page.isClosed()) await page.close();
  eventEmitter.emit("updateProgress", { process: 2, value: 100 });
}

async function summaryProcess(model: LanguageModel): Promise<void> {
  if (!browser || !browser.connected) {
    await stopBot();
    return;
  }

  eventEmitter.emit("updateProgress", { process: 3, value: 0 });

  try {
    console.log("Summarizing data...");

    const summaries = await store.getSummaries();

    const { fullStream } = await streamText({
      model,
      prompt: `
You are an AI assistant creating a concise and well-structured summary based on multiple previous summaries.

### **Instructions:**
- Analyze the provided summaries to identify common themes, key insights, and recurring topics.
- Eliminate redundant or overly specific details while preserving the most important information.
- Make sure to include any information about their writing style.
- Ensure the final summary is clear, engaging, and captures the essence of the original summaries.

### **User Summaries**
\`\`\`json
${JSON.stringify(summaries, null, 2)}
\`\`\`
            `,
    });

    let summary = "";
    let i = 0;
    for await (const chunk of fullStream) {
      const text = getText(chunk);
      if (text) {
        summary += text;

        if (i < 99) {
          eventEmitter.emit("updateProgress", { process: 3, value: i + 1 });
        }

        i += 1;
      }
    }

    await store.compileSummaries(summary);

    console.log("Summarized data.");
  } catch (e) {
    console.error("Error in summary process:", e);
    if (browser)
      eventEmitter.emit("catchError", {
        title: "Error summarizing data.",
        description: "AI model failed to generate a response.",
      });
  }

  eventEmitter.emit("updateProgress", { process: 3, value: 100 });
}

async function suggestionProcess(
  prompt: string,
  model: LanguageModel,
): Promise<void> {
  if (!browser || !browser.connected) {
    await stopBot();
    return;
  }

  eventEmitter.emit("updateProgress", { process: 4, value: 0 });

  try {
    console.log("Creating suggestions...");

    const summaries = await store.getSummaries();
    const tweets = (await store.getTweets()).slice(0, 10);

    const schema = z.object({
      tweetId: z.string(),
      handle: z.string(),
      reason: z.string(),
      reply: z.string(),
    });
    const { elementStream } = await streamObject({
      model,
      output: "array",
      schema,
      prompt: `
You are an AI assistant analyzing tweet data to determine the best engagement opportunities. 
Identify tweets that have high engagement, are relevant to the user’s niche, and invite discussion. 
Use summaries of the user's data to add context and improve relevance.
Generate recommended replies and timestamps for selected tweets. Return JSON output.

### **Instructions:**
${prompt}

### **User Summaries:**
\`\`\`json
${JSON.stringify(summaries, null, 2)}
\`\`\`

### **Tweets To Analyze:**
\`\`\`json
${JSON.stringify(tweets, null, 2)}
\`\`\`
            `,
      temperature: 0.7,
    });

    let i = 0;
    for await (const suggestion of elementStream) {
      await store.pushSuggestion(suggestion);
      eventEmitter.emit("addSuggestion", suggestion);

      if (i < 5) {
        eventEmitter.emit("updateProgress", {
          process: 4,
          value: (i + 1) * 20 - 1,
        });
      }

      i += 1;
    }

    if (i === 0) {
      const { fullStream } = await streamText({
        model,
        prompt: `
You are an AI assistant analyzing tweet data to determine the best engagement opportunities. 
Identify tweets that have high engagement, are relevant to the user’s niche, and invite discussion. 
Use summaries of the user's data to add context and improve relevance.
Generate recommended replies and timestamps for selected tweets. Return JSON output.

### **Instructions:**
${prompt}

### **User Summaries:**
\`\`\`json
${JSON.stringify(summaries, null, 2)}
\`\`\`

### **Tweets To Analyze:**
\`\`\`json
${JSON.stringify(tweets, null, 2)}
\`\`\`

### **Response Schema**
Return in the following JSON format:
[{
  tweetId: string,
  handle: string,
  reply: string,
  reason: string
}]
              `,
        temperature: 0.7,
      });

      let data = "";
      let i = 0;
      for await (const chunk of fullStream) {
        const text = getText(chunk);
        if (text) {
          data += text;

          if (i < 99) {
            eventEmitter.emit("updateProgress", { process: 4, value: i + 1 });
          }

          i += 1;
        }
      }

      const extracted = extractBetweenBraces(data);
      if (extracted) {
        const suggestions: Suggestion[] = JSON.parse(extracted);
        for (const suggestion of suggestions) {
          await store.pushSuggestion(suggestion);
          eventEmitter.emit("addSuggestion", suggestion);
        }
      }
    }

    await store.removeTweets(tweets.length);

    console.log("Created suggestions.");
  } catch (e) {
    console.error("Error in suggestion process:", e);
    if (browser)
      eventEmitter.emit("catchError", {
        title: "Error creating suggestions.",
        description: "AI model failed to generate a response.",
      });
  }

  eventEmitter.emit("updateProgress", { process: 4, value: 100 });
}

function getText(chunk: any): string | null {
  if (chunk.type === "deltaText") {
    return chunk.text;
  } else if (chunk.type === "error") {
    if (TypeValidationError.isInstance(chunk.error)) {
      return chunk.error.value.choices[0]?.delta?.content || "";
    } else {
      throw chunk.error;
    }
  } else {
    return null;
  }
}

function extractBetweenBraces(s: string): string | null {
  const firstIndex = s.indexOf("[");
  const lastIndex = s.lastIndexOf("]");

  if (firstIndex !== -1 && lastIndex !== -1 && lastIndex > firstIndex) {
    return s.slice(firstIndex, lastIndex + 1);
  }
  return null;
}

async function getModel(settings: Settings): Promise<LanguageModel | null> {
  let openai;
  switch (settings.aiProviderType) {
    case "openai":
      if (!settings.openaiApiKey) {
        return null;
      }

      openai = createOpenAI({
        apiKey: settings.openaiApiKey,
        baseURL: settings.aiUrl,
      });
      return openai(settings.aiModel) as LanguageModel;
    case "native-ollama":
      try {
        const response = await fetch("http://localhost:11434/api/tags");
        if (!response.ok) throw new Error();
      } catch {
        return null;
      }

      return ollama(settings.aiModel) as LanguageModel;
    case "screenpipe-cloud":
      if (!settings.user?.token) {
        return null;
      }

      openai = createOpenAI({
        apiKey: settings.user.token,
        baseURL: settings.aiUrl,
      });
      return openai(settings.aiModel) as LanguageModel;
    case "custom":
      if (!settings.openaiApiKey) {
        return null;
      }

      openai = createOpenAI({
        apiKey: settings.openaiApiKey,
        baseURL: settings.aiUrl,
      });
      return openai(settings.aiModel) as LanguageModel;
  }
  return null;
}

async function scrapeTweets(page: Page): Promise<Tweet[]> {
  return await page.evaluate(() => {
    const tweetElements = document.querySelectorAll("article");
    return Array.from(tweetElements).map((tweet) => {
      const textElement: HTMLDivElement | null =
        tweet.querySelector("div[lang]");
      const userElement: HTMLSpanElement | null = tweet.querySelector(
        "a[role='link'] span",
      );
      const timestampElement: HTMLTimeElement | null =
        tweet.querySelector("time");
      const tweetLink: HTMLLinkElement | null = tweet.querySelector(
        "a[role='link'][href*='/status/']",
      );
      const engagementElements: NodeListOf<HTMLSpanElement> =
        tweet.querySelectorAll("div[role='group'] span");

      const extractNumber = (text: string | undefined) =>
        text ? parseInt(text.replace(/\D/g, ""), 10) || 0 : 0;

      return {
        tweetId: tweetLink
          ? tweetLink.href.split("/status/")[1].split("/")[0]
          : null,
        text: textElement ? textElement.innerText : null,
        handle: tweetLink
          ? tweetLink.href.split("/status/")[0].split("/").slice(-1)[0]
          : null,
        username: userElement ? userElement.innerText : null,
        timestamp: timestampElement
          ? timestampElement.getAttribute("datetime")
          : null,
        replies:
          engagementElements.length > 0
            ? extractNumber(engagementElements[0].innerText)
            : 0,
        retweets:
          engagementElements.length > 1
            ? extractNumber(engagementElements[1].innerText)
            : 0,
        likes:
          engagementElements.length > 2
            ? extractNumber(engagementElements[2].innerText)
            : 0,
        views:
          engagementElements.length > 3
            ? extractNumber(engagementElements[3].innerText)
            : 0,
      };
    });
  });
}
