"use server";

import path from "path";
import fs from "fs";
import type { Tweet, Suggestion } from "@/lib/actions/run-bot";
import type { CookieParam } from "puppeteer-core";

const DIR = path.join(process.cwd(), "store");

const DEFAULT_PROMPT = `- Prioritize tweets that align with the user’s niche, past tweets, and bio.
- Match the user's writing style based on available descriptions.
- If the user is an expert, suggest insightful or debate-provoking replies.
- If the user asks a lot of questions, favor responses that encourage further discussion.
- Reasons for the suggestion should be in second person.
- Only include hashtags if they are relevant or improve engagement.`;

function getData(file: string): any {
  try {
    const data = fs.readFileSync(path.join(DIR, file), { encoding: "utf8" });
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

function putData(file: string, data: any) {
  if (!fs.existsSync(DIR)) {
    fs.mkdirSync(DIR);
  }
  fs.writeFileSync(path.join(DIR, file), JSON.stringify(data));
}

export async function getCookies(): Promise<CookieParam[]> {
  return getData("cookies.json") || [];
}

export async function putCookies(cookies: CookieParam[]) {
  putData("cookies.json", cookies);
}

export async function getPrompt(): Promise<string> {
  const config = getData("config.json") || {};
  return config.prompt ? config.prompt : DEFAULT_PROMPT;
}

export async function putPrompt(prompt: string) {
  const config = getData("config.json") || {};
  putData("config.json", { ...config, prompt });
}

export async function getFrequency(): Promise<number> {
  const config = getData("config.json") || {};
  return config.frequency ? config.frequency : 5;
}

export async function putFrequency(frequency: number) {
  const config = getData("config.json") || {};
  putData("config.json", { ...config, frequency });
}

export async function getSummaries(): Promise<string[]> {
  return getData("summaries.json") || [];
}

export async function pushSummary(summary: string) {
  const summaries = getData("summaries.json") || [];
  putData("summaries.json", [...summaries, summary]);
}

export async function compileSummaries(compiled: string) {
  putData("summaries.json", [compiled]);
}

export async function getProfileTweets(): Promise<Tweet[]> {
  return getData("profile.json") || [];
}

export async function pushProfileTweets(newTweets: Tweet[]) {
  const tweets = getData("profile.json") || [];
  putData("profile.json", [...tweets, ...newTweets]);
}

export async function getTweets(): Promise<Tweet[]> {
  return getData("tweets.json") || [];
}

export async function pushTweets(newTweets: Tweet[]) {
  const tweets = getData("tweets.json") || [];
  putData("tweets.json", [...tweets, ...newTweets]);
}

export async function removeTweets(count: number) {
  const tweets = getData("tweets.json") || [];
  putData("tweets.json", tweets.slice(count));
}

export async function getSuggestions(): Promise<Suggestion[]> {
  return getData("suggestions.json") || [];
}

export async function pushSuggestion(suggestion: Suggestion) {
  const suggestions: Suggestion[] = getData("suggestions.json") || [];
  const ids = new Set(suggestions.map((s) => s.tweetId));
  if (!ids.has(suggestion.tweetId)) {
    putData("suggestions.json", [...suggestions, suggestion]);
  }
}

export async function deleteSuggestion(i: number) {
  const suggestions: Suggestion[] = getData("suggestions.json") || [];
  putData(
    "suggestions.json",
    suggestions.filter((_, i2) => i !== i2),
  );
}
