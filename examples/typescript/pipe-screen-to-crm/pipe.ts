const DEFAULT_INTERVAL = 60; // 1 minute in seconds
const DEFAULT_OLLAMA_API_URL = "http://localhost:11434/api/chat";
const DEFAULT_OLLAMA_MODEL = "phi3.5:3.8b-mini-instruct-q4_K_M";
const NOTION_API_BASE = "https://api.notion.com/v1";
const DEFAULT_NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const DEFAULT_NOTION_API_KEY = process.env.NOTION_API_KEY;
const DEFAULT_PAGE_SIZE = 100;

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
   - create a database with properties: Name (text), Company (text), Position (text), LinkedIn URL (url), Last Interaction (text), Potential Opportunity (text), Date (date)
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

async function queryScreenpipe(interval: number, pageSize: number) {
  try {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - interval);

    const queryParams = `start_time=${oneMinuteAgo.toISOString()}&end_time=${now.toISOString()}&limit=${pageSize}&content_type=ocr`;

    console.log(`querying screenpipe with params: ${queryParams}`);
    const result = await fetch(
      `http://localhost:3030/search?${queryParams}`
    ).then((r) => r.json());
    console.log("retrieved", result.data.length, "items from screenpipe");
    return result.data;
  } catch (error) {
    console.error("error querying screenpipe:", error);
    return [];
  }
}

