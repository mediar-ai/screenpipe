import * as fs from "fs";
import nodemailer from "nodemailer";
import { queryScreenpipe, loadPipeConfig, ContentItem } from "screenpipe";
import process from "node:process";

interface DailyLog {
  activity: string;
  category: string;
  tags: string[];
  timestamp: string;
}

async function generateDailyLog(
  screenData: ContentItem[],
  dailylogPrompt: string,
  gptModel: string,
  gptApiUrl: string,
  openaiApiKey: string
): Promise<DailyLog> {
  const prompt = `${dailylogPrompt}

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

  const response = await fetch(gptApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: gptModel,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    console.log("gpt response:", await response.text());
    throw new Error(`http error! status: ${response.status}`);
  }

  const result = await response.json();

  console.log("ai answer:", result);
  // clean up the result
  const cleanedResult = result.choices[0].message.content
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "") // remove start and end code block markers
    .replace(/\n/g, "") // remove newlines
    .replace(/\\n/g, "") // remove escaped newlines
    .trim(); // trim any remaining whitespace

  let content;
  try {
    content = JSON.parse(cleanedResult);
  } catch (error) {
    console.warn("failed to parse ai response:", error);
    console.warn("cleaned result:", cleanedResult);
    throw new Error("invalid ai response format");
  }

  return content;
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

function generateRedditLinks(content: string): string {
  const posts = content.split(/\[\d+\]/g).filter(Boolean);
  let result = "";

  posts.forEach((post, index) => {
    const titleMatch = post.match(/\[TITLE\](.*?)\[\/TITLE\]/s);
    const bodyMatch = post.match(/\[BODY\](.*?)\[\/BODY\]/s);
    const subredditsMatch = post.match(/\[r\/.*?\]/g);

    if (titleMatch && bodyMatch && subredditsMatch) {
      const title = titleMatch[1].trim();
      const body = bodyMatch[1].trim();
      const encodedTitle = encodeURIComponent(title);
      const encodedBody = encodeURIComponent(`${title}\n\n${body}`);

      result += `[${index + 1}] ${title}\n\n${body}\n\n`;

      subredditsMatch.forEach((subreddit) => {
        const subredditName = subreddit.slice(2, -1);
        const link = `https://www.reddit.com/r/${subredditName}/submit?title=${encodedTitle}&text=${encodedBody}`;
        result += `${subreddit} <a href="${link}">SEND</a>\n`;
      });

      result += "\n";
    }
  });

  return result.trim();
}

async function generateRedditQuestions(
  screenData: ContentItem[],
  customPrompt: string,
  gptModel: string,
  gptApiUrl: string,
  openaiApiKey: string
): Promise<string> {
  const prompt = `${customPrompt}

  based on the following screen data, generate a list of questions i can ask the reddit community:

  ${JSON.stringify(screenData)}

  rules:
  - be specific and concise
  - return a list of posts, one level bullet list
  - keep the tone casual like you are chatting to friends
  - you can mention some context from the screen data 30% of the time, but don't mention very personal data
  - the list should be enumerated with square brackets like [1], [2], ...
  - each post starts with [TITLE] ... [/TITLE], then [BODY] ... [/BODY],
  - at the end of each post add a list of subreddits to post it in enumerated as [r/...], [r/....], [r/....], ...
  - at the end of each subreddit add "[SEND]"
  `;

  console.log("reddit questions prompt:", prompt);
  const response = await fetch(gptApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: gptModel,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  console.log("reddit questions gpt response:", response);

  if (!response.ok) {
    console.log("gpt response:", await response.text());
    throw new Error(`http error! status: ${response.status}`);
  }

  const result = await response.json();

  console.log("ai reddit questions:", result);

  const content = result.choices[0].message.content;
  return generateRedditLinks(content);
}

async function sendEmail(
  to: string,
  password: string,
  subject: string,
  body: string
): Promise<void> {
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
  const dailylogPrompt = config.dailylogPrompt!;
  const gptModel = config.gptModel;
  const gptApiUrl = config.gptApiUrl;
  const openaiApiKey = config.openaiApiKey;
  const windowName = config.windowName || "";
  const pageSize = config.pageSize;
  const contentType = config.contentType || "ocr"; // Default to 'ocr' if not specified

  console.log("creating logs dir");
  const logsDir = `${process.env.PIPE_DIR}/logs`;
  console.log("logs dir:", logsDir);
  try {
    fs.mkdirSync(logsDir);
  } catch (_error) {
    console.warn("failed to create logs dir, probably already exists");
  }

  let lastEmailSent = new Date(0); // Initialize to a past date

  // send a welcome email to announce what will happen, when it will happen, and what it will do
  const welcomeEmail = `
    Welcome to the daily reddit questions pipeline!

    This pipe will send you a daily list of reddit questions based on your screen data.
    ${
      summaryFrequency === "daily"
        ? `It will run at ${emailTime} every day.`
        : `It will run every ${summaryFrequency} hours.`
    }
    
  `;
  await sendEmail(
    emailAddress,
    emailPassword,
    "daily reddit questions",
    welcomeEmail
  );

  while (true) {
    try {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - interval);

      const screenData = await queryScreenpipe({
        startTime: oneMinuteAgo.toISOString(),
        endTime: now.toISOString(),
        windowName: windowName,
        limit: pageSize,
        contentType: contentType,
      });

      if (screenData && screenData.data && screenData.data.length > 0) {
        const logEntry = await generateDailyLog(
          screenData.data,
          dailylogPrompt, // Use dailylogPrompt here instead of customPrompt
          gptModel,
          gptApiUrl,
          openaiApiKey
        );
        console.log("log entry:", logEntry);
        await saveDailyLog(logEntry);
      }

      let shouldSendSummary = false;

      if (summaryFrequency === "daily") {
        const [emailHour, emailMinute] = emailTime.split(":").map(Number);
        const emailTimeToday = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          emailHour,
          emailMinute
        );
        shouldSendSummary =
          now >= emailTimeToday &&
          now.getTime() - lastEmailSent.getTime() > 24 * 60 * 60 * 1000;
      } else if (summaryFrequency.startsWith("hourly:")) {
        const hours = parseInt(summaryFrequency.split(":")[1], 10);
        shouldSendSummary =
          now.getTime() - lastEmailSent.getTime() >= hours * 60 * 60 * 1000;
      }

      if (shouldSendSummary) {
        const screenData = await queryScreenpipe({
          startTime: oneMinuteAgo.toISOString(),
          endTime: now.toISOString(),
          windowName: windowName,
          limit: pageSize,
          contentType: contentType,
        });

        if (screenData && screenData.data && screenData.data.length > 0) {
          const redditQuestions = await generateRedditQuestions(
            screenData.data,
            customPrompt,
            gptModel,
            gptApiUrl,
            openaiApiKey
          );
          console.log("reddit questions:", redditQuestions);
          await sendEmail(
            emailAddress,
            emailPassword,
            "reddit questions",
            redditQuestions
          );
          lastEmailSent = now;
        }
      }
    } catch (error) {
      console.warn("error in daily log pipeline:", error);
    }
    console.log("sleeping for", interval, "ms");
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

dailyLogPipeline();
