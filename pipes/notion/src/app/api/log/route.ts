import { NextResponse } from "next/server";
import { pipe } from "@screenpipe/js";
import { generateWorkLog, deduplicateScreenData } from "@/lib/helpers";
import { NotionClient } from "@/lib/notion/client";
import { settingsStore } from "@/lib/store/settings-store";

const minute = (min: number) => min * 60 * 1000;

export async function GET() {
  try {
    const settings = await settingsStore.loadPipeSettings("notion");

    const aiPreset = settingsStore.getPreset("notion", "aiLogPresetId");

    const pageSize = settings?.pageSize || 50;
    const customPrompt = settings?.prompt;
    const deduplicationEnabled = settings?.deduplicationEnabled ?? false;

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
    const oneHourAgo = new Date(now.getTime() - minute(1));

    const screenData = await pipe.queryScreenpipe({
      startTime: oneHourAgo.toISOString(),
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

        // Only deduplicate if enabled in settings
    if (deduplicationEnabled) {
          try {
            screenData.data = await deduplicateScreenData(screenData.data);
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
      oneHourAgo,
      now,
      customPrompt,
    );

    console.log(logEntry);

    const notionClient = new NotionClient(settings.notion);
    const deepLink = await notionClient.createLog(logEntry);

    return NextResponse.json({
      message: "work log synced successfully",
      logEntry,
      deepLink: deepLink,
    });
  } catch (error) {
    console.error("error in work log api:", error);
    return NextResponse.json(
      { error: `failed to process work log: ${error}` },
      { status: 500 },
    );
  }
}
