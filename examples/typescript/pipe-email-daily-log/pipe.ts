interface DailyLog {
  activity: string;
  category: string;
  tags: string[];
  timestamp: string;
}

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

  const response = await fetch(ollamaApiUrl + "/chat", {
    method: "POST",
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

  console.log("ai answer:", result);
  // clean up the result
  const cleanedResult = result.message.content
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

async function saveDailyLog(logEntry: DailyLog): Promise<void> {
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
  await fs.writeFile(
    `${logsDir}/${filename}`,
    JSON.stringify(logEntry, null, 2)
  );
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
  const response = await fetch(ollamaApiUrl + "/chat", {
    method: "POST",
    body: JSON.stringify({
      model: ollamaModel,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });
  console.log("daily summary ollama response:", response);

  if (!response.ok) {
    console.log("ollama response:", await response.text());
    throw new Error(`http error! status: ${response.status}`);
  }

  const result = await response.json();

  console.log("ai summary:", result);

  return result.message.content;
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
  const from = to; // assuming the sender is the same as the recipient
  await retry(async () => {
    const result = await pipe.sendEmail({
      to,
      from,
      password,
      subject,
      body,
    });
    if (!result) {
      throw new Error("failed to send email");
    }
    console.log(`email sent to ${to} with subject: ${subject}`);
  });
}

async function getTodayLogs(): Promise<DailyLog[]> {
  try {
    const logsDir = `${process.env.PIPE_DIR}/logs`;
    const today = new Date().toISOString().replace(/:/g, "-").split("T")[0]; // Get today's date in YYYY-MM-DD format

    console.log("reading logs dir:", logsDir);
    const files = await fs.readdir(logsDir);
    console.log("files:", files);
    const todayFiles = files.filter((file) => file.startsWith(today));
    console.log("today's files:", todayFiles);

    const logs: DailyLog[] = [];
    for (const file of todayFiles) {
      const content = await fs.readFile(`${logsDir}/${file}`);
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

  const config = await pipe.loadConfig();
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
  const pageSize = config.pageSize;
  const contentType = config.contentType || "ocr"; // Default to 'ocr' if not specified

  console.log("creating logs dir");
  const logsDir = `${process.env.PIPE_DIR}/logs`;
  console.log("logs dir:", logsDir);
  await fs.mkdir(logsDir).catch((error) => {
    console.warn("error creating logs dir:", error);
  });

  let lastEmailSent = new Date(0); // Initialize to a past date

  // send a welcome email to announce what will happen, when it will happen, and what it will do
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

  while (true) {
    try {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - interval);

      const screenData = await pipe.queryScreenpipe({
        start_time: oneMinuteAgo.toISOString(),
        end_time: now.toISOString(),
        window_name: windowName,
        limit: pageSize,
        content_type: contentType,
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
        // await retry(async () => {
        const todayLogs = await getTodayLogs();
        console.log("today's logs:", todayLogs);

        if (todayLogs.length > 0) {
          const summary = await generateDailySummary(
            todayLogs,
            summaryPrompt,
            ollamaModel,
            ollamaApiUrl
          );
          console.log("summary:", summary);
          await sendEmail(
            emailAddress,
            emailPassword,
            "activity summary",
            summary
          );
          lastEmailSent = now;
        }
        // });
      }
    } catch (error) {
      console.warn("error in daily log pipeline:", error);
    }
    console.log("sleeping for", interval, "ms");
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

dailyLogPipeline();
