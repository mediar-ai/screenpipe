import { NextResponse } from "next/server";
import { z } from "zod";
import { embed, generateObject } from "ai";
import { ollama } from "ollama-ai-provider";
import { AIPreset, ContentItem } from "@screenpipe/js";
import { pipe } from "@screenpipe/js";
import * as fs from "fs/promises";
import * as path from "path";
import { extractLinkedContent } from "@/lib/actions/obsidian";
import { settingsStore } from "@/lib/store/settings-store";
import { OpenAI } from "openai";

const workLog = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  mediaLinks: z.array(z.string()).optional(),
});

type WorkLog = z.infer<typeof workLog> & {
  startTime: string;
  endTime: string;
};

async function generateWorkLog(
  data: ContentItem[],
  obsidianPath: string,
  prevTime: Date,
  curTime: Date,
  aiPreset: ReturnType<typeof settingsStore.getPreset>,
): Promise<WorkLog> {
  if (!aiPreset) {
    throw new Error("ai preset not configured");
  }

  let enrichedPrompt = aiPreset.prompt || "";

  if (enrichedPrompt && obsidianPath) {
    enrichedPrompt = await extractLinkedContent(enrichedPrompt, obsidianPath);
  }

  const defaultPrompt = `You are analyzing screen recording data from Screenpipe, a desktop app that records screens & mics 24/7 to provide context to AI systems.
    The data includes OCR text, audio transcriptions, and media files from the user's desktop activity.

    Based on the following screen data, generate a concise work activity log entry.

    Here are some user instructions:
    ${enrichedPrompt}

    Screen data: ${JSON.stringify(data)}

    Rules:
    - analyze the screen data carefully to understand the user's work context and activities
    - generate a clear, specific title that reflects the main activity
    - write a concise but informative description focusing on what was accomplished
    - add relevant tags based on detected applications, websites, and content types
    - properly format media files as HTML video elements in table cell:
      - video: <video src="file://PATH_TO_VIDEO.mp4" controls></video>
    - include all relevant media file paths in the mediaLinks array
    - maintain user privacy by excluding sensitive/personal information
    - ensure description and content are properly escaped for markdown table cells (use <br> for newlines)
    - link to people using [[firstname]]
    - link to concepts using [[concept-name]]

    Example outputs:
    {
        "title": "engineering: implemented rust error handling",
        "description": "refactored error handling in [[screenpipe-core]] pipeline. paired with [[sarah]] to implement anyhow::Result across key modules. improved error propagation and logging",
        "tags": ["#rust", "#error-handling", "#pair-programming"],
        "mediaLinks": ["<video src=\"file:///recordings/pair-programming-session.mp4\" controls></video>"]
    }

    {
        "title": "sales: customer discovery call with fintech startup",
        "description": "met with [[alex]] from payflow. discussed [[24-7-recording]] use cases for compliance. key pain point: audit trail generation. next: technical demo next week",
        "tags": ["#sales", "#fintech", "#customer-discovery"],
        "mediaLinks": ["<video src=\"file:///recordings/sales-call-payflow.mp4\" controls></video>"]
    }

    {
        "title": "research: llm context window analysis",
        "description": "reviewed [[claude-3]] papers on attention mechanisms. summarized findings in [[context-window]] note. potential implications for [[screenpipe]]'s chunking strategy",
        "tags": ["#research", "#llm", "#ai-architecture"],
        "mediaLinks": []
    }

    Return a JSON object with:
    {
        "title": "Brief, specific title describing the main activity",
        "description": "Clear description of what was accomplished, focusing on concrete outcomes",
        "tags": ["#relevant-tool", "#activity-type", "#project-context"],
        "mediaLinks": ["<video src=\"file:///absolute/path/to/video.mp4\" controls></video>"]
    }`;

  const openaiConfig = {
    apiKey: aiPreset.apiKey,
    model: aiPreset.model,
    baseURL: aiPreset.url || undefined,
  };

  const openai = new OpenAI(openaiConfig);

  const response = await openai.chat.completions.create({
    model: aiPreset.model,
    messages: [{ role: "user", content: defaultPrompt }],
    response_format: { type: "json_object" },
  });

  const jsonResponse = JSON.parse(response.choices[0].message.content || "{}");

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
    ...jsonResponse,
    startTime: formatDate(prevTime),
    endTime: formatDate(curTime),
  };
}

