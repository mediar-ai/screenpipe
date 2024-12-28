"use server";
import { promises as fs } from 'fs';
import path from 'path';

export default async function updatePipeConfig(
  redditSettings: any, 
  aiUrl: string,
  aiModel: string,
  openaiApiKey: string,
) {

  if (!redditSettings) {
    throw new Error("Reddit settings not found");
  }

  const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
  const pipeConfigPath = path.join(
    screenpipeDir,
    "pipes",
    "reddit_auto_posts",
    "pipe.json"
  );

  const configData = {
    ...redditSettings,
    aiUrl,
    aiModel,
    openaiApiKey,
    crons: [
      {
        path: "/api/logpipeline",
        schedule: `0 */${redditSettings?.interval / 60} * * * *`,
      },
    ]
  };

  try {
    await fs.writeFile(pipeConfigPath, JSON.stringify(configData, null, 2));
    console.log("Reddit settings saved to", pipeConfigPath);
  } catch (error) {
    console.error("Failed to save Reddit settings:", error);
    throw error;
  }
}

