"use server";

import cron from "node-cron";
import { pipe, Settings } from "@screenpipe/js";
import puppeteer from "puppeteer";
import type { Browser, CookieParam, Page } from "puppeteer";
import { generateText, streamObject, type LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { ollama } from "ollama-ai-provider";
import { z } from "zod";
import { eventEmitter } from "@/lib/events";

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

export interface ProgressUpdate {
  process: number;
  value: number;
}

const summaries: string[] = [];
const timeline: Tweet[] = [];
const suggestions: Suggestion[] = [];

let browser: Browser | null = null;
let profileJob: any = null;
let ocrJob: any = null;
let timelineJob: any = null;
let suggestionJob: any = null;

export async function runBot(
  settings: Settings,
  cookies: CookieParam[],
): Promise<boolean> {
  await stopBot();

  browser = await puppeteer.launch({ headless: true });

  const model = await getModel(settings)
  if (!model) {
    return false;
  }

  launchProcesses(cookies, model);

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
  if (suggestionJob) {
    suggestionJob.stop();
    suggestionJob = null;
  }
  if (browser) {
    await browser.close();
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
    await page.close();
    return false;
  }
}

async function launchProcesses(
  cookies: CookieParam[],
  model: LanguageModel,
): Promise<void> {
  await Promise.all([
    profileProcess(cookies, model),
    ocrProcess(model),
    timelineProcess(cookies),
  ]);
  await suggestionProcess(model);

  profileJob = cron.schedule("0 * * * *", () => profileProcess(cookies, model));
  ocrJob = cron.schedule("*/2 * * * *", () => ocrProcess(model));
  timelineJob = cron.schedule("*/2 * * * *", () => timelineProcess(cookies));
  suggestionJob = cron.schedule("*/5 * * * *", () => suggestionProcess(model));
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

  try {
    await page.setCookie(...cookies);
    await page.goto("https://x.com/home", { waitUntil: "networkidle2" });

    console.log("Navigating to profile...");
    await page.waitForSelector('a[aria-label="Profile"]');

    const profileUrl = await page.evaluate(() => {
      const profileLink: HTMLLinkElement | null = document.querySelector('a[aria-label="Profile"]');
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
      const handleElement: HTMLDivElement | null = document.querySelector('div[data-testid="UserId"]');
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
        value: ((i + 1) / scrollLimit) * 100,
      });

      // Scroll down and wait for new content to load
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise((resolve) =>
        setTimeout(resolve, 500 + Math.random() * 500),
      );
    }

    const tweetArray = Array.from(tweets).map((s: string) => JSON.parse(s));

    const { text } = await generateText({
      model,
      prompt: `
You are an AI assistant analyzing a Twitter user's profile and engagement patterns to generate a concise summary.

### **Instructions:**
- Analyze the user's bio, tweets, and engagement style to determine key themes.  
- Summarize their primary interests in a way that reflects both their focus areas and any unique perspectives they bring.
- Describe their writing style (e.g., formal, casual, witty, thought-provoking) and how they communicate with their audience.
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
    summaries.push(text);
  } catch (e) {
    console.error("Error in profile process:", e);
  }

  eventEmitter.emit("updateProgress", { process: 0, value: 100 });
  await page.close();
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
    const context = res?.data.map((e) => e.content)
    eventEmitter.emit("updateProgress", { process: 1, value: 50 });

    const { text } = await generateText({
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
    summaries.push(text);

    lastCheck = new Date();
    console.log("Analyzed OCR data.");
  } catch (e) {
    console.error("Error in OCR process:", e);
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
    const tweetArray = Array.from(tweets).map((s: string) => JSON.parse(s));
    console.log(`Collected ${tweetArray.length} tweets.`);

    timeline.push(...tweetArray);
  } catch (e) {
    console.error("Error in timeline process:", e);
  }

  eventEmitter.emit("updateProgress", { process: 2, value: 100 });
  await page.close();
}

async function suggestionProcess(model: LanguageModel): Promise<void> {
  if (!browser || !browser.connected) {
    await stopBot();
    return;
  }

  eventEmitter.emit("updateProgress", { process: 3, value: 0 });

  try {
    console.log("Creating suggestions...");

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
- Prioritize tweets that align with the user’s niche, past tweets, and bio.
- If a tweet is only loosely relevant but has high engagement, consider the visibility benefits.
- Match the user's writing style (e.g., casual, professional, witty).
- If the user is an expert, suggest insightful or debate-provoking replies.
- If the user asks a lot of questions, favor responses that encourage further discussion.
- Higher scores indicate better relevance, engagement potential, or visibility.
- Recommend an optimal time to reply. Timestamps should match the format of provided tweet data.
- Reasons for the suggestion should be in second person.
- Only include hashtags that match those used by the user in previous tweets.

### **User Summaries:**
\`\`\`json
${JSON.stringify(summaries, null, 2)}
\`\`\`

### **Tweets To Analyze:**
\`\`\`json
${JSON.stringify(timeline, null, 2)}
\`\`\`
            `,
      temperature: 0.7,
    });

    let i = 0;
    for await (const suggestion of elementStream) {
      eventEmitter.emit("addSuggestion", suggestion);

      if (i < 5) {
        eventEmitter.emit("updateProgress", {
          process: 3,
          value: (i + 1) * 20 - 1,
        });
      }

      i += 1;
    }

    timeline.length = 0;

    console.log("Created suggestions.");
  } catch (e) {
    console.error("Error in suggestion process:", e);
  }

  eventEmitter.emit("updateProgress", { process: 3, value: 100 });
}

