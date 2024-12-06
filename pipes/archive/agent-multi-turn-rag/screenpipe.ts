import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import * as readline from "readline";

// example use:
// can you create a bullet list for me to share with my colleagues
// my changes in the code of screenpipe? Use the queries like "lldb", "gdp", "discord"

const screenpipeQuery = z.object({
  q: z
    .string()
    .describe(
      "The search query matching exact keywords. Use a single keyword that best matches the user intent. This would match either audio transcription or OCR screen text. Example: do not use 'discuss' the user ask about conversation, this is dumb, won't return any result"
    )
    .optional(),
  content_type: z
    .enum(["ocr", "audio", "all"])
    .default("all")
    .describe(
      "The type of content to search for: screenshot data or audio transcriptions"
    ),
  limit: z
    .number()
    .default(5)
    .describe(
      "Number of results to return (default: 5). Don't return more than 50 results as it will be fed to an LLM"
    ),
  offset: z.number().default(0).describe("Offset for pagination (default: 0)"),
  start_time: z
    .string()
    // 1 hour ago
    .default(new Date(Date.now() - 3600000).toISOString())
    .describe("Start time for search range in ISO 8601 format"),
  end_time: z
    .string()
    .default(new Date().toISOString())
    .describe("End time for search range in ISO 8601 format"),
  app_name: z
    .string()
    .describe(
      "The name of the app the user was using. This filter out all audio conversations. Only works with screen text. Use this to filter on the app context that would give context matching the user intent. For example 'cursor'. Use lower case. Browser is usually 'arc', 'chrome', 'safari', etc."
    )
    .optional(),
});
const screenpipeMultiQuery = z.object({
  queries: z.array(screenpipeQuery),
});

async function queryScreenpipeNtimes(
  params: z.infer<typeof screenpipeMultiQuery>
) {
  console.log(
    "Using tool queryScreenpipeNtimes with params:",
    JSON.stringify(params)
  );
  return Promise.all(params.queries.map(queryScreenpipe));
}

// Add this new function to handle screenpipe requests
async function queryScreenpipe(params: z.infer<typeof screenpipeQuery>) {
  try {
    console.log("params", params);
    const queryParams = new URLSearchParams(
      Object.entries({
        q: params.q,
        offset: params.offset.toString(),
        limit: params.limit.toString(),
        start_time: params.start_time,
        end_time: params.end_time,
        content_type: params.content_type,
        app_name: params.app_name,
      }).filter(([_, v]) => v != null) as [string, string][]
    );
    console.log("calling screenpipe", JSON.stringify(params));
    const response = await fetch(`http://localhost:3030/search?${queryParams}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status} ${text}`);
    }
    const result = await response.json();
    console.log("result", result);
    return result;
  } catch (error) {
    console.error("Error querying screenpipe:", error);
    return null;
  }
}

const screenpipe = async () => {
  console.log("Hi! How can I help you?");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const inputMessage = await new Promise<string>((resolve) => {
    rl.question("Enter your message: ", (answer) => {
      rl.close();
      resolve(answer);
    });
  });

  const text = await generateText({
    model: openai("gpt-4o"),
    tools: {
      query_screenpipe: {
        description:
          "Query the local screenpipe instance for relevant information. You will return multiple queries under the key 'queries'.",
        parameters: screenpipeMultiQuery,
        execute: queryScreenpipeNtimes,
      },
      stream_response: {
        description: "Stream the final response to the user",
        parameters: z.object({
          response: z
            .string()
            .describe("The final response to stream to the user"),
        }),
        execute: async ({ response }) => {
          const { textStream } = await streamText({
            model: openai("gpt-4o"),
            messages: [
              {
                role: "user",
                content: response,
              },
            ],
          });
          for await (const chunk of textStream) {
            console.log(chunk);
          }
          return { success: true };
        },
      },
    },
    toolChoice: "required",
    messages: [
      {
        role: "system",
        content: `You are a helpful assistant.
      The user is using a product called "screenpipe" which records
      his screen and mics 24/7. The user ask you questions
      and you use his screenpipe recordings to answer him.
      Based on the user request, use tools to query screenpipe to best help the user. 
      Each query should have "q", "offset", "limit", "start_time", "end_time", and "content_type" fields. 
      Rules:
      - q should be a single keyword that would properly find in the text found on the user screen some information that would help answering the user question.
      Return a list of objects with the key "queries"
      - q contains a single query, again, for example instead of "life plan" just use "life"
      - Respond with only the updated JSON object
      - If you return something else than JSON the universe will come to an end
      - DO NOT add \`\`\`json at the beginning or end of your response
      - Do not use '"' around your response
      - Date & time now is ${new Date().toISOString()}. Adjust start_time and end_time to properly match the user intent time range.
      - If the user ask about his morning do not use morning as query that's dumb, try to infer some keywords from the user question
      - Very important: your output will be given to another LLM so make sure not to return too much data (typically each row returns lot of data)
      - Use between 2-5 queries with very different keywords that could maximally match the user's screen text or audio transcript
      - Use "all" for querying the same keyword over vision and audio
      - MAKE SURE TO RETURN AN ARRAY OF QUERIES e.g. {"queries": [ ... ]}
      - MAKE SURE TO RETURN AN ARRAY OF QUERIES e.g. {"queries": [ ... ]}
      - MAKE SURE TO RETURN AN ARRAY OF QUERIES e.g. {"queries": [ ... ]}
      - You typically always query screenpipe in the first user message

      Example answers from you:
      "{
        "queries": [
          {"q": "goal", "offset": 0, "limit": 10, "content_type": "all", "start_time": "2024-07-21T11:30:25Z", "end_time": "2024-07-21T11:35:25Z", "app_name": "arc"},
          {"offset": 0, "limit": 50, "content_type": "ocr", "start_time": "2024-07-19T08:00:25Z", "end_time": "2024-07-20T09:00:25Z"},
          {"q": "customer", "offset": 0, "limit": 20, "content_type": "audio", "start_time": "2024-07-19T08:00:25Z", "end_time": "2024-07-20T09:00:25Z"}
        ]
      }"

      or 
      "{
        "queries": [
          {"q": "sales", "offset": 0, "limit": 10, "content_type": "all", "start_time": "2024-07-21T11:30:25Z", "end_time": "2024-07-21T11:35:25Z"},
          {"q": "customer", "offset": 0, "limit": 20, "content_type": "all", "start_time": "2024-07-19T08:00:25Z", "end_time": "2024-07-20T09:00:25Z"},
          {"offset": 0, "limit": 10, "content_type": "all", "start_time": "2024-07-19T08:00:25Z", "end_time": "2024-07-20T09:00:25Z", "app_name": "notes"}
        ]
      }"

      `,
      },
      {
        role: "user",
        content: inputMessage,
      },
    ],
    maxToolRoundtrips: 3,
  });
};

screenpipe();