async function syncLogToObsidian(
  logEntry: WorkLog,
  obsidianPath: string,
): Promise<string> {
  const logsPath = path.join(path.normalize(obsidianPath), "logs");
  await fs.mkdir(logsPath, { recursive: true });

  const today = new Date();
  const filename = `${today.getFullYear()}-${String(
    today.getMonth() + 1,
  ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}.md`;
  const filePath = path.join(logsPath, filename);

  const vaultName = path.basename(path.resolve(obsidianPath));

  const escapeTableCell = (content: string) => {
    return content.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  };

  const timeRange = `${escapeTableCell(logEntry.startTime)} - ${escapeTableCell(
    logEntry.endTime,
  )}`;

  // Combine title with timestamp and description with tags
  const titleWithTime = `${escapeTableCell(logEntry.title)}<br>${timeRange}`;
  const descriptionWithTags = `${escapeTableCell(
    logEntry.description,
  )}<br>${escapeTableCell(logEntry.tags.join("<br>"))}`;

  const tableHeaders = `| Title | Description | Media |\n|-------|-------------|--------|\n`;
  const tableRow = `| ${titleWithTime} | ${descriptionWithTags} | ${
    logEntry.mediaLinks?.map((link) => escapeTableCell(link)).join("<br>") || ""
  } |\n`;

  try {
    let existingContent = "";
    try {
      existingContent = await fs.readFile(filePath, "utf8");
    } catch {
      // File doesn't exist yet, create new with headers
      await fs.writeFile(filePath, tableHeaders + tableRow, "utf8");
      return getObsidianUrl(vaultName, filename);
    }

    if (!existingContent.trim()) {
      // Empty file - write headers and new row
      await fs.writeFile(filePath, tableHeaders + tableRow, "utf8");
    } else if (!existingContent.includes("| Title | Description |")) {
      // No headers - prepend headers and add new row while keeping existing content
      await fs.writeFile(
        filePath,
        tableHeaders + existingContent + tableRow,
        "utf8",
      );
    } else {
      // Headers exist - append new row while preserving existing content
      await fs.appendFile(filePath, tableRow, "utf8");
    }
  } catch (error) {
    console.error("Error writing to file:", error);
    throw error;
  }

  return getObsidianUrl(vaultName, filename);
}

// Helper function to generate Obsidian URL
function getObsidianUrl(vaultName: string, filename: string): string {
  return `obsidian://open?vault=${encodeURIComponent(
    vaultName,
  )}&file=${encodeURIComponent(filename)}`;
}

async function deduplicateScreenData(
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

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
}

export async function GET() {
  try {
    const settings = await settingsStore.loadPipeSettings("obsidian");
    const interval = settings.logTimeWindow || 3600000;
    const obsidianPath = settings.vaultPath;
    const pageSize = settings.logPageSize || 100;
    const deduplicationEnabled = settings.deduplicationEnabled;

    const aiPreset = settingsStore.getPreset("obsidian", "aiLogPresetId");

    if (!aiPreset || !aiPreset.model) {
      return NextResponse.json(
        { error: "ai preset not configured" },
        { status: 400 },
      );
    }

    if (!obsidianPath) {
      return NextResponse.json(
        { error: "obsidian path not configured" },
        { status: 400 },
      );
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - interval);

    const screenData = await pipe.queryScreenpipe({
      startTime: oneHourAgo.toISOString(),
      endTime: now.toISOString(),
      limit: pageSize,
      contentType: "all",
    });

    if (!screenData || screenData.data.length === 0) {
      return NextResponse.json({ message: "no activity detected" });
    }

    // Only deduplicate if enabled in settings
    if (deduplicationEnabled) {
      try {
        screenData.data = await deduplicateScreenData(screenData.data);
      } catch (error) {
        console.warn(
          "deduplication failed, continuing with original data:",
          error,
        );
      }
    }

    const logEntry = await generateWorkLog(
      screenData.data,
      obsidianPath,
      oneHourAgo,
      now,
      aiPreset,
    );
    const _ = await syncLogToObsidian(logEntry, obsidianPath);

    await pipe.captureEvent("obsidian_work_log_synced", {
      model: aiPreset?.model,
      interval,
      pageSize,
    });

    return NextResponse.json({
      message: "work log synced successfully",
      logEntry,
    });
  } catch (error) {
    console.error("error in work log api:", error);
    return NextResponse.json(
      { error: `failed to process work log: ${error}` },
      { status: 500 },
    );
  }
}
