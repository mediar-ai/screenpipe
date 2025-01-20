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
  customPrompt?: string
): Promise<WorkLog> {
  const defaultPrompt = `Based on the following screen data, generate a concise work activity log entry.
    Rules:
    - use the screen data to generate the log entry
    - focus on describing the activity and tags

    User custom prompt: ${customPrompt}
    Screen data: ${JSON.stringify(screenData)}

    Return a JSON object with:
    {
        "title": "Brief title of the activity",
        "description": "Concise description of what was done",
        "tags": ["#tag1", "#tag2", "#tag3"]
    }`;

  const provider = ollama(model);
  const response = await generateObject({
    model: provider,
    messages: [{ role: "user", content: defaultPrompt }],
    schema: workLog,
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

  return `obsidian://open?vault=${encodeURIComponent(
    vaultName
  )}&file=${encodeURIComponent(filename)}`;
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
      oneHourAgo,
      now,
      customPrompt
    );
    const _ = await syncLogToObsidian(logEntry, obsidianPath);

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