async function extractLinkedInData(
  screenData: any,
  ollamaApiUrl: string,
  ollamaModel: string
) {
  console.log(
    "extracting linkedin data from",
    screenData.length,
    "screen data items"
  );
  const prompt = `
You are an AI assistant tasked with extracting LinkedIn sales-related information from screen data (OCR). 
Analyze the following screen data and extract relevant information about potential sales leads or customers.
Only extract information if you are highly confident it is related to LinkedIn and sales activities.

Screen Data:
${JSON.stringify(screenData)}

Return a JSON array of objects with the following structure:
[
  {
    "name": "Full name of the person",
    "company": "Company name",
    "position": "Job title",
    "linkedInUrl": "LinkedIn profile URL",
    "lastInteraction": "Brief description of last interaction",
    "potentialOpportunity": "Brief description of potential sales opportunity",
    "confidence": 0.95 // Your confidence level in the extracted information (0.0 to 1.0)
  }
]

Rules:
- Do not add backticks to the JSON eg \`\`\`json\`\`\` is WRONG
- If no relevant information is found, return an empty array. NOTHING ELSE.
- DO NOT RETURN ANYTHING BUT JSON. NO COMMENTS BELOW THE JSON.
- In the potentialOpportunity field, feel free to say you should follow up with the lead at specific date in the future (provide the date).
`;

  try {
    console.log(`sending request to ollama api: ${ollamaApiUrl}`);
    const response = await fetch(ollamaApiUrl + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.log("ollama response:", await response.text());
      throw new Error(`http error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log("ollama result:", JSON.stringify(result, null, 2));

    // remove backticks from the result
    const cleanedResult = result.message.content
      .trim()
      .replace(/```json\n/g, "")
      .replace(/\n```/g, "");
    const extractedData = JSON.parse(cleanedResult);
    console.log(
      "extracted linkedin data:",
      JSON.stringify(extractedData, null, 2)
    );
    return extractedData;
  } catch (error) {
    console.error("error extracting linkedin data:", error);
    return [];
  }
}

async function readFromNotion(databaseId: string, apiKey: string) {
  const url = `${NOTION_API_BASE}/databases/${databaseId}/query`;
  console.log("reading from notion:", url);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    console.log("notion response:", await response.text());
    throw new Error(`http error! status: ${response.status}`);
  }

  const data = await response.json();
  console.log("notion data:", JSON.stringify(data, null, 2));
  return data.results.map((page: any) => page.properties);
}

async function updateNotion(
  databaseId: string,
  records: any[],
  apiKey: string
) {
  const url = `${NOTION_API_BASE}/pages`;
  const updatedRecords = [];

  for (const record of records) {
    console.log("updating record:", JSON.stringify(record, null, 2));
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: record,
      }),
    });
    if (!response.ok) {
      console.log("notion response:", await response.text());
      throw new Error(`http error! status: ${response.status}`);
    }
    updatedRecords.push(await response.json());
    console.log("updated record:", JSON.stringify(updatedRecords[0], null, 2));
  }

  return updatedRecords;
}

async function updateNotionWithLinkedInData(
  existingData: any[],
  linkedInData: any[]
) {
  console.log(
    "updating notion with",
    linkedInData.length,
    "linkedin data items"
  );
  const updatedRecords = [];

  for (const item of linkedInData) {
    console.log("processing item:", item);
    const existingRecord = existingData.find(
      (record) => record.Name.title[0]?.plain_text === item.name
    );
    console.log("existing record:", existingRecord);

    const linkedInUrl =
      item.linkedInUrl && item.linkedInUrl.trim() !== ""
        ? item.linkedInUrl
        : null;

    if (existingRecord) {
      // update existing record
      updatedRecords.push({
        Name: { title: [{ text: { content: item.name } }] },
        Company: { rich_text: [{ text: { content: item.company || "" } }] },
        Position: { rich_text: [{ text: { content: item.position || "" } }] },
        "LinkedIn URL": { url: linkedInUrl },
        "Last Interaction": {
          rich_text: [{ text: { content: item.lastInteraction || "" } }],
        },
        "Potential Opportunity": {
          rich_text: [{ text: { content: item.potentialOpportunity || "" } }],
        },
        Date: { date: { start: new Date().toISOString() } },
      });
    } else {
      // add new record
      updatedRecords.push({
        Name: { title: [{ text: { content: item.name } }] },
        Company: { rich_text: [{ text: { content: item.company || "" } }] },
        Position: { rich_text: [{ text: { content: item.position || "" } }] },
        "LinkedIn URL": { url: linkedInUrl },
        "Last Interaction": {
          rich_text: [{ text: { content: item.lastInteraction || "" } }],
        },
        "Potential Opportunity": {
          rich_text: [{ text: { content: item.potentialOpportunity || "" } }],
        },
        Date: { date: { start: new Date().toISOString() } },
      });
    }
  }

  return updatedRecords;
}

async function enrichCRM(
  linkedInData: any,
  databaseId: string,
  apiKey: string
) {
  console.log("enriching crm with", linkedInData.length, "linkedin data items");
  try {
    // read existing data from notion
    const existingData = await readFromNotion(databaseId, apiKey);
    console.log("existing data records:", existingData.length);

    // update notion with linkedin data
    const updatedRecords = await updateNotionWithLinkedInData(
      existingData,
      linkedInData
    );

    console.log("updating notion with", updatedRecords.length, "records");
    // update the notion database
    await updateNotion(databaseId, updatedRecords, apiKey);
    console.log("updated notion with linkedin data");
  } catch (error) {
    console.error("error enriching crm:", error);
  }
}

async function runLinkedInCRMEnricher() {
  console.log("starting linkedin crm enricher");
  const config = await pipe.loadConfig();
  console.log("loaded config:", JSON.stringify(config, null, 2));
  const interval = (config.interval || DEFAULT_INTERVAL) * 1000;
  const databaseId = config.notionDatabaseId || DEFAULT_NOTION_DATABASE_ID;
  const apiKey = config.notionApiKey || DEFAULT_NOTION_API_KEY;
  const ollamaApiUrl = config.ollamaApiUrl || DEFAULT_OLLAMA_API_URL;
  const ollamaModel = config.ollamaModel || DEFAULT_OLLAMA_MODEL;
  const pageSize = config.pageSize || DEFAULT_PAGE_SIZE;
  while (true) {
    try {
      console.log("starting new enrichment cycle");
      const screenData = await queryScreenpipe(interval, pageSize);
      if (screenData.length === 0) {
        console.log("no screen data found in this interval");
        continue;
      }
      const linkedInData = await extractLinkedInData(
        screenData,
        ollamaApiUrl,
        ollamaModel
      );
      if (linkedInData.length > 0) {
        await enrichCRM(linkedInData, databaseId, apiKey);
      } else {
        console.log("no relevant linkedin data found in this interval");
      }
    } catch (error) {
      console.error("error in linkedin crm enrichment cycle:", error);
    } finally {
      console.log(`waiting ${interval / 1000} seconds before next cycle`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// Self-invoking async function to run the LinkedIn CRM enricher
(async () => {
  try {
    await runLinkedInCRMEnricher();
  } catch (error) {
    console.error("fatal error in linkedin crm enricher:", error);
  }
})();
