import { Client } from "@notionhq/client";
import { z } from "zod";
import { generateObject } from "ai";
import { createOllama } from "ollama-ai-provider";
import { pipe, ContentItem } from "@screenpipe/js";

const engineeringLog = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

type EngineeringLog = z.infer<typeof engineeringLog>;

async function generateEngineeringLog(
  screenData: ContentItem[],
  ollamaModel: string,
  ollamaApiUrl: string
): Promise<EngineeringLog> {
  const prompt = `Based on the following screen data, generate a concise engineering log entry:

    ${JSON.stringify(screenData)}

    Focus only on engineering work. Ignore non-work related activities.
    Return a JSON object with the following structure:
    {
        "title": "Brief title of the engineering task",
        "description": "Concise description of the engineering work done",
        "tags": ["tag1", "tag2", "tag3"]
    }
    Provide 1-3 relevant tags related to the engineering work.`;

  const provider = createOllama({ baseURL: ollamaApiUrl });

  const response = await generateObject({
    model: provider(ollamaModel),
    messages: [{ role: "user", content: prompt }],
    schema: engineeringLog,
  });

  console.log("ai answer:", response);

  return response.object;
}

async function syncLogToNotion(
  logEntry: EngineeringLog,
  notion: Client,
  databaseId: string
): Promise<void> {
  try {
    console.log("syncLogToNotion", logEntry);
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Title: { title: [{ text: { content: logEntry.title } }] },
        Description: {
          rich_text: [{ text: { content: logEntry.description } }],
        },
        Tags: { multi_select: logEntry.tags.map((tag) => ({ name: tag })) },
        Date: { date: { start: new Date().toISOString() } },
      },
    });

    console.log("engineering log synced to notion successfully");

    // Create markdown table for inbox
    const markdownTable = `
| Title | Description | Tags |
|-------|-------------|------|
| ${logEntry.title} | ${logEntry.description} | ${logEntry.tags.join(", ")} |
    `.trim();

    await pipe.inbox.send({
      title: "engineering log synced",
      body: `new engineering log entry:\n\n${markdownTable}`,
    });
  } catch (error) {
    console.error("error syncing engineering log to notion:", error);
    await pipe.inbox.send({
      title: "engineering log error",
      body: `error syncing engineering log to notion: ${error}`,
    });
  }
}

function streamEngineeringLogsToNotion(): void {
  console.log("starting engineering logs stream to notion");

  const config = pipe.loadPipeConfig();
  console.log("loaded config:", JSON.stringify(config, null, 2));

  const interval = config.interval * 1000;
  const databaseId = config.notionDatabaseId;
  const apiKey = config.notionApiKey;
  const ollamaApiUrl = config.ollamaApiUrl;
  const ollamaModel = config.ollamaModel;

  const notion = new Client({ auth: apiKey });

  pipe.inbox.send({
    title: "engineering log stream started",
    body: `monitoring engineering work every ${config.interval} seconds`,
  });

  pipe.scheduler
    .task("generateEngineeringLog")
    .every(interval)
    .do(async () => {
      try {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - interval);

        const screenData = await pipe.queryScreenpipe({
          startTime: oneHourAgo.toISOString(),
          endTime: now.toISOString(),
          limit: 50,
          contentType: "ocr",
        });

        if (screenData && screenData.data.length > 0) {
          const logEntry = await generateEngineeringLog(
            screenData.data,
            ollamaModel,
            ollamaApiUrl
          );
          await syncLogToNotion(logEntry, notion, databaseId);
        } else {
          console.log("no relevant engineering work detected in the last hour");
        }
      } catch (error) {
        console.error("error in engineering log pipeline:", error);
        await pipe.inbox.send({
          title: "engineering log error",
          body: `error in engineering log pipeline: ${error}`,
        });
      }
    });

  pipe.scheduler.start();
}

streamEngineeringLogsToNotion();

/*

Instructions to run this pipe:

1. install screenpipe and git clone this repo
    ```
    git clone https://github.com/mediar-ai/screenpipe.git
    cd screenpipe
    ```

2. install and run ollama:
   - follow instructions at https://github.com/jmorganca/ollama
   - run `ollama run phi3.5:3.8b-mini-instruct-q4_K_M`

3. set up notion:
   - create a notion integration: https://www.notion.so/my-integrations - copy the API key
   - create a database with properties: Title (text), Description (text), Tags (multi-select), Date (date)
   - share database with your integration - copy the database ID eg https://www.notion.so/<THIS>?<NOTTHIS>

4. set environment variables:
   ```
   export SCREENPIPE_NOTION_API_KEY=your_notion_api_key
   export SCREENPIPE_NOTION_DATABASE_ID=your_notion_database_id
   ```

5. run the pipe:
   ```
   screenpipe pipe download ./examples/typescript/pipe-screen-to-crm
   screenpipe pipe enable screen-to-crm
   screenpipe 
   ```

*/
