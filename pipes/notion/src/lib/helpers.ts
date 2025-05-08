import { ContentItem } from "@screenpipe/js";
import { WorkLog } from "./types";
import { embed } from "ai";
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

  const defaultPrompt = `You are a helpful assistant that analyzes the following screen data and generates an accurate work activity log entry.

    Instructions:
    - Carefully examine the screen data to identify the main activities performed
    - Extract specific application names, websites visited, and documents worked on
    - Create a precise, factual description of the work completed
    - Identify relevant tags based on the actual content (projects, tools, topics)
    - Use the following context to understand the user's goals and priorities:

    ${enrichedPrompt}

    Screen data: ${JSON.stringify(screenData)}

    Return a valid JSON object with exactly this structure:
    {
        "title": "Specific, accurate title reflecting the main activity",
        "description": "Detailed but concise description of what was accomplished, mentioning specific tools and content",
        "tags": ["#relevant_tag1", "#relevant_tag2", "#relevant_tag3"]
    }

    Ensure the JSON is properly formatted and contains only the requested fields.`;

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

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
}

export async function deduplicateScreenData(
  screenData: ContentItem[],
): Promise<ContentItem[]> {
  if (!screenData.length) return screenData;

  try {
    const provider = ollama.embedding("nomic-embed-text");
    const embeddings: number[][] = [];
    const uniqueData: ContentItem[] = [];
    let duplicatesRemoved = 0;

    for (const item of screenData) {
      const textToEmbed =
        "content" in item
          ? typeof item.content === "string"
            ? item.content
            : "text" in item.content
              ? item.content.text
              : JSON.stringify(item.content)
          : "";

      if (!textToEmbed.trim()) {
        uniqueData.push(item);
        continue;
      }

      try {
        const { embedding } = await embed({
          model: provider,
          value: textToEmbed,
        });

        let isDuplicate = false;
        for (let i = 0; i < embeddings.length; i++) {
          const similarity = cosineSimilarity(embedding, embeddings[i]);
          if (similarity > 0.95) {
            isDuplicate = true;
            duplicatesRemoved++;
            break;
          }
        }

        if (!isDuplicate) {
          embeddings.push(embedding);
          uniqueData.push(item);
        }
      } catch (error) {
        console.warn("embedding failed for item, keeping it:", error);
        uniqueData.push(item);
      }
    }

    console.log(
      `deduplication: removed ${duplicatesRemoved} duplicates from ${screenData.length} items`,
    );
    return uniqueData;
  } catch (error) {
    console.warn("deduplication failed, using original data:", error);
    return screenData;
  }
}
