const INTERVAL = 60 * 6 * 1; // 1 hour in milliseconds
const NOTION_API_URL = "https://api.notion.com/v1/pages";
const NOTION_DATABASE_ID = process.env.SCREENPIPE_NOTION_DATABASE_ID;
const NOTION_API_KEY = process.env.SCREENPIPE_NOTION_API_KEY;

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
  screenData: ScreenData
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

  const result = await pipe.post(
    "http://localhost:11434/api/chat",
    JSON.stringify({
      model: "phi3.5",
      messages: [{ role: "user", content: prompt }],
      stream: false,
    })
  );

  console.log("AI answer:", result);

  const content = result.message.content;
  return JSON.parse(content);
}

async function syncLogToNotion(logEntry: EngineeringLog): Promise<void> {
  try {
    console.log("syncLogToNotion", logEntry);
    const response = await fetch(NOTION_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
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

  while (true) {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - INTERVAL);

      const screenData = await queryScreenpipe(
        oneHourAgo.toISOString(),
        now.toISOString()
      );

      if (screenData.data && screenData.data.length > 0) {
        const logEntry = await generateEngineeringLog(screenData);
        await syncLogToNotion(logEntry);
      } else {
        console.log("No relevant engineering work detected in the last hour");
      }
    } catch (error) {
      console.error("Error in engineering log pipeline:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL));
  }
}

streamEngineeringLogsToNotion();

/*
Instructions to run this pipe:

1. Make sure you have Ollama installed and running:
   https://github.com/jmorganca/ollama

2. Run the phi3.5 model:
   ollama run phi3.5

3. Set up your Notion integration and get your API key:
   https://www.notion.so/my-integrations

4. Create a Notion database with the following properties:
   - Title (title)
   - Tags (multi-select)
   - Date (date)
   - share this page with your integration (click three dots, connections, your integration)

5. Set the following environment variables:
   export SCREENPIPE_NOTION_API_KEY=your_notion_api_key
   export SCREENPIPE_NOTION_DATABASE_ID=your_notion_database_id # e.g. https://www.notion.so/83c75a51b3bd4a?something

The pipe will run continuously, checking for engineering work every hour
and logging it to your Notion database.
*/
