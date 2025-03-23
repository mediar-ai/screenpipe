import { pipe } from "@screenpipe/js";
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settingsManager = pipe.settings;
    if (!settingsManager) {
      throw new Error("settingsManager not found");
    }

    // Get the pipe name from the current file path
    const currentFilePath = __filename;
    const pipesIndex = currentFilePath.indexOf('pipes');
    const pipeName = currentFilePath.substring(pipesIndex + 6).split(path.sep)[0];
    
    console.log(`loading settings for pipe: ${pipeName}`);

    // Load persisted settings if they exist
    const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
    const settingsPath = path.join(
      screenpipeDir,
      "pipes",
      pipeName,
      "pipe.json"
    );

    try {
      const settingsContent = await fs.readFile(settingsPath, "utf8");
      const persistedSettings = JSON.parse(settingsContent);
      console.log(`loaded persisted settings from ${settingsPath}`);

      // Merge with current settings
      const rawSettings = await settingsManager.getAll();
      return NextResponse.json({
        ...rawSettings,
        customSettings: {
          ...rawSettings.customSettings,
          [pipeName]: {
            ...(rawSettings.customSettings?.[pipeName] || {}),
            ...persistedSettings,
          },
        },
      });
    } catch (err) {
      // If no persisted settings, return normal settings
      console.log(`no persisted settings found at ${settingsPath}, using defaults`);
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

