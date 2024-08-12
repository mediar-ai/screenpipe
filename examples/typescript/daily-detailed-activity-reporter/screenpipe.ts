import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import * as readline from "readline";
import { ollama } from "ollama-ai-provider";

export const screenpipeQuery = z.object({
  q: z
    .string()
    .describe(
      "The search query matching exact keywords. Use a single keyword that best matches the user intent. This would match either audio transcription or OCR screen text. Example: do not use 'discuss' the user ask about conversation, this is dumb, won't return any result"
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
    .default(20)
    .describe(
      "Number of results to return (default: 20). Don't return more than 50 results as it will be fed to an LLM"
    ),
  offset: z.number().default(0).describe("Offset for pagination (default: 0)"),
  start_time: z
    .string()
    // 1 hour ago
    .default(new Date(Date.now() - 3600000).toISOString())
    .describe("Start time for search range in ISO 8601 format"),
  end_time: z
    .string()
    .default(new Date().toISOString())
    .describe("End time for search range in ISO 8601 format"),
  app_name: z
    .string()
    .describe(
      "The name of the app the user was using. This filter out all audio conversations. Only works with screen text. Use this to filter on the app context that would give context matching the user intent. For example 'cursor'. Use lower case. Browser is usually 'arc', 'chrome', 'safari', etc. Do not use thing like 'mail' because the user use the browser to read the mail."
    )
    .optional(),
});
export const screenpipeMultiQuery = z.object({
  queries: z.array(screenpipeQuery),
});

export async function queryScreenpipeNtimes(
  params: z.infer<typeof screenpipeMultiQuery>
) {
  console.log(
    "Using tool queryScreenpipeNtimes with params:",
    JSON.stringify(params)
  );
  return Promise.all(params.queries.map(queryScreenpipe));
}

// Add this new function to handle screenpipe requests
export async function queryScreenpipe(params: z.infer<typeof screenpipeQuery>) {
  try {
    console.log("params", params);
    const queryParams = new URLSearchParams(
      Object.entries({
        q: params.q,
        offset: params.offset.toString(),
        limit: params.limit.toString(),
        start_time: params.start_time,
        end_time: params.end_time,
        content_type: params.content_type,
        app_name: params.app_name,
      }).filter(([_, v]) => v != null) as [string, string][]
    );
    console.log("calling screenpipe", JSON.stringify(params));
    const response = await fetch(`http://localhost:3030/search?${queryParams}`);
    if (!response.ok) {
      const text = await response.text();
      console.log("error", text);
      throw new Error(`HTTP error! status: ${response.status} ${text}`);
    }
    const result = await response.json();
    console.log("result", result.data.length);
    // log all without .data
    console.log("result", {
      ...result,
      data: undefined,
    });
    return result;
  } catch (error) {
    console.error("Error querying screenpipe:", error);
    return null;
  }
}
