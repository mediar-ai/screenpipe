import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/settings";

export async function GET() {
  try {
    const settings = await getSettings();
    // Mask the API key for security
    return NextResponse.json({
      ...settings,
      openaiApiKey: settings.openaiApiKey
        ? settings.openaiApiKey.slice(0, 7) + "..." + settings.openaiApiKey.slice(-4)
        : "",
    });
  } catch (error) {
    console.error("Failed to load settings:", error);
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const currentSettings = await getSettings();

    // Only update API key if it's a new complete key (not masked)
    const newSettings = {
      ...body,
      openaiApiKey:
        body.openaiApiKey && !body.openaiApiKey.includes("...")
          ? body.openaiApiKey
          : currentSettings.openaiApiKey,
    };

    await saveSettings(newSettings);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
