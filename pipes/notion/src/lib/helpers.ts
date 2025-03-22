import { ContentItem } from "@screenpipe/js";
import { WorkLog } from "./types";
import { generateObject } from "ai";
import { ollama } from "ollama-ai-provider";
import { z } from "zod";
import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import { settingsStore } from "./store/settings-store";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod.mjs";

export const workLog = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

async function extractLinkedContent(prompt: string): Promise<string> {
  try {
    // Match @[[file]] or @[[folder/file]] patterns
    const linkRegex = /@\[\[(.*?)\]\]/g;
    const matches = [...prompt.matchAll(linkRegex)];
    const settings = await settingsStore.loadPipeSettings("notion");
    let enrichedPrompt = prompt;

    const notion = new Client({
      auth: settings?.notion?.accessToken,
    });

    const n2m = new NotionToMarkdown({ notionClient: notion });
    for (const match of matches) {
      const pageId = match[1];

      try {
        const mdblocks = await n2m.pageToMarkdown(pageId);
        const mdString = n2m.toMarkdownString(mdblocks);

        enrichedPrompt = enrichedPrompt.replace(
          match[0],
          `\n--- Content of ${pageId} ---\n${mdString.parent}\n---\n`
        );
      } catch (error) {
        console.error(error, `of ${pageId}`);
      }
    }
    return enrichedPrompt;
  } catch (e) {
    console.error("not able to connect to notion", e);
    return prompt;
  }
}

export async function generateWorkLog(
  screenData: ContentItem[],
  aiPreset: ReturnType<typeof settingsStore.getPreset>,
  startTime: Date,
  endTime: Date,
  customPrompt?: string
): Promise<WorkLog> {

  if (!aiPreset) {
    throw new Error("ai preset not found");
  }

  let enrichedPrompt = customPrompt || aiPreset.prompt || "";

  if (customPrompt) {
    enrichedPrompt = await extractLinkedContent(customPrompt);
  }

  const defaultPrompt = `Based on the following screen data, generate a concise work activity log entry.
    Rules:
    - use the screen data to generate the log entry
    - focus on describing the activity and tags
    - use the following context to better understand the user's goals and priorities:

    ${enrichedPrompt}

    Screen data: ${JSON.stringify(screenData)}

    Return a JSON object with:
    {
        "title": "Brief title of the activity",
        "description": "Concise description of what was done",
        "tags": ["#tag1", "#tag2", "#tag3"]
    }`;

  console.log("enrichedPrompt prompt:", enrichedPrompt);

  const openai = new OpenAI({
    apiKey: aiPreset.apiKey,
    baseURL: aiPreset.url,
    dangerouslyAllowBrowser: true,
  });

  const response = await openai.chat.completions.create({
    model: aiPreset.model,
    messages: [{ role: "user", content: defaultPrompt }],
    response_format: zodResponseFormat(workLog, "workLog"),
  });

  const formatDate = (date: Date) => {
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  return {
    ...JSON.parse(response.choices[0].message.content || "{}"),
    startTime: formatDate(startTime),
    endTime: formatDate(endTime),
  };
}
