// app/api/settings/route.ts
import { pipe } from "@screenpipe/js";
import { NextResponse } from "next/server";
import type { Settings } from "@screenpipe/js";
import { getDefaultSettings } from "@screenpipe/browser";
// Force Node.js runtime
export const runtime = "nodejs"; // Add this line
export const dynamic = "force-dynamic";

export async function GET() {
  console.log("[api/settings] getting settings...");
  try {
    const settingsManager = pipe.settings;
    if (!settingsManager) {
      console.error("[api/settings] settingsManager is undefined");
      return NextResponse.json(getDefaultSettings(), { status: 200 });
    }
    const rawSettings = await settingsManager.getAll();
    console.log("[api/settings] got settings successfully");
    return NextResponse.json(rawSettings);
  } catch (error) {
    console.error("[api/settings] failed to get settings:", error);
    return NextResponse.json(
      { error: "failed to get settings", details: String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  console.log("[api/settings] updating settings...");
  try {
    const settingsManager = pipe.settings;
    if (!settingsManager) {
      console.error("[api/settings] settingsManager is undefined");
      return NextResponse.json(
        { error: "settingsManager not found" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { key, value, isPartialUpdate, reset } = body;
    console.log("[api/settings] received update request:", { key, isPartialUpdate, reset });

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
