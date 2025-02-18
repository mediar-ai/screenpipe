import { NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { ollama } from "ollama-ai-provider";
import { ContentItem } from "@screenpipe/js";
import { pipe } from "@screenpipe/js";
import * as fs from "fs/promises";
import * as path from "path";
import { extractLinkedContent } from "@/lib/actions/obsidian";

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
  screenData: ContentItem[],
  model: string,
  startTime: Date,
  endTime: Date,
  customPrompt?: string,
  obsidianPath?: string
): Promise<WorkLog> {
  let enrichedPrompt = customPrompt || "";

  if (customPrompt && obsidianPath) {
    enrichedPrompt = await extractLinkedContent(customPrompt, obsidianPath);
  }

  const defaultPrompt = `You are analyzing screen recording data from Screenpipe, a desktop app that records screens & mics 24/7 to provide context to AI systems.
    The data includes OCR text, audio transcriptions, and media files from the user's desktop activity.

    Based on the following screen data, generate a concise work activity log entry.

    Here are some user instructions:
    ${enrichedPrompt}

    Screen data: ${JSON.stringify(screenData)}
    
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
    
    Return a JSON object with:
    {
        "title": "Brief, specific title describing the main activity",
        "description": "Clear description of what was accomplished, focusing on concrete outcomes",
        "tags": ["#relevant-tool", "#activity-type", "#project-context"],
        "mediaLinks": ["<video src=\"file:///absolute/path/to/video.mp4\" controls></video>"]
    }`;

  const provider = ollama(model);
  const response = await generateObject({
    model: provider,
    messages: [{ role: "user", content: defaultPrompt }],
    schema: workLog,
  });

  console.log("response:", response.object);
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
    ...response.object,
    startTime: formatDate(startTime),
    endTime: formatDate(endTime),
  };
}

async function syncLogToObsidian(
  logEntry: WorkLog,
  obsidianPath: string
): Promise<string> {
  const normalizedPath = path.normalize(obsidianPath);
  await fs.mkdir(normalizedPath, { recursive: true });

  const today = new Date();
  const filename = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}.md`;
  const filePath = path.join(normalizedPath, filename);

  const vaultName = path.basename(path.resolve(normalizedPath));

  const escapeTableCell = (content: string) => {
    return content.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  };

  const timeRange = `${escapeTableCell(logEntry.startTime)} - ${escapeTableCell(
    logEntry.endTime
  )}`;

  // Combine title with timestamp and description with tags
  const titleWithTime = `${escapeTableCell(logEntry.title)}<br>${timeRange}`;
  const descriptionWithTags = `${escapeTableCell(
    logEntry.description
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
        "utf8"
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
    vaultName
  )}&file=${encodeURIComponent(filename)}`;
}

export async function GET() {
  try {
    const settings = await pipe.settings.getAll();
    console.log("settings:", settings);
    const interval =
      settings.customSettings?.obsidian?.logTimeWindow || 3600000;
    const obsidianPath = settings.customSettings?.obsidian?.vaultPath;
    const customPrompt = settings.customSettings?.obsidian?.prompt;
    const pageSize = settings.customSettings?.obsidian?.logPageSize || 100;
    const model = settings.customSettings?.obsidian?.logModel;

    if (!obsidianPath) {
      return NextResponse.json(
        { error: "obsidian path not configured" },
        { status: 400 }
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

    const logEntry = await generateWorkLog(
      screenData.data,
      model,
      oneHourAgo,
      now,
      customPrompt,
      obsidianPath
    );
    const _ = await syncLogToObsidian(logEntry, obsidianPath);

    await pipe.captureEvent("obsidian_work_log_synced", {
      model,
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
      { status: 500 }
    );
  }
}
