interface ScreenData {
  data: {
    content: {
      timestamp: string;
      text: string;
    };
  }[];
}

interface DailyLog {
  activity: string;
  category: string;
  tags: string[];
  timestamp: string;
}

function encodeQueryData(data: Record<string, string>): string {
  return Object.keys(data)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
    .join("&");
}

async function queryScreenpipe(
  startTime: string,
  endTime: string,
  windowName: string,
  pageSize: number
): Promise<ScreenData> {
  try {
    const params: Record<string, string> = {
      content_type: "ocr",
      limit: pageSize.toString(),
      offset: "0",
      start_time: startTime,
      end_time: endTime,
    };

    if (windowName) {
      params.window_name = windowName;
    }

    const queryString = encodeQueryData(params);
    const url = `http://localhost:3030/search?${queryString}`;
    console.log("query url:", url);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`http error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("error querying screenpipe:", error);
    return { data: [] };
  }
}

async function generateDailyLog(
  screenData: ScreenData,
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
    console.error("failed to parse ai response:", error);
    console.error("cleaned result:", cleanedResult);
    throw new Error("invalid ai response format");
  }

  return content;
}

async function saveDailyLog(logEntry: DailyLog): Promise<void> {
  const logsDir = `${process.env.PIPE_DIR}/logs`;
  fs.mkdirSync(logsDir);
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "");
  const filename = `${timestamp}-${logEntry.category.replace("/", "-")}.json`;
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
  const logsDir = `${process.env.PIPE_DIR}/logs`;
  const today = new Date().toISOString().split("T")[0]; // Get today's date in YYYY-MM-DD format

  const files = fs.readdirSync(logsDir);
  const todayFiles = files.filter((file) => file.startsWith(today));

  const logs: DailyLog[] = [];
  for (const file of todayFiles) {
    const content = fs.readFileSync(`${logsDir}/${file}`);
    logs.push(JSON.parse(content));
  }

  return logs;
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

  let lastEmailSent = new Date(0); // Initialize to a past date

  // send a welcome email to announce what will happen, when it will happen, and what it will do
  const welcomeEmail = `
    Welcome to the daily log pipeline!

    This pipe will send you a daily summary of your activities.
    It will run at ${emailTime} every day.
    
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

      const screenData = await queryScreenpipe(
        oneMinuteAgo.toISOString(),
        now.toISOString(),
        windowName,
        pageSize
      );

      if (screenData.data && screenData.data.length > 0) {
        const logEntry = await generateDailyLog(
          screenData,
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
        await retry(async () => {
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
          }
        });

        lastEmailSent = now;
      }
    } catch (error) {
      console.error("error in daily log pipeline:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

dailyLogPipeline();
