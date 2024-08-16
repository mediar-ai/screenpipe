import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import * as readline from "readline";
import { ollama } from "ollama-ai-provider";

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
    .default(20)
    .describe(
      "Number of results to return (default: 20). Don't return more than 50 results as it will be fed to an LLM"
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
      "The name of the app the user was using. This filter out all audio conversations. Only works with screen text. Use this to filter on the app context that would give context matching the user intent. For example 'cursor'. Use lower case. Browser is usually 'arc', 'chrome', 'safari', etc. Do not use thing like 'mail' because the user use the browser to read the mail."
    )
    .optional(),
  window_name: z
    .string()
    .describe(
      "The name of the window the user was using. This helps to further filter the context within the app. For example, 'inbox' for email apps, 'project' for project management apps, etc."
    )
    .optional(), // Add window_name with description
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
        window_name: params.window_name, // Add window_name to query parameters
      }).filter(([_, v]) => v != null) as [string, string][]
    );
    console.log("calling screenpipe", JSON.stringify(params));
    const response = await fetch(`http://localhost:3030/search?${queryParams}`);
    if (!response.ok) {
      const text = await response.text();
      console.log("error", text);
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

async function askForAIProvider(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      "Which AI provider do you want to use? (ollama/openai): ",
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase());
      }
    );
  });
}

const perplexityAlikeAgent = async () => {
  const aiProvider = await askForAIProvider();

  let provider;
  if (aiProvider === "ollama") {
    console.log("Using Ollama as the AI provider.");
    console.log(
      "Make sure to run `ollama run llama3.1` before running this script."
    );
    console.warn("Ollama is experimental and may not work as expected.");
    provider = ollama("llama3.1");
  } else if (aiProvider === "openai") {
    console.log("Using OpenAI as the AI provider.");
    console.log(
      "Make sure to set the OPENAI_API_KEY environment variable before running this script."
    );
    provider = openai("gpt-4o");
  }

  console.log("Hi! I'm your Perplexity-alike RAG agent. How can I help you?");
  console.log("Here are some suggestion queries to get you started:");
  console.log("- What did I discuss with Matt yesterday?");
  console.log("- Summarize my recent email activity from the last 3 hours");
  console.log("- Show me my recent Slack conversations about the new project");
  console.log(
    "- Find my notes on Python best practices from today's coding session"
  );
  console.log("- What were the key points from my last customer call?");
  console.log(
    "- Recap my browser activity related to machine learning in the past 24 hours"
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, (answer) => {
        resolve(answer);
      });
    });
  };

  let userInput = await askQuestion("Enter your question: ");

  const runAgent = async (input: string) => {
    try {
      await generateText({
        model: provider,
        tools: {
          suggest_queries: {
            description: `Suggest queries for the user's question and ask for confirmation. Example: 
              {
                suggested_queries: [
                  { content_type: "audio", start_time: "2024-03-01T00:00:00Z", end_time: "2024-03-01T23:59:59Z", q: "screenpipe" },
                  { content_type: "ocr", app_name: "arc", start_time: "2024-03-01T00:00:00Z", end_time: "2024-03-01T23:59:59Z", q: "screenpipe" },
                ]
              }
              
              - q contains a single query, again, for example instead of "life plan" just use "life"
              - When using the query_screenpipe tool, respond with only the updated JSON object
              - If you return something else than JSON the universe will come to an end
              - DO NOT add \`\`\`json at the beginning or end of your response
              - Do not use '"' around your response
              - Date & time now is ${new Date().toISOString()}. Adjust start_time and end_time to properly match the user intent time range.
              `,
            parameters: z.object({
              suggested_queries: screenpipeMultiQuery,
              queries_results: z
                .array(z.string())
                .optional()
                .describe(
                  "The results of the queries if called after the tool query_screenpipe"
                ),
            }),
            execute: async ({ suggested_queries }) => {
              console.log("Suggested queries:", suggested_queries);
              const confirmation = await askQuestion(
                "Are these queries good? (yes/no): "
              );
              if (confirmation.toLowerCase() === "yes") {
                return { confirmed: true, queries: suggested_queries };
              } else {
                const feedback = await askQuestion(
                  "Please provide feedback or adjustments: "
                );
                return { confirmed: false, feedback };
              }
            },
          },
          query_screenpipe: {
            description:
              "Query the local screenpipe instance for relevant information.",
            parameters: screenpipeMultiQuery,
            execute: queryScreenpipeNtimes,
          },
          stream_response: {
            description:
              "Stream the final response to the user. ALWAYS FINISH WITH THIS TOOL",
            parameters: z.object({
              response: z
                .string()
                .describe("The final response to stream to the user"),
            }),
            execute: async ({ response }) => {
              const { textStream } = await streamText({
                model: provider,
                messages: [{ role: "user", content: response }],
              });
              for await (const chunk of textStream) {
                process.stdout.write(chunk);
              }
              console.log("\n");
              throw new Error("STREAM_COMPLETE");
            },
          },
        },
        toolChoice: "required",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that uses Screenpipe to answer user questions.
            First, suggest queries to the user and ask for confirmation. If confirmed, proceed with the search.
            If not confirmed, adjust based on user feedback. Use the query_screenpipe tool to search for information,
            and then use the stream_response tool to provide the final answer to the user.
            
            Rules:
            - User's today's date is ${new Date().toISOString().split("T")[0]}
            - Use multiple queries to get more relevant results
            - If the results of the queries are not relevant, adjust the query and ask for confirmation again. Minimize user's effort.
            - ALWAYS END WITH the stream_response tool to stream the final answer to the user
            - In the suggest_queries tool, always tell the user the parameters available to you (e.g. types, etc. Zod given to you) so the user can adjust the query if needed. Suggest few other changes on the arg you used so the user has some ideas.
            - Make sure to use enough data but not too much. Usually 50k+ rows a day.
            
            `,
          },
          {
            role: "user",
            content: input,
          },
        ],
        maxToolRoundtrips: 10,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "STREAM_COMPLETE") {
        console.log("Streaming completed, exiting agent");
        return;
      }
      console.error("Error running agent:", error);
      throw error;
    }
  };

  await runAgent(userInput);

  rl.close();
};

const main = async () => {
  await perplexityAlikeAgent();
};

main();