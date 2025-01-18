"use server";
import { promises as fs } from 'fs';
import path from 'path';

export default async function updatePipeConfig(
  redditSettings: any, 
) {

  if (!redditSettings) {
    throw new Error("Reddit settings not found");
  }

  let cronSchedule = "";
  const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
  const pipeConfigPath = path.join(
    screenpipeDir,
    "pipes",
    "reddit-auto-posts",
    "pipe.json"
  );

  if (redditSettings.summaryFrequency === "daily") {
    const [emailHour, emailMinute] = redditSettings.emailTime.split(":").map(Number);
    cronSchedule = `0 ${emailMinute} ${emailHour} * * *`;
  } else if (redditSettings.summaryFrequency.startsWith("hourly:")) {
    const hours = parseInt(redditSettings.summaryFrequency.split(":")[1], 10);
    cronSchedule = `0 0 */${hours} * * *`;
  }

  try {
    const fileContent = await fs.readFile(pipeConfigPath, 'utf-8');
    const configData = JSON.parse(fileContent);

    configData.crons = [
      {
        path: "/api/pipeline",
        schedule: cronSchedule,
      },
    ];

    await fs.writeFile(pipeConfigPath, JSON.stringify(configData, null, 2));
  } catch (error) {
    console.error("Failed to save Reddit settings:", error);
    throw error;
  }
}

