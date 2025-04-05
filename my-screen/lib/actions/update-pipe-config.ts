"use server";
import { promises as fs } from "fs";
import path from "path";

export async function updatePipeConfig(intervalMinutes: number) {
  try {
    const screenpipeDir =
      process.env.SCREENPIPE_DIR ||
      (process.env.HOME && path.join(process.env.HOME, ".screenpipe")) ||
      process.cwd();
    const pipeConfigPath = path.join(
      screenpipeDir,
      "pipes",
      "example-pipe",
      "pipe.json"
    );

    console.log(`updating cron schedule at: ${pipeConfigPath}`);

    // Load or initialize both configs
    let config: any = {};

    try {
      const content = await fs.readFile(pipeConfigPath, "utf8");
      config = JSON.parse(content);
    } catch (err) {
      console.log(
        `no existing config found, creating new one at ${pipeConfigPath}`
      );
      config = { crons: [] };
    }

    // Update cron config
    config.crons = [
      {
        path: "/api/log",
        schedule: `0 */${intervalMinutes} * * * *`,
      },
      {
        path: "/api/intelligence",
        schedule: "0 0 */1 * * *",
      },
    ];
    config.enabled = config.enabled ?? true;
    config.is_nextjs = config.is_nextjs ?? true;

    await fs.writeFile(pipeConfigPath, JSON.stringify(config, null, 2));
    console.log(
      `updated cron schedule to run every ${intervalMinutes} minutes`
    );
  } catch (err) {
    console.error("failed to update cron schedule:", err);
    throw err;
  }
}
