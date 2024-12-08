import * as fs from "node:fs";
import nodemailer from "nodemailer";
import { queryScreenpipe, loadPipeConfig, ContentItem, pipe } from "@screenpipe/js";
import process from "node:process";
import { z } from "zod";
import { generateObject, generateText } from "ai";
import { createOllama } from "ollama-ai-provider";

interface DailyLog {
  activity: string;
  category: string;
  tags: string[];
  timestamp: string;
}

const dailyLog = z.object({
  activity: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
});

async function generateDailyLog(
  screenData: ContentItem[],
  customPrompt: string,
  ollamaModel: string,
  ollamaApiUrl: string
): Promise<DailyLog> {
  const prompt = `${customPrompt}

    Based on the following screen data, generate a concise daily log entry:

    ${JSON.stringify(screenData)}

    Return a JSON object with the following structure:
    {
        "activity": "Brief description of the activity",
        "category": "Category of the activity like work, email, slack, etc"
        "tags": ["productivity", "work", "email", "john", "salesforce", "etc"]
    }
        
    
    Rules:
    - Do not add backticks to the JSON eg \`\`\`json\`\`\` is WRONG
    - DO NOT RETURN ANYTHING BUT JSON. NO COMMENTS BELOW THE JSON.
        
    `;

  const provider = createOllama({ baseURL: ollamaApiUrl });

  const response = await generateObject({
    model: provider(ollamaModel),
    messages: [{ role: "user", content: prompt }],
    schema: dailyLog,
  });

  console.log("ai answer:", response);

  const result = response.object as DailyLog;
  result.timestamp = new Date().toISOString();

  return result;
}

function saveDailyLog(logEntry: DailyLog): void {
  console.log("creating logs dir");
  const logsDir = `${process.env.PIPE_DIR}/logs`;
  console.log("logs dir:", logsDir);
  console.log("saving log entry:", logEntry);
  console.log("logs dir:", logsDir);
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "");
  const filename = `${timestamp}-${logEntry.category.replace("/", "-")}.json`;
  console.log("filename:", filename);
  fs.writeFileSync(`${logsDir}/${filename}`, JSON.stringify(logEntry, null, 2));
}

async function generateDailySummary(
  logs: DailyLog[],
  customPrompt: string,
  ollamaModel: string,
  ollamaApiUrl: string
): Promise<string> {
  // if logs is more than 30000 characters, truncate it
  let truncatedLogs = logs;
  if (logs.length > 30000) {
    // HACK!
    truncatedLogs = logs.slice(0, 30000);
  }

  const prompt = `${customPrompt}

    Based on the following daily logs, generate a concise summary of the day's activities:

    ${JSON.stringify(truncatedLogs)}

    Provide a human-readable summary that highlights key activities and insights.`;

  console.log("daily summary prompt:", prompt);
  const provider = createOllama({ baseURL: ollamaApiUrl });
  const response = await generateText({
    model: provider(ollamaModel),
    messages: [{ role: "user", content: prompt }],
  });
  console.log("daily summary ollama response:", response);

  return response.text;
}

