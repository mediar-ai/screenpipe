import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, streamText } from "ai";
import { queryScreenpipe } from "./screenpipe";
// @ts-expect-error
import * as fs from "fs/promises";
import * as readline from "readline";
import { createOllama } from "ollama-ai-provider";

console.log("Starting daily tracker for freelancers");

const TaskSchema = z.object({
  topic: z
    .string()
    .optional()
    .describe("The main topic or project area of the task, if identifiable"),
  task: z
    .string()
    .optional()
    .describe(
      "A brief description of the specific task performed, if identifiable"
    ),
  unknown: z
    .boolean()
    .optional()
    .describe("Set to true if the task cannot be classified"),
});

interface Task {
  topic: string | undefined;
  task: string | undefined;
  startTime: string;
  endTime: string;
  duration: number;
}

interface DailyAnalysis {
  tasks: Task[];
  totalHours: number;
}

async function askForAIProvider(): Promise<{
  provider: string;
  model?: string;
}> {
  const rl = readline.createInterface({
    // @ts-expect-error
    input: process.stdin,
    // @ts-expect-error
    output: process.stdout,
  });

  const provider = await new Promise<string>((resolve) => {
    rl.question(
      "Which AI provider do you want to use? (ollama/openai): ",
      (answer) => {
        resolve(answer.toLowerCase());
      }
    );
  });

  let model: string | undefined;

  if (provider === "ollama") {
    model = await new Promise<string>((resolve) => {
      rl.question(
        "Which Ollama model do you want to use? (we only support models supporting tools: llama3.1, mistral-nemo, etc.): ",
        (answer) => {
          resolve(answer.toLowerCase());
        }
      );
    });
  }

  rl.close();
  return { provider, model };
}