async function getModel(settings: Settings): Promise<LanguageModel | null> {
  switch (settings.aiProviderType) {
    case "openai":
      if (!settings.openaiApiKey) {
        if (browser) await browser.close();
        return null;
      }

      process.env.OPENAI_API_KEY = settings.openaiApiKey;
      return openai("gpt-4o") as LanguageModel;
    case "native-ollama":
      try {
        const response = await fetch("http://localhost:11434/api/tags");
        if (!response.ok) throw new Error();
      } catch {
        if (browser) await browser.close();
        return null;
      }

      return ollama("deepseek-r1") as LanguageModel;
    case "screenpipe-cloud":
      if (!settings.user?.token) {
        if (browser) await browser.close();
        return null;
      }

      process.env.OPENAI_API_KEY = settings.user.token;
      return openai("gpt-4o") as LanguageModel;
    case "custom":
      if (!settings.openaiApiKey) {
        if (browser) await browser.close();
        return null;
      }

      process.env.OPENAI_API_KEY = settings.openaiApiKey;
      return openai("gpt-4o") as LanguageModel;
  }
  return null;
}

async function scrapeTweets(page: Page): Promise<Tweet[]> {
  return await page.evaluate(() => {
    const tweetElements = document.querySelectorAll("article");
    return Array.from(tweetElements).map((tweet) => {
      const textElement: HTMLDivElement | null = tweet.querySelector("div[lang]");
      const linkElement: HTMLLinkElement | null = tweet.querySelector("a[role='link']");
      const userElement: HTMLSpanElement | null = tweet.querySelector("a[role='link'] span");
      const timestampElement: HTMLTimeElement | null = tweet.querySelector("time");
      const tweetLink: HTMLLinkElement | null = tweet.querySelector("a[role='link'][href*='/status/']");
      const engagementElements: NodeListOf<HTMLSpanElement> = tweet.querySelectorAll(
        "div[role='group'] span",
      );

      const extractNumber = (text: string | undefined) =>
        text ? parseInt(text.replace(/\D/g, ""), 10) || 0 : 0;

      return {
        tweetId: tweetLink
          ? tweetLink.href.split("/status/")[1].split("/")[0]
          : null,
        text: textElement ? textElement.innerText : null,
        handle: linkElement ? linkElement.href.split("/")[1] : null,
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
