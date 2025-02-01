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

async function readObsidianFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content;
  } catch (err) {
    console.error(`failed to read file ${filePath}:`, err);
    return "";
  }
}

async function findVaultRoot(startPath: string): Promise<string> {
  let currentPath = startPath;

  while (currentPath !== "/" && currentPath !== ".") {
    try {
      // Check if .obsidian exists in current directory
      await fs.access(path.join(currentPath, ".obsidian"));
      return currentPath; // Found the vault root
    } catch {
      // Move up one directory
      currentPath = path.dirname(currentPath);
    }
  }
  throw new Error("could not find obsidian vault root (.obsidian folder)");
}

async function extractLinkedContent(
  prompt: string,
  basePath: string
): Promise<string> {
  try {
    // Find the vault root first
    const vaultRoot = await findVaultRoot(basePath);

    // Match @[[file]] or @[[folder/file]] patterns
    const linkRegex = /@\[\[(.*?)\]\]/g;
    const matches = [...prompt.matchAll(linkRegex)];

    let enrichedPrompt = prompt;

    for (const match of matches) {
      const relativePath = match[1];
      // Handle .md extension if not present
      const fullPath = path.join(
        vaultRoot,
        relativePath.endsWith(".md") ? relativePath : `${relativePath}.md`
      );

      try {
        const content = await readObsidianFile(fullPath);
        // Replace the @[[link]] with actual content
        enrichedPrompt = enrichedPrompt.replace(
          match[0],
          `\n--- Content of ${relativePath} ---\n${content}\n---\n`
        );
      } catch (err) {
        console.error(`failed to process link ${relativePath}:`, err);
      }
    }

    return enrichedPrompt;
  } catch (err) {
    console.error("failed to find vault root:", err);
    return prompt; // Return original prompt if we can't process links
  }
}

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
