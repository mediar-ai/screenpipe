interface ConversationEntry {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  painPoints: string[];
  needs: string[];
  sentiment: string;
  timestamp: string;
}

function extractJsonFromLlmResponse(response: string): any {
  // Remove any markdown code block syntax
  let cleaned = response.replace(/^```(?:json)?\s*|\s*```$/g, "");

  // Try to find JSON-like content
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  // Remove any non-JSON content before or after the main object
  cleaned = cleaned.replace(/^[^{]*/, "").replace(/[^}]*$/, "");

  // Replace any escaped newlines and remove actual newlines
  cleaned = cleaned.replace(/\\n/g, "").replace(/\n/g, "");

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.warn("failed to parse json:", error);
    console.warn("cleaned content:", cleaned);

    // Attempt to fix common issues
    cleaned = cleaned
      .replace(/,\s*}/g, "}") // Remove trailing commas
      .replace(/'/g, '"') // Replace single quotes with double quotes
      .replace(/(\w+):/g, '"$1":') // Add quotes to keys
      .replace(/:\s*'([^']*)'/g, ': "$1"'); // Replace single-quoted values with double-quoted values

    try {
      return JSON.parse(cleaned);
    } catch (secondError) {
      console.warn("failed to parse json after attempted fixes:", secondError);
      throw new Error("invalid json format in llm response");
    }
  }
}

async function summarizeConversation(
  conversationData: ContentItem[],
  aiApiUrl: string,
  aiModel: string,
  customSummaryPrompt: string
): Promise<ConversationEntry | null> {
  const prompt = `${customSummaryPrompt}

    analyze the following conversation:

    ${JSON.stringify(conversationData)}

    return a json object with the following structure:
    {
      "summary": "brief summary of the conversation",
      "keyPoints": ["key point 1", "key point 2", ...],
      "actionItems": ["action item 1", "action item 2", ...],
      "painPoints": ["pain point 1", "pain point 2", ...],
      "needs": ["need 1", "need 2", ...],
      "sentiment": "positive/neutral/negative"
    }
    
    rules:
    - do not add backticks to the json eg \`\`\`json\`\`\` is wrong
    - do not return anything but json. no comments below the json.
    - if the data does not seem to be related to user conversation, return "false"
    `;

  const response = await fetch(aiApiUrl, {
    method: "POST",
    body: JSON.stringify({
      model: aiModel,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    console.log("ai response:", await response.text());
    throw new Error(`http error! status: ${response.status}`);
  }

  const result = await response.json();
  console.log("ai answer:", result);
  if (result.message.content === "false") {
    return null;
  }

  let content;
  try {
    content = extractJsonFromLlmResponse(result.message.content);
  } catch (error) {
    console.warn("failed to parse ai response:", error, result);
    throw new Error("invalid ai response format");
  }

  return {
    ...content,
    timestamp: new Date().toISOString(),
  };
}

async function addToNotion(
  notionApiKey: string,
  databaseId: string,
  entry: ConversationEntry
): Promise<void> {
  const response = await fetch(`https://api.notion.com/v1/pages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        "Summary": { title: [{ text: { content: entry.summary } }] },
        "Key Points": {
          rich_text: [{ text: { content: entry.keyPoints.join(", ") } }],
        },
        "Action Items": {
          rich_text: [{ text: { content: entry.actionItems.join(", ") } }],
        },
        "Pain Points": {
          rich_text: [{ text: { content: entry.painPoints.join(", ") } }],
        },
        "Needs": { rich_text: [{ text: { content: entry.needs.join(", ") } }] },
        "Sentiment": { select: { name: entry.sentiment } },
        "Timestamp": { date: { start: entry.timestamp } },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`failed to add to notion: ${response.statusText}`);
  }

  console.log("successfully added to notion");
}

async function syncConversationPipeline(): Promise<void> {
  console.log("starting conversation sync pipeline");

  const config = await pipe.loadConfig();
  console.log("loaded config:", JSON.stringify(config, null, 2));

  const {
    pollingInterval,
    windowName,
    aiApiUrl,
    aiModel,
    notionApiKey,
    notionDatabaseId,
    customSummaryPrompt,
  } = config;

  while (true) {
    try {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const conversationData = await pipe.queryScreenpipe({
        start_time: fiveMinutesAgo.toISOString(),
        end_time: now.toISOString(),
        window_name: windowName,
        content_type: "ocr",
        limit: 1000,
      });

      if (
        conversationData &&
        conversationData.data &&
        conversationData.data.length > 0
      ) {
        const summary = await summarizeConversation(
          conversationData.data,
          aiApiUrl,
          aiModel,
          customSummaryPrompt
        );
        if (!summary) {
          console.log("no summary found");
          continue;
        }
        console.log("conversation summary:", summary);

        await addToNotion(notionApiKey, notionDatabaseId, summary);
        console.log("added to notion");
      }
    } catch (error) {
      console.warn("error in conversation sync pipeline:", error);
    }
    console.log("sleeping for", pollingInterval, "ms");
    await new Promise((resolve) => setTimeout(resolve, pollingInterval));
  }
}

syncConversationPipeline();
