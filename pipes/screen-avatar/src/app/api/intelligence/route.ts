import { NextResponse } from "next/server";
import { z } from "zod";
import { generateObject, generateText, jsonSchema } from "ai";
import { ollama } from "ollama-ai-provider";
import { pipe } from "@screenpipe/js";
import * as fs from "fs/promises";
import * as path from "path";
import { extractLinkedContent } from "@/lib/actions/obsidian";

async function readRecentLogs(
  obsidianPath: string,
  since: Date
): Promise<string> {
  const logsPath = path.join(path.normalize(obsidianPath), "logs");
  const today = new Date().toISOString().split("T")[0];
  const yesterday = since.toISOString().split("T")[0];

  try {
    const todayContent = await fs
      .readFile(path.join(logsPath, `${today}.md`), "utf8")
      .catch(() => "");
    const yesterdayContent = await fs
      .readFile(path.join(logsPath, `${yesterday}.md`), "utf8")
      .catch(() => "");

    return `${yesterdayContent}\n${todayContent}`;
  } catch (error) {
    console.error("failed to read logs:", error);
    return "";
  }
}

async function analyzeWithLLM(
  content: string,
  prompt: string,
  model: string,
  obsidianPath?: string
): Promise<any> {
  const provider = ollama(model);

  let enrichedPrompt = prompt;
  if (obsidianPath) {
    enrichedPrompt = await extractLinkedContent(prompt, obsidianPath);
  }

  const systemPrompt = `You are an intelligent analysis system that processes user activity logs and creates higher-level insights.

Context:
- You are analyzing logs that were collected every 5 minutes
- Your task is to create a higher-level synthesis (hourly/daily summaries)
- Previous logs contain important context for understanding patterns
- Look for recurring themes, projects, and behavioral patterns
- Pay special attention to @[[note references]] which indicate important user context

Here are some user instructions:
${enrichedPrompt}

Previous Logs:
${content}

Instructions for Media and Formatting:
- When referencing videos, use: <video src="file:///PATH_TO_VIDEO.mp4" controls/>
- For links to other notes, use: [[note-name]]
- For timestamps, use: \`HH:MM\` format
- Create sections with level-3 headers: ### Section Name
- Use bullet points for lists and patterns
- Do not wrap your response in \`\`\`markdown\`\`\` tags
- Add relevant #tags for categorization
- Escape any pipe characters (|) in tables with \\|
- Do not hallucinate video paths, use the exact video path from the logs
- All your outputs will be written directly in Obsidian note taking app so use the formatting of the app in your response to maximize readability, 
embeding links, videos, etc. usually mp4 needs video html component and not the link format
- If you do not know the answer or do not have the right context, say I do not know, do not hallucinate

Analysis Structure:
### Summary
- High-level overview of the time period
- Key accomplishments and patterns

### Activity Timeline
- Chronological breakdown of significant events
- Include relevant media embeddings

### Patterns & Insights
- Recurring themes or behaviors
- Project progress
- Context switches
- Time allocation

### Related Notes
- Link to relevant vault notes
- Context connections

Generate a structured analysis following the above format.`;

  console.log("systemPrompt", systemPrompt);

  const response = await generateText({
    model: provider,
    messages: [{ role: "user", content: systemPrompt }],
    maxRetries: 5,
  });

  // Transform <think> tags into Obsidian foldable callouts
  let transformedText = response.text.replace(
    /<think>([\s\S]*?)<\/think>/g,
    (_, content) =>
      `> [!note]- Thinking Process\n${content
        .split("\n")
        .map((line: string) => `> ${line}`)
        .join("\n")}`
  );

  // Transform <video> tags to just 'video'
  transformedText = transformedText.replace(/<video>/g, "video");
  transformedText = transformedText.replace(/<\/video>/g, "");

  return transformedText;
}

async function saveMarkdown(
  content: string,
  obsidianPath: string,
  filename: string
): Promise<string> {
  const analysesPath = path.join(path.normalize(obsidianPath), "analyses");
  await fs.mkdir(analysesPath, { recursive: true });

  const filePath = path.join(analysesPath, filename);
  await fs.writeFile(filePath, content, "utf8");

  const vaultName = path.basename(path.resolve(obsidianPath));
  return `obsidian://open?vault=${encodeURIComponent(
    vaultName
  )}&file=analyses/${encodeURIComponent(filename)}`;
}

export async function GET() {
  try {
    const settings = await pipe.settings.getAll();
    const obsidianPath = settings.customSettings?.obsidian?.vaultPath;
    const model = settings.customSettings?.obsidian?.analysisModel;
    const customPrompt = settings.customSettings?.obsidian?.prompt;
    const timeWindow =
      settings.customSettings?.obsidian?.analysisTimeWindow ||
      1 * 60 * 60 * 1000;

    if (!obsidianPath) {
      return NextResponse.json(
        { error: "obsidian path not configured" },
        { status: 400 }
      );
    }

    // Read logs within time window
    const now = new Date();
    const since = new Date(now.getTime() - timeWindow);
    const recentLogs = await readRecentLogs(obsidianPath, since);

    if (!recentLogs) {
      return NextResponse.json({ message: "no logs found for analysis" });
    }

    // Analyze with LLM
    const analysis = await analyzeWithLLM(
      recentLogs,
      customPrompt,
      model,
      obsidianPath
    );

    // Save results based on output format
    const filename = `${now
      .toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .split("/")
      .reverse()
      .join("-")}-${now.getHours().toString().padStart(2, "0")}-${now
      .getMinutes()
      .toString()
      .padStart(2, "0")}-analysis.md`;

    const deepLink = await saveMarkdown(
      "\n" + analysis,
      obsidianPath,
      filename
    );

    return NextResponse.json({
      message: "analysis completed",
      intelligence: analysis,
      deepLink,
      summary: {
        timeWindow,
        logsAnalyzed: recentLogs.length,
        timestamp: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("error in intelligence api:", error);
    return NextResponse.json(
      { error: `failed to process intelligence: ${error}` },
      { status: 500 }
    );
  }
}
