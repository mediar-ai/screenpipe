import { NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { ollama } from "ollama-ai-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { pipe } from "@screenpipe/js";
import { pipe as browserPipe, ElementInfo } from "@screenpipe/browser";
import { join } from "path";
import fs from "fs/promises";
import OpenAI from "openai";

// Define the schema for our LinkedIn messages
const linkedInMessageSchema = z.object({
  sender: z.string(),
  text: z.string(),
  timestamp: z.string(),
  contactName: z.string().optional(),
  conversationUrl: z.string().optional(),
});

// Make sure to include the deduplicateByStringSimilarity function if it's used client-side
function deduplicateByStringSimilarity(
  texts: ElementInfo[],
  threshold: number
) {
  const groups: { text: string; similar: string[] }[] = [];
  const processed = new Set<number>();

  // first remove empty strings and less than 20 characters
  texts = texts.filter(
    (text) => text.text && text.text !== "" && text.text.length > 20
  );

  // Simple Jaccard similarity for strings
  const calculateSimilarity = (str1: string, str2: string) => {
    if (str1 === str2) return 1.0;

    // Create sets of words/characters for comparison
    const set1 = new Set(str1.toLowerCase().split(/\s+/));
    const set2 = new Set(str2.toLowerCase().split(/\s+/));

    // Calculate intersection and union
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  };

  // Group similar texts
  for (let i = 0; i < texts.length; i++) {
    if (processed.has(i)) continue;

    const group = { text: texts[i].text!, similar: [] };
    processed.add(i);

    for (let j = 0; j < texts.length; j++) {
      if (i === j || processed.has(j)) continue;

      const similarity = calculateSimilarity(texts[i].text!, texts[j].text!);
      if (similarity >= threshold) {
        // @ts-ignore
        group.similar.push(texts[j]);
        processed.add(j);
      }
    }

    if (group.text.trim()) {
      groups.push(group);
    }
  }

  return groups;
}

const messagesArraySchema = z.object({
  messages: z.array(linkedInMessageSchema),
});

// Function to sync messages to CSV file
async function syncToCSV(messages: any, storagePath: string) {
  try {
    // Create timestamp for filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `linkedin-messages-${timestamp}.csv`;
    const filePath = join(storagePath, filename);

    // Create CSV header
    const header =
      "Sender,Message,Timestamp,ContactName,ConversationURL,SyncedAt\n";

    // Format CSV rows
    const rows = messages
      .map((msg: any) => {
        // Escape quotes in text fields
        const escapedMessage = msg.text.replace(/"/g, '""');
        const escapedSender = msg.sender.replace(/"/g, '""');
        const escapedContactName = (msg.contactName || "").replace(/"/g, '""');

        return `"${escapedSender}","${escapedMessage}","${
          msg.timestamp
        }","${escapedContactName}","${
          msg.conversationUrl || ""
        }","${new Date().toISOString()}"`;
      })
      .join("\n");

    // Write to file
    await fs.writeFile(filePath, header + rows, "utf-8");

    return {
      success: true,
      filePath,
      recordCount: messages.length,
    };
  } catch (error) {
    console.error("Error syncing to CSV:", error);
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const settings = await pipe.settings.getAll();

    const aiPreset = settings.aiPresets?.find((preset) => preset.defaultPreset);
    console.log("aiPreset", aiPreset);

    // check if aiPreset is correct
    if (!aiPreset) {
      return NextResponse.json(
        { error: "no ai preset found" },
        { status: 400 }
      );
    }

    // check if aiPreset is correct eg api key if openai or screenpipe-cloud
    if (aiPreset.provider === "openai" && !aiPreset.apiKey) {
      return NextResponse.json(
        { error: "no api key found for openai" },
        { status: 400 }
      );
    }

    // Get CSV storage path
    const csvStoragePath =
      settings.customSettings?.desktopToTable?.csvStoragePath;

    if (!csvStoragePath) {
      return NextResponse.json(
        {
          error:
            "missing csv storage path - please set a path to save csv files",
        },
        { status: 400 }
      );
    }

    // Check if path exists and is writable
    try {
      await fs.access(csvStoragePath, fs.constants.W_OK);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            "cannot write to the specified path - please check permissions",
        },
        { status: 400 }
      );
    }

    const linkedinMessages = await browserPipe.operator
      .locator({
        app: "Arc",
        role: "AXGroup",
        useBackgroundApps: true,
        activateApp: true,
      })
      .all(3, 1);

    const texts = deduplicateByStringSimilarity(linkedinMessages, 0.5).map(
      (group) => group.text
    );

    console.log("non deduplicated length", linkedinMessages.length);
    console.log("deduplicated length", texts.length);
    console.log("texts", texts);

    // Split texts into batches of max 200
    const batchSize = 100;
    const batches = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    console.log(`Processing ${batches.length} batches of messages`);

    let apiKey = "";
    if (aiPreset!.provider === "openai" || aiPreset!.provider === "custom") {
      if ("apiKey" in aiPreset!) {
        apiKey = aiPreset.apiKey!; // Fixed assignment operator
      } else {
        return;
      }
    }

    // Create provider outside the loop
    const openai = new OpenAI({
      baseURL: aiPreset?.url,
      apiKey:
        aiPreset?.provider === "screenpipe-cloud"
          ? settings?.user?.token
          : apiKey,
    });

    // Process each batch and collect results
    const allMessages = [];

    for (let i = 0; i < batches.length; i++) {
      const batchTexts = batches[i];
      console.log(
        `Processing batch ${i + 1}/${batches.length} with ${
          batchTexts.length
        } items`
      );

      const prompt = `You are analyzing text extracted from LinkedIn messages.
      Based on the following extracted text, identify and structure the LinkedIn messages.
      
      Extracted text:
      ${batchTexts.join("\n\n")}
      
      Analyze this text and extract structured LinkedIn message data, including:
      - The message sender (who wrote the message)
      - The message text content
      - Approximate timestamp (use current time if not identifiable)
      - Contact name if it can be identified
      
      Focus on identifying message patterns, such as:
      - Name: message format
      - Conversation segments with clear sender/content boundaries
      - Dialog patterns
      
      Return an array of message objects with the following structure:
      {
        "messages": [
          {
            "sender": "Person Name",
            "text": "Message content",
            "timestamp": "ISO timestamp",
            "contactName": "Contact name if available",
            "conversationUrl": "Conversation URL if available"
          }
        ]
      }
      
      Only include data that is clearly a message. Skip header/UI text, navigation elements, etc.
      Do not add \`\`\`json or \`\`\` at the beginning or end of your response.
      If you cannot identify structured messages, return an empty array.`;

      const response = await openai.chat.completions.create({
        model: aiPreset!.model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      // Parse and validate the response against our schema
      try {
        console.log("response", response.choices[0].message.content);
        const parsedMessages = JSON.parse(
          response.choices[0].message.content || "{}"
        );

        allMessages.push(...parsedMessages.messages);
      } catch (error) {
        console.error("Failed to parse OpenAI response:", error);
      }
    }

    if (allMessages.length > 0) {
      // Sync all merged messages to CSV
      const csvResult = await syncToCSV(allMessages, csvStoragePath);

      console.log("CSV save result:", csvResult);

      return NextResponse.json({
        messages: allMessages,
        syncResult: "success",
        syncedAt: new Date().toISOString(),
        recordCount: allMessages.length,
        filePath: csvResult.filePath,
        batchesProcessed: batches.length,
      });
    }

    return NextResponse.json({ messages: allMessages });
  } catch (error) {
    console.error("Error processing LinkedIn messages:", error);
    return NextResponse.json(
      { error: `Failed to process messages: ${error}` },
      { status: 500 }
    );
  }
}

// Add cron endpoint for automated syncing
export async function POST(request: Request) {
  try {
    // Forward to GET handler with sync=true parameter
    const url = new URL(request.url);
    url.searchParams.set("sync", "true");

    const cronRequest = new Request(url.toString(), {
      method: "GET",
      headers: request.headers,
    });

    return GET(cronRequest);
  } catch (error) {
    console.error("Error in cron job:", error);
    return NextResponse.json(
      { error: `Failed to run cron job: ${error}` },
      { status: 500 }
    );
  }
}
