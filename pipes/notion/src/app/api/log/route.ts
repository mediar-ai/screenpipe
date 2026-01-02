import { NextResponse } from "next/server";
import { pipe } from "@screenpipe/js";
import { generateDailyReport, deduplicateScreenData } from "@/lib/helpers";
import { NotionClient } from "@/lib/notion/client";
import { settingsStore } from "@/lib/store/settings-store";

const hour = (h: number) => h * 60 * 60 * 1000;

export async function GET() {
  try {
    const settings = await settingsStore.loadPipeSettings("notion");

    const aiPreset = settingsStore.getPreset("notion", "aiLogPresetId");

    const pageSize = settings?.pageSize || 500;
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
    // Get data from the start of today (or last 12 hours for testing)
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    // Use start of day or 12 hours ago, whichever is more recent
    const twelveHoursAgo = new Date(now.getTime() - hour(12));
    const startTime = startOfDay > twelveHoursAgo ? startOfDay : twelveHoursAgo;

    console.log(`fetching screen data from ${startTime.toISOString()} to ${now.toISOString()}`);

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

    // Only deduplicate if enabled in settings
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

    const dailyReport = await generateDailyReport(
      screenData.data,
      aiPreset,
      startTime,
      now,
      customPrompt,
    );

    console.log("daily report generated:", dailyReport);

    const notionClient = new NotionClient(settings.notion);
    const deepLink = await notionClient.createDailyReport(dailyReport);

    return NextResponse.json({
      message: "daily report synced successfully",
      report: dailyReport,
      deepLink: deepLink,
    });
  } catch (error) {
    console.error("error in daily report api:", error);
    return NextResponse.json(
      { error: `failed to process daily report: ${error}` },
      { status: 500 },
    );
  }
}
