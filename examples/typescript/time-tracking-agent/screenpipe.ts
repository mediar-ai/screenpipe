import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import * as readline from "readline";

const screenpipeQuery = z.object({
  q: z
    .string()
    .describe(
      "The search query matching exact keywords. Use a single keyword that best matches the user intent. This would match either audio transcription or OCR screen text."
    )
    .optional(),
  content_type: z
    .enum(["ocr", "audio", "all"])
    .default("all")
    .describe(
      "The type of content to search for: screenshot data or audio transcriptions"
    ),
  limit: z
    .number()
    .default(5)
    .describe(
      "Number of results to return (default: 5). Don't return more than 50 results as it will be fed to an LLM"
    ),
  offset: z.number().default(0).describe("Offset for pagination (default: 0)"),
  start_time: z
    .string()
    .default(() => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return weekAgo.toISOString();
    })
    .describe("Start time for search range in ISO 8601 format"),
  end_time: z
    .string()
    .default(new Date().toISOString())
    .describe("End time for search range in ISO 8601 format"),
  app_name: z
    .string()
    .describe("The name of the app to filter results. Use lower case.")
    .optional(),
});

async function queryScreenpipe(params: z.infer<typeof screenpipeQuery>) {
  try {
    console.log("params", params);
    const queryParams = new URLSearchParams(
      Object.entries({
        q: params.q,
        offset: params.offset.toString(),
        limit: params.limit.toString(),
        start_date: params.start_time,
        end_date: params.end_time,
        content_type: params.content_type,
        app_name: params.app_name,
      }).filter(([_, v]) => v != null) as [string, string][]
    );
    console.log("calling screenpipe", JSON.stringify(params));
    const response = await fetch(`http://localhost:3030/search?${queryParams}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status} ${text}`);
    }
    const result = await response.json();
    console.log("result", result);
    return result.data;
  } catch (error) {
    console.error("Error querying screenpipe:", error);
    return null;
  }
}

async function analyzeAppUsage(results: any[]) {
  const appUsage: { [key: string]: number } = {};

  results.forEach((result) => {
    if (result.type === "OCR") {
      const app = result.content.app_name.toLowerCase();
      const duration = 1; // Each OCR result represents 1 second
      appUsage[app] = (appUsage[app] || 0) + duration;
    }
  });

  const sortedApps = Object.entries(appUsage)
    .sort(([, a], [, b]) => b - a)
    .map(([app, seconds]) => ({
      app,
      time: `${Math.floor(seconds / 3600)}h ${Math.floor(
        (seconds % 3600) / 60
      )}m ${seconds % 60}s`,
    }));

  return sortedApps;
}

const screenpipe = async () => {
  console.log("Hi! How can I help you?");

  const results = await queryScreenpipe({
    content_type: "ocr",
    limit: 10000, // Increased limit to get more accurate results
    offset: 0,
    start_time: "2024-03-01T00:00:00Z",
    end_time: "2024-03-07T23:59:59Z",
  });

  if (results) {
    const appUsage = await analyzeAppUsage(results);

    console.log("Here's what you spent the most time on this week:");
    appUsage.slice(0, 5).forEach((app, index) => {
      console.log(`${index + 1}. ${app.app}: ${app.time}`);
    });
  } else {
    console.log("Sorry, I couldn't retrieve the data. Please try again later.");
  }
};

screenpipe();
