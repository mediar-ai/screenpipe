import {
  ContentItem,
  OCRContent,
  AudioContent,
  UiContent,
  pipe,
} from "@screenpipe/js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  let { startDate: startDateStr, endDate: endDateStr } = body;

  let startDate, endDate;

  if (startDateStr && endDateStr) {
    startDate = new Date(startDateStr);
    endDate = new Date(endDateStr);
  } else {
    // Default to today from 9 AM to 9 PM
    const today = new Date();
    startDate = new Date(today.setHours(9, 0, 0, 0));
    endDate = new Date(today.setHours(21, 0, 0, 0));
  }

  const startTime = startDate.toISOString();
  const endTime = endDate.toISOString();

  try {
    const ocrPromise = pipe.queryScreenpipe({
      contentType: "ocr",
      startTime: startTime,
      endTime: endTime,
      limit: 10000, // TODO: consider pagination
    });

    const audioPromise = pipe.queryScreenpipe({
      contentType: "audio",
      startTime: startTime,
      endTime: endTime,
      limit: 10000,
    });

    const [ocrResults, audioResults] = await Promise.all([
      ocrPromise,
      audioPromise,
    ]);

    const ocrData = ocrResults?.data || [];
    const audioData = audioResults?.data || [];

    const formattedOcr = ocrData.map((item) => {
      const content = item.content as OCRContent;
      return {
        timestamp: content.timestamp,
        content: content.text,
        type: "ocr",
        appName: content.appName,
        windowName: content.windowName,
      };
    });

    const formattedAudio = audioData.map((item) => {
      const content = item.content as AudioContent;
      return {
        timestamp: content.timestamp,
        content: content.transcription,
        type: "audio",
        appName: "",
        windowName: "",
      };
    });

    const combinedData = [...formattedOcr, ...formattedAudio];

    combinedData.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json({ success: true, data: combinedData });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("failed to fetch data:", errorMessage);
    return NextResponse.json(
      { success: false, error: "failed to fetch data", details: errorMessage },
      { status: 500 }
    );
  }
} 