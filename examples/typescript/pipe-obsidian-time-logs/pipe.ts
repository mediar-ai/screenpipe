import { z } from "zod";
import { generateObject } from "ai";
import { createOllama } from "ollama-ai-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { pipe, ContentItem } from "@screenpipe/js";
import * as fs from "fs/promises";
import * as path from "path";

const workLog = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  timeSpent: z.number(), // in seconds
});

type WorkLog = z.infer<typeof workLog>;

function getAIProvider(config: any) {
  if (config.openaiApiKey.length > 0 && config.gptModel.length > 0) {
    return createOpenAI({
      apiKey: config.openaiApiKey,
    });
  }
  return createOllama({ baseURL: config.ollamaApiUrl });
}

async function generateWorkLog(
  screenData: ContentItem[],
  provider: any,
  model: string,
  customPrompt?: string
): Promise<WorkLog> {
  const defaultPrompt = `Based on the following screen data, generate a concise work activity log entry:

    ${JSON.stringify(screenData)}

    Return a JSON object with the following structure:
    {
        "title": "Brief title of the activity",
        "description": "Concise description of what was done",
        "tags": ["#tag1", "#tag2", "#tag3"],
        "timeSpent": "5" // actual time spent in minutes
    }
    Provide 1-3 relevant tags related to the work. Each tag MUST start with #.
    Estimate time spent in minutes based on the activities timestamps.`;

  const prompt = customPrompt || defaultPrompt;

  const response = await generateObject({
    model: provider(model),
    messages: [{ role: "user", content: prompt }],
    schema: workLog,
  });

  console.log("ai answer:", response);

  return response.object;
}

async function syncLogToObsidian(
  logEntry: WorkLog,
  obsidianPath: string
): Promise<void> {
  try {
    console.log("syncLogToObsidian", logEntry);

    // Create the daily note filename in format YYYY-MM-DD.md
    const today = new Date();
    const filename = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}.md`;
    const filePath = path.join(obsidianPath, filename);

    // Create markdown table row for the entry
    const tableRow = `| ${logEntry.title} | ${
      logEntry.description
    } | ${logEntry.tags.join(", ")} | ${logEntry.timeSpent} min |\n`;

    try {
      // Try to read existing file
      await fs.access(filePath);
      // File exists, append to it
      await fs.appendFile(filePath, tableRow, "utf8");
    } catch {
      // File doesn't exist, create it with header and first row
      const content = `| Title | Description | Tags | Time Spent |\n|-------|-------------|------|------------|\n${tableRow}`;
      await fs.writeFile(filePath, content, "utf8");
    }

    console.log("work log synced to obsidian successfully");

    await pipe.inbox.send({
      title: "work log synced",
      body: `new work log entry synced to Obsidian: ${filename}`,
    });
  } catch (error) {
    console.error("error syncing work log to obsidian:", error);
    await pipe.inbox.send({
      title: "work log error",
      body: `error syncing work log to obsidian: ${error}`,
    });
  }
}

function streamWorkLogs(): void {
  console.log("starting work logs stream");

  const config = pipe.loadPipeConfig();
  console.log("loaded config:", JSON.stringify(config, null, 2));

  let successfulLogsCount = 0;
  const NOTIFICATION_THRESHOLD = 5; // Send notification every 5 successful logs

  const interval = config.interval * 1000;
  const obsidianPath = config.obsidianPath;
  const customPrompt = config.customPrompt;
  const pageSize = config.pageSize;
  const model = config.gptModel || config.ollamaModel;

  const provider = getAIProvider(config);
  pipe.inbox.send({
    title: "obsidian time logs stream started",
    body: `monitoring work activity every ${config.interval / 1000} seconds`,
  });
  pipe.scheduler
    .task("generateWorkLog")
    .every(interval)
    .do(async () => {
      try {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - interval);

        const screenData = await pipe.queryScreenpipe({
          startTime: oneHourAgo.toISOString(),
          endTime: now.toISOString(),
          limit: pageSize,
          contentType: "ocr",
        });

        if (screenData && screenData.data.length > 0) {
          const logEntry = await generateWorkLog(
            screenData.data,
            provider,
            model,
            customPrompt
          );
          await syncLogToObsidian(logEntry, obsidianPath);

          successfulLogsCount++;
          if (successfulLogsCount >= NOTIFICATION_THRESHOLD) {
            await pipe.inbox.send({
              title: "work logs batch synced",
              body: `synced ${NOTIFICATION_THRESHOLD} work log entries to obsidian`,
            });
            successfulLogsCount = 0; // Reset counter
          }
        } else {
          console.log("no relevant activity detected in the last interval");
        }
      } catch (error) {
        console.error("error in work log pipeline:", error);
        await pipe.inbox.send({
          title: "work log error",
          body: `error in work log pipeline: ${error}`,
        });
      }
    });

  pipe.inbox.send({
    title: "work log stream started",
    body: `monitoring work activity every ${
      config.interval / 1000
    } seconds. notifications will be batched every ${NOTIFICATION_THRESHOLD} successful logs.`,
  });

  pipe.scheduler.start();
}

streamWorkLogs();

/*

Instructions to run this pipe:

1. install screenpipe and git clone this repo
    ```
    git clone https://github.com/mediar-ai/screenpipe.git
    cd screenpipe
    ```

2. set up AI provider:
   Option 1 - OpenAI:
   - Set gptModel (e.g. "gpt-4o") and openaiApiKey in pipe.json
   
   Option 2 - Ollama (default):
   - Install Ollama: follow instructions at https://github.com/jmorganca/ollama
   - Run `ollama run llama3.2:3b-instruct-q4_K_M`
   - Optionally customize ollamaApiUrl and ollamaModel in pipe.json

3. set up obsidian:
   - create a folder in your obsidian vault for time entries
   - set obsidianPath in pipe.json to your obsidian vault time entries folder path

4. optionally customize other settings in pipe.json:
   - interval: how often to check for new entries
   - customPrompt: customize the AI prompt
   - pageSize: number of screen records to process

5. run the pipe:
   ```
   screenpipe pipe download ./examples/typescript/pipe-obsidian-time-logs
   screenpipe pipe enable pipe-obsidian-time-logs
   screenpipe
   ```

The pipe will:
- Monitor your screen activity at the configured interval
- Generate work activity log entries using OpenAI or Ollama
- Save entries to daily markdown files in your obsidian vault
- Each day's entries will be saved in YYYY-MM-DD.md format
- Entries are formatted as markdown tables with Title, Description, Tags, and Time Spent
- New entries are appended to existing daily files

*/
