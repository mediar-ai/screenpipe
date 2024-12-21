// app/api/settings/route.ts
import { pipe } from "@screenpipe/js/node";
import { NextResponse } from "next/server";
import type { Settings } from "@screenpipe/js";
import { promises as fs } from "fs";
import path from "path";
// Force Node.js runtime
export const runtime = "nodejs"; // Add this line
export const dynamic = "force-dynamic";

async function updateCronSchedule(intervalMinutes: number) {
  try {
    // Get the .screenpipe base directory from the environment or use a default
    const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
    const pipeConfigPath = path.join(
      screenpipeDir,
      "pipes",
      "obsidian",
      "pipe.json"
    );

    console.log(`updating cron schedule at: ${pipeConfigPath}`);

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

    // Update or add the cron schedule
    config.crons = [
      {
        path: "/api/log",
        schedule: `0 */${intervalMinutes} * * * *`,
      },
    ];

    // Preserve other existing properties
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

export async function GET() {
  const defaultSettings: Settings = {
    openaiApiKey: "",
    deepgramApiKey: "",
    aiModel: "gpt-4",
    aiUrl: "https://api.openai.com/v1",
    customPrompt: "",
    port: 3030,
    dataDir: "default",
    disableAudio: false,
    ignoredWindows: [],
    includedWindows: [],
    aiProviderType: "openai",
    embeddedLLM: {
      enabled: false,
      model: "llama3.2:1b-instruct-q4_K_M",
      port: 11438,
    },
    enableFrameCache: true,
    enableUiMonitoring: false,
    aiMaxContextChars: 128000,
    user: {
      token: "",
    },
  };

  try {
    const settingsManager = pipe.settings;
    if (!settingsManager) {
      throw new Error("settingsManager not found");
    }
    const rawSettings = await settingsManager.getAll();
    return NextResponse.json(rawSettings);
  } catch (error) {
    console.error("failed to get settings:", error);
    return NextResponse.json(defaultSettings);
  }
}

export async function PUT(request: Request) {
  try {
    const settingsManager = pipe.settings;
    if (!settingsManager) {
      throw new Error("settingsManager not found");
    }

    const body = await request.json();
    const { key, value, isPartialUpdate, reset, namespace } = body;

    // Handle obsidian namespace updates
    if (namespace === "obsidian" && isPartialUpdate && value.interval) {
      // Convert interval from milliseconds to minutes, ensure it's at least 1
      const intervalMinutes = Math.max(1, Math.floor(value.interval / 60000));
      await updateCronSchedule(intervalMinutes);
      console.log(`setting interval to ${intervalMinutes} minutes`);
    }

    if (reset) {
      if (namespace) {
        if (key) {
          // Reset single key in namespace
          await settingsManager.setCustomSetting(namespace, key, undefined);
        } else {
          // Reset entire namespace
          await settingsManager.updateNamespaceSettings(namespace, {});
        }
      } else {
        if (key) {
          await settingsManager.resetKey(key);
        } else {
          await settingsManager.reset();
        }
      }
      return NextResponse.json({ success: true });
    }

    if (namespace) {
      if (isPartialUpdate) {
        const currentSettings =
          (await settingsManager.getNamespaceSettings(namespace)) || {};
        await settingsManager.updateNamespaceSettings(namespace, {
          ...currentSettings,
          ...value,
        });
      } else {
        await settingsManager.setCustomSetting(namespace, key, value);
      }
    } else if (isPartialUpdate) {
      const serializedSettings = JSON.parse(JSON.stringify(value));
      await settingsManager.update(serializedSettings);
    } else {
      const serializedValue = JSON.parse(JSON.stringify(value));
      await settingsManager.set(key, serializedValue);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("failed to update settings:", error);
    return NextResponse.json(
      { error: "failed to update settings" },
      { status: 500 }
    );
  }
}
