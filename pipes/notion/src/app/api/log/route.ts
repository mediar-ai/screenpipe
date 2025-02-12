import { NextResponse } from "next/server";
import { pipe } from "@screenpipe/js";
import { generateWorkLog } from "@/lib/helpers";
import { NotionClient } from "@/lib/notion/client";
import { getScreenpipeAppSettings } from "@/lib/actions/get-screenpipe-app-settings";

const minute = (min: number) => min * 60 * 1000;

export async function GET() {
  try {
    const settings = (await getScreenpipeAppSettings())["customSettings"]![
      "notion"
    ];

    const model = settings?.aiModel;
    const pageSize = settings?.pageSize || 50;
    const customPrompt = settings?.prompt;
    const interval = settings?.interval ? minute(settings.interval) : 3600000;

    if (!model) {
      return NextResponse.json(
        { error: "model not selected" },
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
    const oneHourAgo = new Date(now.getTime() - interval);

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

    const logEntry = await generateWorkLog(
      screenData.data,
      model,
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
