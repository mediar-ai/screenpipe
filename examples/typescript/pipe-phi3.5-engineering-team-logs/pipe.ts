const NOTION_API_URL = "https://api.notion.com/v1/pages";

interface ScreenData {
  data: {
    content: {
      timestamp: string;
      text: string;
    };
  }[];
}

interface EngineeringLog {
  title: string;
  description: string;
  tags: string[];
}

async function queryScreenpipe(
  startTime: string,
  endTime: string
): Promise<ScreenData> {
  try {
    const queryParams = `start_time=${startTime}&end_time=${endTime}&limit=50&content_type=ocr`;
    const response = await fetch(`http://localhost:3030/search?${queryParams}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error querying screenpipe:", error);
    return { data: [] };
  }
}

async function generateEngineeringLog(
  screenData: ScreenData,
  ollamaApiUrl: string,
  ollamaModel: string
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

  const response = await fetch(ollamaApiUrl + "/chat", {
    method: "POST",
    body: JSON.stringify({
      model: ollamaModel,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Error generating engineering log:", errorBody);
    throw new Error(
      `HTTP error! status: ${response.status}, body: ${errorBody}`
    );
  }

  const result = await response.json();

  console.log("AI answer:", result);

  const content = result.message.content;
  return JSON.parse(content);
}

async function syncLogToNotion(
  logEntry: EngineeringLog,
  apiKey: string,
  databaseId: string
): Promise<void> {
  try {
    console.log("syncLogToNotion", logEntry);
    const response = await fetch(NOTION_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          Title: { title: [{ text: { content: logEntry.title } }] },
          Description: {
            rich_text: [{ text: { content: logEntry.description } }],
          },
          Tags: { multi_select: logEntry.tags.map((tag) => ({ name: tag })) },
          Date: { date: { start: new Date().toISOString() } },
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `HTTP error! status: ${response.status}, body: ${errorBody}`
      );
    }

    console.log("Engineering log synced to Notion successfully");
  } catch (error) {
    console.error("Error syncing engineering log to Notion:", error);
  }
}

async function streamEngineeringLogsToNotion(): Promise<void> {
  console.log("Starting Engineering Logs Stream to Notion");

  const config = await pipe.loadConfig();
  console.log("loaded config:", JSON.stringify(config, null, 2));

  const interval = config.interval * 1000;
  const databaseId = config.notionDatabaseId;
  const apiKey = config.notionApiKey;
  const ollamaApiUrl = config.ollamaApiUrl;
  const ollamaModel = config.ollamaModel;

  while (true) {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - interval);

      const screenData = await queryScreenpipe(
        oneHourAgo.toISOString(),
        now.toISOString()
      );

      if (screenData.data && screenData.data.length > 0) {
        const logEntry = await generateEngineeringLog(
          screenData,
          ollamaApiUrl,
          ollamaModel
        );
        await syncLogToNotion(logEntry, apiKey, databaseId);
      } else {
        console.log("No relevant engineering work detected in the last hour");
      }
    } catch (error) {
      console.error("Error in engineering log pipeline:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
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
