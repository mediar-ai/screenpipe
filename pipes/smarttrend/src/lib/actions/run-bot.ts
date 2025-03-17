"use server";

import cron from "node-cron";
import { pipe, Settings } from "@screenpipe/js";
import puppeteer from "puppeteer-core";
import type { Browser, CookieParam, Page } from "puppeteer-core";
import OpenAI from "openai";
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
let profilePage: Page | null = null;
let timelinePage: Page | null = null;

let profileJob: any = null;
let ocrJob: any = null;
let timelineJob: any = null;
let summaryJob: any = null;
let suggestionJob: any = null;

export async function runBot(
  settings: Partial<Settings>,
  cookies: CookieParam[],
  frequency: number,
  prompt: string,
): Promise<boolean> {
  await stopBot();

  const openai = await getOpenAI(settings);
  if (!openai) {
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

  launchProcesses(cookies, frequency, prompt, openai, settings);

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
  if (profilePage && !profilePage.isClosed()) {
    await profilePage.close();
    profilePage = null;
  }
  if (timelinePage && !timelinePage.isClosed()) {
    await timelinePage.close();
    timelinePage = null;
  }
  if (browser && browser.isConnected()) {
    await browser.disconnect();
    browser = null;
  }
}

async function launchProcesses(
  cookies: CookieParam[],
  frequency: number,
  prompt: string,
  openai: OpenAI,
  settings: Partial<Settings>,
): Promise<void> {
  await Promise.all([
    profileProcess(cookies, openai, settings),
    ocrProcess(openai, settings),
    timelineProcess(cookies),
  ]);
  await Promise.all([
    summaryProcess(openai, settings),
    suggestionProcess(prompt, openai, settings),
  ]);

  const interval = 5 - frequency + 1;
  profileJob = cron.schedule(`*/${10 * interval} * * * *`, () =>
    profileProcess(cookies, openai, settings),
  );
  ocrJob = cron.schedule(`*/${2 * interval} * * * *`, () =>
    ocrProcess(openai, settings),
  );
  timelineJob = cron.schedule(`*/${2 * interval} * * * *`, () =>
    timelineProcess(cookies),
  );
  summaryJob = cron.schedule(`*/${5 * interval} * * * *`, () =>
    summaryProcess(openai, settings),
  );
  suggestionJob = cron.schedule(`*/${5 * interval} * * * *`, () =>
    suggestionProcess(prompt, openai, settings),
  );
}

async function profileProcess(
  cookies: CookieParam[],
  openai: OpenAI,
  settings: Partial<Settings>,
  scrollLimit: number = 5,
): Promise<void> {
  if (!browser || !browser.isConnected()) {
    await stopBot();
    return;
  }

  eventEmitter.emit("updateProgress", { process: 0, value: 0 });

  if (!profilePage || profilePage.isClosed())
    profilePage = await browser.newPage();

  try {
    await profilePage.setCookie(...cookies);
    await profilePage.goto("https://x.com/home", { waitUntil: "networkidle2" });

    console.log("Navigating to profile...");
    await profilePage.waitForSelector('a[aria-label="Profile"]');

    const profileUrl = await profilePage.evaluate(() => {
      const profileLink: HTMLLinkElement | null = document.querySelector(
        'a[aria-label="Profile"]',
      );
      return profileLink ? profileLink.href : null;
    });

    await profilePage.goto(`${profileUrl}/with_replies`, {
      waitUntil: "networkidle2",
    });

    await profilePage.waitForSelector('div[data-testid="UserName"]', {
      visible: true,
    });

    console.log("Extracting profile data...");

    const profileData = await profilePage.evaluate(() => {
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
      const newTweets = await scrapeTweets(profilePage);
      newTweets.forEach((tweet) => tweets.add(JSON.stringify(tweet)));

      eventEmitter.emit("updateProgress", {
        process: 0,
        value: ((i + 1) / scrollLimit) * 50,
      });

      // Scroll down and wait for new content to load
      await profilePage.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise((resolve) =>
        setTimeout(resolve, 500 + Math.random() * 500),
      );
    }

    const tweetArray = Array.from(tweets).map((s: string) => JSON.parse(s));

    const stream = await openai.chat.completions.create({
      model: settings.aiModel!,
      messages: [
        {
          role: "system",
          content: `\
You are an AI assistant analyzing a Twitter user's profile and engagement patterns to generate a concise summary.\
            `,
        },
        {
          role: "user",
          content: `\
### **Instructions:**
- Analyze the user's bio, tweets, and engagement style to determine key themes.  
- Summarize their primary interests in a way that reflects both their focus areas and any unique perspectives they bring.
- Create a detailed description of their writing style (punctuation, grammar, habits, etc).
- Keep the summary engaging and concise. Limit to 3 sentences and at most 300 characters.

### **User Profile Data**
\`\`\`json
${JSON.stringify(profileData, null, 2)}
\`\`\`

### **User Tweets**
\`\`\`json
${JSON.stringify(tweetArray.slice(0, 2), null, 2)}
\`\`\`
            `,
        },
      ],
      response_format: {
        type: "text",
      },
      stream: true,
    });

    let summary = "";
    for await (const chunk of stream) {
      summary += chunk.choices[0]?.delta?.content || "";
      eventEmitter.emit("updateProgress", {
        process: 0,
        value: Math.min(50 + (summary.length / 400) * 50, 99),
      });
    }
    summary = summary.trim();

    if (summary.length) await store.pushSummary(summary);

    await store.pushProfileTweets(tweetArray);
  } catch (e) {
    console.error("Error in profile process:", e);
    if (browser)
      eventEmitter.emit("catchError", {
        title: "Error analyzing profile.",
        description: "Issue with AI model or browser instance.",
      });
  }

  eventEmitter.emit("updateProgress", { process: 0, value: 100 });
}

let lastCheck: Date | null = null;

async function ocrProcess(
  openai: OpenAI,
  settings: Partial<Settings>,
): Promise<void> {
  if (!browser || !browser.isConnected()) {
    await stopBot();
    return;
  }

  eventEmitter.emit("updateProgress", { process: 1, value: 0 });

  try {
    console.log("Analyzing OCR data...");

    const res = await pipe.queryScreenpipe({
      contentType: "ocr",
      limit: 3,
      startTime: lastCheck ? lastCheck.toISOString() : undefined,
    });
    const context = (res?.data as any[])
      .filter((e) => !e.content.appName.includes("screenpipe"))
      .map((e) => ({
        text: e.content.text,
        appName: e.content.appName,
        windowName: e.content.windowName,
      }));

    const stream = await openai.chat.completions.create({
      model: settings.aiModel!,
      messages: [
        {
          role: "system",
          content: `\
You are an AI assistant analyzing OCR-extracted text to identify key insights, trends, and relevant topics.\
                `,
        },
        {
          role: "user",
          content: `\
### **Instructions:**
- Summarize the main topics detected in the extracted text.
- Identify recurring themes or keywords and their context.
- Determine if the content relates to a specific niche, such as technology, politics, finance, gaming, or another domain.
- Analyze tone and intent (e.g., is the text informative, promotional, opinion-based, or casual?).
- Extract any actionable insights, such as trending discussions, important facts, or engagement opportunities.
- Limit summary to 3 sentences and at most 300 characters.

### **Extracted OCR Data**
\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`
                `,
        },
      ],
      response_format: {
        type: "text",
      },
      stream: true,
    });

    let summary = "";
    for await (const chunk of stream) {
      summary += chunk.choices[0]?.delta?.content || "";
      eventEmitter.emit("updateProgress", {
        process: 1,
        value: Math.min((summary.length / 400) * 100, 99),
      });
    }
    summary = summary.trim();

    if (summary.length) await store.pushSummary(summary);
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
  scrollLimit: number = 5,
): Promise<void> {
  if (!browser || !browser.isConnected()) {
    await stopBot();
    return;
  }

  eventEmitter.emit("updateProgress", { process: 2, value: 0 });

  if (!timelinePage || timelinePage.isClosed())
    timelinePage = await browser.newPage();

  try {
    await timelinePage.setCookie(...cookies);
    await timelinePage.goto("https://x.com/home", {
      waitUntil: "networkidle2",
    });

    await timelinePage.waitForSelector("article");
    console.log("Extracting tweets...");

    let tweets = new Set<string>();

    for (let i = 0; i < scrollLimit; i++) {
      console.log(`Scrolling... (${i + 1}/${scrollLimit})`);

      // Extract tweets on the current view
      const newTweets = await scrapeTweets(timelinePage);
      newTweets.forEach((tweet) => tweets.add(JSON.stringify(tweet)));

      eventEmitter.emit("updateProgress", {
        process: 2,
        value: ((i + 1) / scrollLimit) * 100,
      });

      // Scroll down and wait for new content to load
      await timelinePage.evaluate(() => window.scrollBy(0, window.innerHeight));
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

  eventEmitter.emit("updateProgress", { process: 2, value: 100 });
}

async function summaryProcess(
  openai: OpenAI,
  settings: Partial<Settings>,
): Promise<void> {
  if (!browser || !browser.isConnected()) {
    await stopBot();
    return;
  }

  eventEmitter.emit("updateProgress", { process: 3, value: 0 });

  try {
    const summaries = await store.getSummaries();

    const stream = await openai.chat.completions.create({
      model: settings.aiModel!,
      messages: [
        {
          role: "system",
          content: `\
You are an AI assistant creating a concise and well-structured summary based on multiple previous summaries.\
            `,
        },
        {
          role: "user",
          content: `\
### **Instructions:**
- Analyze the provided summaries to identify common themes, key insights, and recurring topics.
- Eliminate redundant or overly specific details while preserving the most important information.
- Make sure to include any information about their writing style.
- Ensure the final summary is clear, engaging, and captures the essence of the original summaries.
- Limit summary to 3 sentences and at most 300 characters.

### **User Summaries**
\`\`\`json
${JSON.stringify(summaries, null, 2)}
\`\`\`
            `,
        },
      ],
      response_format: {
        type: "text",
      },
      stream: true,
    });

    let summary = "";
    for await (const chunk of stream) {
      summary += chunk.choices[0]?.delta?.content || "";
      eventEmitter.emit("updateProgress", {
        process: 3,
        value: Math.min((summary.length / 400) * 100, 99),
      });
    }
    summary = summary.trim();

    if (summary.length) await store.compileSummaries(summary);

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
  openai: OpenAI,
  settings: Partial<Settings>,
): Promise<void> {
  if (!browser || !browser.isConnected()) {
    await stopBot();
    return;
  }

  eventEmitter.emit("updateProgress", { process: 4, value: 0 });

  try {
    console.log("Creating suggestions...");

    const summary = (await store.getSummaries()).slice(-1)[0];
    const tweets = (await store.getTweets()).slice(0, 5);
    const profileTweets = (await store.getProfileTweets()).slice(-2);

    let model = settings.aiModel!;
    if (model === "gpt-4") {
      model = "gpt-4o";
    }

    const stream = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `\
You are an AI assistant analyzing tweet data to determine the best engagement opportunities. 
Identify tweets that have high engagement, are relevant to the user’s niche, and invite discussion.
Use summary of the user's data to add context and improve relevance.
Match the user's writing style based on their tweets. Personalize it, don't be generic.
Generate recommended replies and timestamps for selected tweets. Return JSON output.\
            `,
        },
        {
          role: "user",
          content: `\
### **Instructions:**
${prompt}

### **User Summary:**
${summary}

### **User Tweets:**
\`\`\`json
${JSON.stringify(profileTweets, null, 2)}
\`\`\`

### **Tweets To Analyze:**
\`\`\`json
${JSON.stringify(tweets, null, 2)}
\`\`\`

Make sure to return only JSON in the following schema:
\`\`\`
{
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tweetId: {
            type: "string",
            description: "Tweet ID to reply to.",
          },
          handle: {
            type: "string",
            description: "Handle of the Tweet's poster.",
          },
          reply: {
            type: "string",
            description: "Text of the reply.",
          },
          reason: {
            type: "string",
            description: "Reason for the reply.",
          },
        },
        additionalProperties: false,
        required: ["tweetID", "handle", "reply", "reason"],
      },
    },
  },
  additionalProperties: false,
  required: ["suggestions"],
},
\`\`\`
            `,
        },
      ],
      response_format: {
        type: "json_object",
      },
      temperature: 0.7,
      stream: true,
    });

    let content = "";
    for await (const chunk of stream) {
      content += chunk.choices[0]?.delta?.content || "";
      eventEmitter.emit("updateProgress", {
        process: 4,
        value: Math.min((content.length / 1000) * 100, 99),
      });
    }
    content = content.trim();

    if (content.length) {
      const data = JSON.parse(content);
      for (const suggestion of data.suggestions) {
        await store.pushSuggestion(suggestion);
        eventEmitter.emit("addSuggestion", suggestion);
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

async function getOpenAI(settings: Partial<Settings>): Promise<OpenAI> {
  return new OpenAI({
    apiKey:
      settings.aiProviderType === "screenpipe-cloud"
        ? settings.user!.token
        : settings.openaiApiKey!,
    baseURL: settings.aiUrl!,
    dangerouslyAllowBrowser: true,
  });
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
