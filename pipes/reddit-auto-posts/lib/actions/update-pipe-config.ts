"use server";
import { promises as fs } from 'fs';
import path from 'path';

export default async function updatePipeConfig(
  redditSettings: any, 
) {

  if (!redditSettings) {
    throw new Error("Reddit settings not found");
  }

  const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
  const pipeConfigPath = path.join(
    screenpipeDir,
    "pipes",
    "reddit-auto-posts",
    "pipe.json"
  );

  try {
    const fileContent = await fs.readFile(pipeConfigPath, 'utf-8');
    const configData = JSON.parse(fileContent);

    configData.crons = [
      {
        path: "/api/pipeline",
        schedule: `0 */${redditSettings?.interval / 60} * * * *`,
      },
    ];

    await fs.writeFile(pipeConfigPath, JSON.stringify(configData, null, 2));
  } catch (error) {
    console.error("Failed to save Reddit settings:", error);
    throw error;
  }
}