async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 3000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      console.log(`attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("this should never happen");
}

async function sendEmail(
  to: string,
  password: string,
  subject: string,
  body: string
): Promise<void> {
  await retry(async () => {
    // Create a transporter using SMTP
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", // Replace with your SMTP server
      port: 587,
      secure: false, // Use TLS
      auth: {
        user: to, // assuming the sender is the same as the recipient
        pass: password,
      },
    });

    // Send mail with defined transport object
    const info = await transporter.sendMail({
      from: to, // sender address
      to: to, // list of receivers
      subject: subject, // Subject line
      text: body, // plain text body
    });

    if (!info) {
      throw new Error("failed to send email");
    }
    console.log(`email sent to ${to} with subject: ${subject}`);
  });
}

function getTodayLogs(): DailyLog[] {
  try {
    const logsDir = `${process.env.PIPE_DIR}/logs`;
    const today = new Date().toISOString().replace(/:/g, "-").split("T")[0]; // Get today's date in YYYY-MM-DD format

    console.log("reading logs dir:", logsDir);
    const files = fs.readdirSync(logsDir);
    console.log("files:", files);
    const todayFiles = files.filter((file) => file.startsWith(today));
    console.log("today's files:", todayFiles);

    const logs: DailyLog[] = [];
    for (const file of todayFiles) {
      const content = fs.readFileSync(`${logsDir}/${file}`, "utf8");
      logs.push(JSON.parse(content));
    }

    return logs;
  } catch (error) {
    console.warn("error getting today's logs:", error);
    return [];
  }
}

async function dailyLogPipeline(): Promise<void> {
  console.log("starting daily log pipeline");

  const config = await loadPipeConfig();
  console.log("loaded config:", JSON.stringify(config, null, 2));

  const interval = config.interval * 1000;
  const summaryFrequency = config.summaryFrequency;
  const emailTime = config.emailTime;
  const emailAddress = config.emailAddress;
  const emailPassword = config.emailPassword;
  const customPrompt = config.customPrompt!;
  const summaryPrompt = config.summaryPrompt!;
  const ollamaModel = config.ollamaModel;
  const ollamaApiUrl = config.ollamaApiUrl;
  const windowName = config.windowName || "";
  const appName = config.appName || "";
  const pageSize = config.pageSize;
  const contentType = config.contentType || "ocr";

  console.log("creating logs dir");
  const logsDir = `${process.env.PIPE_DIR}/logs`;
  console.log("logs dir:", logsDir);
  try {
    fs.mkdirSync(logsDir);
  } catch (_error) {
    console.warn("error creating logs dir, probably already exists");
  }

  let lastEmailSent = new Date(0);

  // Send welcome email
  const welcomeEmail = `
    Welcome to the daily log pipeline!

    This pipe will send you a daily summary of your activities.
    ${
      summaryFrequency === "daily"
        ? `It will run at ${emailTime} every day.`
        : `It will run every ${summaryFrequency} hours.`
    }
  `;
  await sendEmail(
    emailAddress,
    emailPassword,
    "daily activity summary",
    welcomeEmail
  );

  await pipe.inbox.send({
    title: "Daily Log Started",
    body: "A new day of activity logging has begun. Your summary will be sent later as scheduled.",
  });

  // Schedule regular log generation
  pipe.scheduler
    .task("generateLog")
    .every(interval)
    .do(async () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - interval);

      const screenData = await queryScreenpipe({
        startTime: oneMinuteAgo.toISOString(),
        endTime: now.toISOString(),
        windowName: windowName,
        appName: appName,
        limit: pageSize,
        contentType: contentType,
      });

      if (screenData && screenData.data && screenData.data.length > 0) {
        const logEntry = await generateDailyLog(
          screenData.data,
          customPrompt,
          ollamaModel,
          ollamaApiUrl
        );
        console.log("log entry:", logEntry);
        await saveDailyLog(logEntry);
      }
    });

  // Schedule summary generation and email sending
  if (summaryFrequency === "daily") {
    const [emailHour, emailMinute] = emailTime.split(":").map(Number);
    pipe.scheduler
      .task("dailySummary")
      .every("1 day")
      .at(`${emailHour}:${emailMinute}`)
      .do(async () => {
        await generateAndSendSummary();
      });
  } else if (summaryFrequency.startsWith("hourly:")) {
    const hours = parseInt(summaryFrequency.split(":")[1], 10);
    pipe.scheduler
      .task("hourlySummary")
      .every(`${hours} hours`)
      .do(async () => {
        await generateAndSendSummary();
      });
  }

  async function generateAndSendSummary() {
    const todayLogs = getTodayLogs();
    console.log("today's logs:", todayLogs);

    if (todayLogs.length > 0) {
      const summary = await generateDailySummary(
        todayLogs,
        summaryPrompt,
        ollamaModel,
        ollamaApiUrl
      );
      console.log("summary:", summary);

      // Send email
      await sendEmail(
        emailAddress,
        emailPassword,
        "Daily Activity Summary",
        summary
      );

      // Send notification to AI inbox
      await pipe.inbox.send({
        title: "Daily Activity Summary",
        body: "Your daily activity summary has been generated and sent to your email.",
      });

      lastEmailSent = new Date();
    } else {
      // Send notification if no logs were found
      await pipe.inbox.send({
        title: "No Activity Logged",
        body: "No activity logs were found for today. Make sure Screenpipe is running and capturing your screen data.",
      });
    }
  }

  // Add a new task to send a daily start notification
  pipe.scheduler
    .task("dailyStartNotification")
    .every("1 day")
    .at("00:01") // Just after midnight
    .do(async () => {
      await pipe.inbox.send({
        title: "Daily Log Started",
        body: "A new day of activity logging has begun. Your summary will be sent later as scheduled.",
        actions: [
          {
            label: "View Yesterday's Summary",
            action: "view_yesterday_summary",
          },
          {
            label: "Dismiss",
            action: "dismiss",
          },
        ],
      });
    });

  // Start the scheduler
  pipe.scheduler.start();
}

dailyLogPipeline();
