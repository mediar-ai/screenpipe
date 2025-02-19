"use server";

import path from "path";
import { open } from "lmdb";
import type { Tweet, Suggestion } from "@/lib/actions/run-bot";
import type { CookieParam } from "puppeteer-core";

const db = open({
  path: path.join(process.cwd(), "store"),
  compression: true,
});

const summaries: string[] = [];
const timeline: Tweet[] = [];
const suggestions: Suggestion[] = [];

export async function getCookies(): CookieParam[] {
  const cookies = await db.get("cookies");
  return cookies || [];
}

export async function putCookies(cookies: CookieParam[]) {
  await db.put("cookies", cookies);
}

export async function getSummaries(): string[] {
  const summaries = await db.get("summaries");
  return summaries || [];
}

export async function pushSummary(summary: string) {
  const summaries = await getSummaries();
  await db.put("summaries", [...summaries, summary]);
}

export async function compileSummaries(compiled: string) {
  await db.put("summaries", [compiled]);
}

export async function getTweets(): Tweet[] {
  const tweets = await db.get("tweets");
  return tweets || [];
}

export async function pushTweets(newTweets: Tweet) {
  const tweets = await getTweets();
  await db.put("tweets", [...tweets, ...newTweets]);
}

export async function removeTweets(count: number) {
  const tweets = await db.get("tweets");
  await db.put("tweets", tweets.slice(count));
}

export async function getSuggestions(): Suggestion[] {
  const suggestions = await db.get("suggestions");
  return suggestions || [];
}

export async function pushSuggestion(suggestion: Suggestion) {
  const suggestions = await getSuggestions();
  const ids = new Set(suggestions.map((s) => s.tweetId));
  if (!ids.has(suggestion.tweetId)) {
    await db.put("suggestions", [...suggestions, suggestion]);
  }
}

export async function deleteSuggestion(i: number) {
  const suggestions = await getSuggestions();
  await db.put(
    "suggestions",
    suggestions.filter((_, i2) => i !== i2),
  );
}
