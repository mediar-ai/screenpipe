import * as fs from "node:fs";
import { queryScreenpipe, loadPipeConfig, ContentItem, pipe } from "@screenpipe/js";
import fetch from "node-fetch";
import process from "node:process";

async function triggerGumloopFlow(
  gumloopApiToken: string,
  userId: string,
  flowId: string,
  prompt: string,
  screenData: ContentItem[]
): Promise<void> {
  const url = 'https://api.gumloop.com/api/v1/start_pipeline';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${gumloopApiToken}`,
  };

  const data = {
    user_id: userId,
    saved_item_id: flowId,
    pipeline_inputs: [
      { input_name: 'prompt', value: prompt },
      { input_name: 'screen_data', value: JSON.stringify(screenData) }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(data),
  });

  const result = await response.json();
  console.log(`Gumloop flow triggered with response: ${JSON.stringify(result)}`);
}

async function dailyGumloopPipeline(): Promise<void> {
  console.log("Starting Gumloop flow execution");

  const config = await loadPipeConfig();
  const interval = config.interval * 1000;
  const customPrompt = config.customPrompt;
  const gumloopApiToken = config.gumloopApiToken;
  const userId = config.userId;
  const flowId = config.flowId;
  const windowName = config.windowName || "";
  const appName = config.appName || "";
  const pageSize = config.pageSize;
  const contentType = config.contentType || "ocr";

  pipe.scheduler
    .task("triggerGumloopFlow")
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
        await triggerGumloopFlow(gumloopApiToken, userId, flowId, customPrompt, screenData.data);
      }
    });

  if (config.Frequency === "daily") {
    const [flowHour, flowMinute] = config.flowTime.split(":").map(Number);
    pipe.scheduler
      .task("triggerDailyGumloopFlow")
      .every("1 day")
      .at(`${flowHour}:${flowMinute}`)
      .do(async () => {
        const todayLogs = getTodayLogs();
        if (todayLogs.length > 0) {
          await triggerGumloopFlow(gumloopApiToken, userId, flowId, customPrompt, todayLogs);
        }
      });
  } else if (config.Frequency.startsWith("hourly:")) {
    const hours = parseInt(config.Frequency.split(":")[1], 10);
    pipe.scheduler
      .task("triggerHourlyGumloopFlow")
      .every(`${hours} hours`)
      .do(async () => {
        const todayLogs = getTodayLogs();
        if (todayLogs.length > 0) {
          await triggerGumloopFlow(gumloopApiToken, userId, flowId, customPrompt, todayLogs);
        }
      });
  }
}

function getTodayLogs(): ContentItem[] {
  const logsDir = `${process.env.PIPE_DIR}/logs`;
  const today = new Date().toISOString().replace(/:/g, "-").split("T")[0];
  const files = fs.readdirSync(logsDir);
  const todayFiles = files.filter(file => file.startsWith(today));
  const logs: ContentItem[] = [];
  for (const file of todayFiles) {
    const content = fs.readFileSync(`${logsDir}/${file}`, "utf8");
    logs.push(JSON.parse(content));
  }
  return logs;
}

dailyGumloopPipeline();
