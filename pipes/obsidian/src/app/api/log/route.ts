import { NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { ollama } from "ollama-ai-provider";
import { ContentItem } from "@screenpipe/js";
import { pipe } from "@screenpipe/js";
import * as fs from "fs/promises";
import * as path from "path";

const workLog = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  startTime: z.string(),
  endTime: z.string(),
});

type WorkLog = z.infer<typeof workLog>;

async function generateWorkLog(
  screenData: ContentItem[],
  model: string,
  customPrompt?: string
): Promise<WorkLog> {
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  const defaultPrompt = `Based on the following screen data, generate a concise work activity log entry.
    Rules:
    - use the current time to generate the log entry
    - use the timezone of the user to generate the log entry
    - use the screen data to generate the log entry
    - change start and end time according to the difference between the current time and the time of the screen data

    User custom prompt: ${customPrompt}
    Current time: ${now.toLocaleString()} (${timeZone})
    Screen data: ${JSON.stringify(screenData)}

    Return a JSON object with:
    {
        "title": "Brief title of the activity",
        "description": "Concise description of what was done",
        "tags": ["#tag1", "#tag2", "#tag3"],
        "startTime": "12-01-2024 10:00", 
        "endTime": "12-01-2024 10:05"
    }`;

  const provider = ollama(model);
  const response = await generateObject({
    model: provider,
    messages: [{ role: "user", content: defaultPrompt }],
    schema: workLog,
  });

  return response.object;
}

async function syncLogToObsidian(
  logEntry: WorkLog,
  obsidianPath: string
): Promise<void> {
  await fs.mkdir(obsidianPath, { recursive: true });

  const today = new Date();
  const filename = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}.md`;
  const filePath = path.join(obsidianPath, filename);

  const tableRow = `| ${logEntry.title} | ${
    logEntry.description
  } | ${logEntry.tags.join(", ")} | ${logEntry.startTime} | ${
    logEntry.endTime
  } |\n`;

  try {
    await fs.access(filePath);
    await fs.appendFile(filePath, tableRow, "utf8");
  } catch {
    const content = `| Title | Description | Tags | Start Time | End Time |\n|-------|-------------|------|------------|------------|\n${tableRow}`;
    await fs.writeFile(filePath, content, "utf8");
  }
}

export async function GET() {
  try {
    const settings = await pipe.settings.getNamespaceSettings("obsidian");
    const interval = settings?.interval || 3600000;
    const obsidianPath = settings?.path;
    const customPrompt = settings?.prompt;
    const pageSize = settings?.pageSize || 100;
    const model = settings?.aiModel;

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
      contentType: "ocr",
    });

    if (!screenData || screenData.data.length === 0) {
      return NextResponse.json({ message: "no activity detected" });
    }

    const logEntry = await generateWorkLog(
      screenData.data,
      model,
      customPrompt
    );
    await syncLogToObsidian(logEntry, obsidianPath);

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
