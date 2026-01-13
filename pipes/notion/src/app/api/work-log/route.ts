import { NextResponse } from "next/server";
import { pipe } from "@screenpipe/js";
import { generateWorkLog, deduplicateScreenData } from "@/lib/helpers";
import { NotionClient } from "@/lib/notion/client";
import { settingsStore } from "@/lib/store/settings-store";

const minute = (m: number) => m * 60 * 1000;

export async function GET() {
  try {
    const settings = await settingsStore.loadPipeSettings("notion");

    const aiPreset = settingsStore.getPreset("notion", "aiLogPresetId");

    const pageSize = settings?.pageSize || 500;
    const customPrompt = settings?.prompt;
    const deduplicationEnabled = settings?.deduplicationEnabled ?? false;
    const intervalMinutes = settings?.shortTasksInterval || 5;

    if (!aiPreset) {
      return NextResponse.json(
        { error: "ai preset not selected" },
        { status: 401 },
      );
    }

    if (!settings?.notion?.accessToken || !settings?.notion?.databaseId) {
      return NextResponse.json(
        { error: "notion not configured" },
        { status: 400 },
      );
    }

    const now = new Date();
    const startTime = new Date(now.getTime() - minute(intervalMinutes));

    console.log(
      `fetching screen data from ${startTime.toISOString()} to ${now.toISOString()}`,
    );

    const screenData = await pipe.queryScreenpipe({
      startTime: startTime.toISOString(),
      endTime: now.toISOString(),
      limit: pageSize,
      contentType: "all",
    });

    if (!screenData || screenData.data.length === 0) {
      return NextResponse.json(
        { message: "no screen data found" },
        { status: 404 },
      );
    }

    console.log(`found ${screenData.data.length} screen data items`);

    if (deduplicationEnabled) {
      try {
        screenData.data = await deduplicateScreenData(screenData.data);
        console.log(`after deduplication: ${screenData.data.length} items`);
      } catch (error) {
        console.warn(
          "deduplication failed, continuing with original data:",
          error,
        );
      }
    }

    const logEntry = await generateWorkLog(
      screenData.data,
      aiPreset,
      startTime,
      now,
      customPrompt,
    );

    console.log("work log generated:", logEntry);

    const notionClient = new NotionClient(settings.notion);
    const deepLink = await notionClient.createLog(logEntry);

    return NextResponse.json({
      message: "work log synced successfully",
      logEntry,
      deepLink,
    });
  } catch (error) {
    console.error("error in work log api:", error);
    return NextResponse.json(
      { error: `failed to process work log: ${error}` },
      { status: 500 },
    );
  }
}