async function dailyTracker() {
  const { provider: aiProvider, model: ollamaModel } = await askForAIProvider();

  let provider;

  if (aiProvider === "ollama") {
    console.log(`Using Ollama as the AI provider with model: ${ollamaModel}`);
    console.log(
      `Make sure to run \`ollama run ${ollamaModel}\` before running this script.`
    );
    provider = createOllama({ baseURL: "http://localhost:11434/api" })(
      ollamaModel!
    );
    try {
      await fetch(`http://localhost:11434/api/tags`);
    } catch (error) {
      console.log("error", error);
      throw new Error(
        "Cannot reach local Ollama instance at http://localhost:11434/api"
      );
    }
  } else if (aiProvider === "openai") {
    console.log("Using OpenAI as the AI provider.");
    console.log(
      "Make sure to set the OPENAI_API_KEY environment variable before running this script."
    );
    // @ts-expect-error
    provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })("gpt-4o");
  } else {
    console.log("Invalid AI provider. Exiting.");
    return;
  }

  console.log(
    "I'm going to crunch your daily activity and come back to you in a minute ..."
  );

  try {
    await generateText({
      model: provider,
      tools: {
        analyze_daily_activities: {
          description: "Analyze daily activities and classify tasks",
          parameters: z.object({}),
          execute: async () => {
            // daily time range
            // start time is 12am today
            // end time is now
            const startTime = new Date();
            startTime.setHours(0, 0, 0, 0);
            const endTime = new Date();
            const startTimeISO = startTime.toISOString();
            const endTimeISO = endTime.toISOString();

            console.log(
              `Analyzing daily activities: ${startTime} to ${endTime}`
            );
            let tasks: Task[] = [];
            let totalHours = 0;

            const LIMIT = 5;
            let offset = 0;
            let hasMoreData = true;

            while (hasMoreData) {
              console.log(`Fetching data: offset ${offset}, limit ${LIMIT}`);
              const result = await queryScreenpipe({
                start_time: startTimeISO,
                end_time: endTimeISO,
                offset: offset,
                limit: LIMIT,
                content_type: "ocr",
              });

              const chunkContent = result.data
                .map((entry) => JSON.stringify(entry.content))
                .join(" ");

              const classifiedTask = await generateObject({
                model: provider,
                schema: TaskSchema,
                messages: [
                  {
                    role: "system",
                    content: `You are analyzing data from a productivity tool called Screenpipe. It captures screenshots of the user's digital activities throughout the day, including app usage. The tool then uses OCR (Optical Character Recognition) to extract text from these screenshots.

Your task is to classify the following content into a task and topic, considering the context of a worker's typical workday. The content will be text extracted from screenshots, which may include snippets from various applications, websites, or documents the user interacted with.

If you cannot identify a task or topic, set the 'unknown' field to true and other fields to undefined.

Respond with a JSON object containing 'topic' and 'task' fields. Be specific and try to capture the essence of the worker's activity. Note that the OCR process may sometimes produce errors or incomplete text.

Examples of tasks for workers:
{
  "topic": "Web Development",
  "task": "Debugging a React component"
}
{
  "topic": "Client Communication",
  "task": "Reading project feedback emails"
}
{
  "topic": "Graphic Design",
  "task": "Creating logo mockups in Illustrator"
}
{
  "topic": "Content Writing",
  "task": "Researching SEO keywords for a blog post"
}
{
  "topic": "Project Management",
  "task": "Updating Trello board with new tasks"
}

Remember, the goal is to help workers understand their time usage and productivity patterns based on their screen activity.`,
                  },
                  { role: "user", content: chunkContent },
                ],
              });

              const data = result.data.sort((a, b) => {
                return (
                  new Date(a.content.timestamp).getTime() -
                  new Date(b.content.timestamp).getTime()
                );
              });
              // @ts-expect-error
              if (process.env.DEBUG) {
                console.log(
                  `data ${JSON.stringify(data)}`
                );
              }
              const firstResultTime = data[0].content.timestamp;
              const lastResultTime = data[data.length - 1].content.timestamp;
              const task = {
                topic: classifiedTask.object.topic,
                task: classifiedTask.object.task || "unknown",
                startTime: firstResultTime,
                endTime: lastResultTime,
                duration: Math.max(
                  0,
                  new Date(lastResultTime).getTime() -
                    new Date(firstResultTime).getTime()
                ),
              };
              console.log(`task ${JSON.stringify(task)}`);

              tasks.push(task);
              totalHours += task.duration;

              offset += LIMIT;
              hasMoreData = result.data.length === LIMIT;

              console.log(
                `Processed ${offset} entries. More data: ${hasMoreData}`
              );
            }

            const dailyAnalysis: DailyAnalysis = { tasks, totalHours };
            await fs.writeFile(
              `daily_analysis_${new Date()
                .toLocaleDateString("en-US")
                .replace(/\//g, "_")}.json`,
              JSON.stringify(dailyAnalysis, null, 2)
            );
            console.log("Daily analysis saved to daily_analysis.json");
            return dailyAnalysis;
          },
        },
        stream_response: {
          description:
            "Stream the final response to the user. Always use this tool to stream the final response to the user.",
          parameters: z.object({
            response: z
              .string()
              .describe("The final response to stream to the user"),
          }),
          execute: async ({ response }) => {
            console.log("Streaming response to user");
            const { textStream } = await streamText({
              model: provider,
              messages: [
                {
                  role: "user",
                  content: response,
                },
              ],
            });

            for await (const chunk of textStream) {
              // @ts-expect-error
              process.stdout.write(chunk);
            }
            console.log("\nFinished streaming response");
            throw new Error("STREAM_COMPLETE");
          },
        },
      },
      toolChoice: "required",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant specialized in analyzing daily activities for workers.
          This project uses Screenpipe to collect data about the worker's activities throughout the day,
          including app usage, browser activity, and other digital interactions.
          
          Always start by analyzing the data.
          Always use the tool stream_response to stream the final response to the user

          Your task is to process this data and provide meaningful insights about how the worker
          spent their day. You'll analyze the collected data, classify tasks and topics, and generate
          a comprehensive summary of the day's activities.
          
          Key aspects of the project:
          1. Data collection: Uses Screenpipe to gather information about the user's digital activities.
          2. Task classification: Categorizes activities into tasks and topics.
          3. Daily summary: Provides an overview of time spent on different tasks and topics.
          
          Your goal is to help workers understand their time usage and productivity patterns.
          
          Rules:
          - Provide a concise yet informative summary of the worker's day
          - Highlight the main tasks and topics worked on
          - Include the total hours worked
          - Offer insights on time management and productivity if applicable
          - Be objective and data-driven in your analysis
          - Always start by analyzing the data using the tool analyze_daily_activities
          - Always use the tool stream_response to stream the final response to the user`,
        },
        {
          role: "user",
          content: "Analyze my daily activities and provide a summary.",
        },
      ],
      maxToolRoundtrips: 5,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "STREAM_COMPLETE") {
      console.log("Daily tracking completed");
      return;
    }
    throw error;
  }
}

const main = async () => {
  const startTime = new Date();
  console.log(`Starting daily tracker at ${startTime.toISOString()}`);
  await dailyTracker();
  const endTime = new Date();
  console.log(`Daily tracking completed at ${endTime.toISOString()}`);
  console.log(
    `Total execution time: ${endTime.getTime() - startTime.getTime()}ms`
  );
};

main();
