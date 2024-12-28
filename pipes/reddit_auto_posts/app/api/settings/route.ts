import { pipe } from "@screenpipe/js/node";
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_INTERVAL_MINUTES = 5;

async function updateCronSchedule(intervalMinutes: number) {
  try {
    const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
    const pipeConfigPath = path.join(
      screenpipeDir,
      "pipes",
      "reddit_auto_posts",
      "pipe.json"
    );
    const settingsPath = path.join(
      screenpipeDir,
      "pipes",
      "reddit_auto_posts",
      "settings.json"
    );

    console.log(`updating cron schedule at: ${pipeConfigPath}`);

    // Load or initialize both configs
    let config: any = {};
    let settings: any = {};

    try {
      const content = await fs.readFile(pipeConfigPath, "utf8");
      config = JSON.parse(content);
    } catch (err) {
      console.log(
        `no existing config found, creating new one at ${pipeConfigPath}`
      );
      config = { crons: [] };
    }

    try {
      const settingsContent = await fs.readFile(settingsPath, "utf8");
      settings = JSON.parse(settingsContent);
    } catch (err) {
      console.log(
        `no existing settings found, creating new one at ${settingsPath}`
      );
      settings = { interval: intervalMinutes * 60000 };
    }

    // Update settings
    settings.interval = intervalMinutes * 60000;
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

    // Update cron config
    config.crons = [
      {
        path: "/api/logpipeline",
        schedule: `0 */${intervalMinutes} * * * *`,
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

export async function GET() {
  try {
    const settingsManager = pipe.settings;
    if (!settingsManager) {
      throw new Error("settingsManager not found");
    }

    // Load persisted settings if they exist
    const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
    const settingsPath = path.join(
      screenpipeDir,
      "pipes",
      "reddit_auto_posts",
      "settings.json"
    );

    try {
      const settingsContent = await fs.readFile(settingsPath, "utf8");
      const persistedSettings = JSON.parse(settingsContent);

      // Merge with current settings
      const rawSettings = await settingsManager.getAll();
      return NextResponse.json({
        ...rawSettings,
        customSettings: {
          ...rawSettings.customSettings,
          reddit_auto_posts: {
            ...(rawSettings.customSettings?.reddit_auto_posts || {}),
            ...persistedSettings,
          },
        },
      });
    } catch (err) {
      // If no persisted settings, return normal settings
      const rawSettings = await settingsManager.getAll();
      return NextResponse.json(rawSettings);
    }
  } catch (error) {
    console.error("failed to get settings:", error);
    return NextResponse.json(
      { error: "failed to get settings" },
      { status: 500 }
    );
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

    if (namespace === "reddit_auto_posts" && isPartialUpdate) {
      const intervalMs = value.interval || DEFAULT_INTERVAL_MINUTES * 60000;
      const intervalMinutes = Math.max(1, Math.floor(intervalMs / 60000));
      await updateCronSchedule(intervalMinutes);
      console.log(`setting interval to ${intervalMinutes} minutes`);
    }

    if (reset) {
      if (namespace) {
        if (key) {
          await settingsManager.setCustomSetting(namespace, key, undefined);
        } else {
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

