"use server";
import { promises as fs } from "fs";
import path from "path";

export async function updatePipeConfig(interval: number, apiPath: string, schedule: "minute" | "hour" | "day") {
  try {
    const screenpipeDir =
      process.env.SCREENPIPE_DIR ||
      (process.env.HOME && path.join(process.env.HOME, ".screenpipe")) ||
      process.cwd();
    const pipeConfigPath = path.join(
      screenpipeDir,
      "pipes",
      "notion",
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

    // get schedule from schedule
    const scheduleTimer = schedule === "minute" ? `0 */${interval} * * * *` : schedule === "hour" ? `0 0 */${interval} * * *` : `0 0 0 */${interval} * *`;

    config.crons = config.crons.map((cron: any) => cron.path === apiPath ? { ...cron, schedule: scheduleTimer } : cron);

    config.enabled = config.enabled ?? true;
    config.is_nextjs = config.is_nextjs ?? true;

    await fs.writeFile(pipeConfigPath, JSON.stringify(config, null, 2));
    console.log(
      `updated cron schedule to run every ${interval} ${schedule} for ${apiPath}`
    );
  } catch (err) {
    console.error("failed to update cron schedule:", err);
    throw err;
  }
}
