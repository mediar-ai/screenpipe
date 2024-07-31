// npx ts-node dailyLogger.ts

import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";

// const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
// const OPENAI_MODEL = "gpt-4o";
// Uncomment the following lines to use Ollama instead
const OPENAI_API_URL = "http://localhost:11434/api/chat";
const OPENAI_MODEL = "llama3.1";

const SCREENPIPE_API_URL = "http://localhost:3030/search";
const LOG_INTERVAL = 1 * 60 * 1000; // 5 minutes in milliseconds

interface ActivityLog {
  startTime: string;
  endTime: string;
  content: string;
}

async function getOpenAIKey(): Promise<string> {
  const secretsPath = path.join(process.env.HOME || "", "secrets.json");
  try {
    const secrets = JSON.parse(await fs.readFile(secretsPath, "utf-8"));
    return secrets.OPENAI_API_KEY;
  } catch (error) {
    return process.env.OPENAI_API_KEY!;
  }
}

async function queryScreenpipe(
  startTime: string,
  endTime: string
): Promise<string> {
  const url = `${SCREENPIPE_API_URL}?start_time=${startTime}&end_time=${endTime}&limit=100&content_type=ocr`;
  console.log("Querying Screenpipe:", url);
  const response = await fetch(url);
  const data = await response.json();
  return JSON.stringify(data);
}

async function generateLogEntry(
  prompt: string,
  data: string
): Promise<ActivityLog> {
  const openAIKey = await getOpenAIKey();
  console.log("Generating log entry...");
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAIKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      stream: false,
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that creates concise and informative log entries based on a person's daily activities. Focus on the aspects the user wants to track.

            Rules:
            - YOUR LOGS ARE BASED ON THE DATA YOU RECEIVE WHICH IS THE SCREEN TEXT & AUDIO TRANSCRIPTIONS FROM THE USER COMPUTER
            - Do not use '"' around your response
            - Date & time now is ${new Date().toISOString()}
            - Use short title with max 4 words
            - Be concise in the content, if you can use bullet list with times if necessary
            - YOUR MESSAGES ARE LESS THAN 4 LINES LONG

            Example of your answer:

            ### 073024 - 9.05 AM - 9.10 AM - Emails & LinkedIn
            - 3 min: Scrolled emails 
            - 2 min: Opened LinkedIn and scrolled posts
            `,
        },
        {
          role: "user",
          content: `Based on the following data and keeping in mind the user wants to track ${prompt}, create a short log entry with a title and content. Data: ${data}
          
          
          AGAIN you are returning ONLY daily log of what the user do, plus tailored to his prompt. Example of your answer:
          

          ### 073024 - 9.05 AM - 9.10 AM - Emails & LinkedIn
          - 3 min: Scrolled emails 
          - 2 min: Opened LinkedIn and scrolled posts


          This is just an example do not copy this in your answer

          Rules:
          - YOUR LOGS ARE BASED ON THE DATA YOU RECEIVE WHICH IS THE SCREEN TEXT & AUDIO TRANSCRIPTIONS FROM THE USER COMPUTER
          - Do not use '"' around your response
          - Date & time now is ${new Date().toISOString()}
          - Use short title with max 4 words
          - Be concise in the content, if you can use bullet list with times if necessary
          - Despite conciseness, try not to skip important information
          - Try to add specifics like "browse twitter" etc.
          - YOUR MESSAGES ARE LESS THAN 4 LINES LONG
          - Make sure to add times in your message 
          - Do not copy exactly the example I gave you, base your answer on what the user is doing

          Log?`,
        },
      ],
    }),
  });

  const result: any = await response.json();
  // if error console log and throw
  if (result.error) {
    console.error("Error generating log entry:", result.error);
    throw new Error(result);
  }
  // phi3 models are drunk af thats why
  const log =
    result.choices?.[0]?.message?.content ||
    // ollama not respecting openai api
    result.message?.content;

  console.log("Log entry generated:", log);

  return {
    startTime: new Date(Date.now() - LOG_INTERVAL).toISOString(),
    endTime: new Date().toISOString(),
    content: log,
  };
}

async function appendToLogFile(log: ActivityLog): Promise<void> {
  const date = new Date().toISOString().split("T")[0];
  const fileName = `daily_log_${date}.md`;
  const logEntry = log.content + "\n\n";

  await fs.appendFile(fileName, logEntry);
}

async function startLogging(trackingPrompt: string): Promise<void> {
  console.log(`Starting to log activities. Tracking: ${trackingPrompt}`);

  setInterval(async () => {
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - LOG_INTERVAL).toISOString();

    try {
      const screenpipeData = await queryScreenpipe(startTime, endTime);
      const logEntry = await generateLogEntry(trackingPrompt, screenpipeData);
      await appendToLogFile(logEntry);
      console.log(`Log entry added`);
    } catch (error) {
      console.error("Error generating log entry:", error);
    }
  }, LOG_INTERVAL);
}

// Main execution
(async () => {
  const trackingPrompt = await new Promise<string>((resolve) => {
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    readline.question(
      "What aspects of your day do you want to track? ",
      (answer: string) => {
        readline.close();
        resolve(answer);
      }
    );
  });

  await startLogging(trackingPrompt);
})();

// npx tsx main.ts
