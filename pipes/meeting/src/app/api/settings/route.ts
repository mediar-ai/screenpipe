// app/api/settings/route.ts
import { pipe } from "@screenpipe/js";
import { NextResponse } from "next/server";
import type { Settings } from "@screenpipe/js";
import { getDefaultSettings } from "@screenpipe/browser";
// Force Node.js runtime
export const runtime = "nodejs"; // Add this line
export const dynamic = "force-dynamic";

export async function GET() {
  console.log("getting settings...");
  const defaultSettings = getDefaultSettings();
  try {
    const settingsManager = pipe.settings;
    if (!settingsManager) {
      console.error("settingsManager is undefined");
      throw new Error("settingsManager not found");
    }
    const rawSettings = await settingsManager.getAll();
    // console.log("got settings:", rawSettings);
    return NextResponse.json(rawSettings);
  } catch (error) {
    console.error("failed to get settings:", error);
    // Return error status to help debug
    return NextResponse.json(
      { error: "failed to get settings", details: String(error) },
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
    const { key, value, isPartialUpdate, reset } = body;

    if (reset) {
      if (key) {
        await settingsManager.resetKey(key);
      } else {
        await settingsManager.reset();
      }
      return NextResponse.json({ success: true });
    }

    if (isPartialUpdate) {
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
