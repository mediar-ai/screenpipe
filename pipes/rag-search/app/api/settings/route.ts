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

    // Validate API key format if provided
    if (body.openaiApiKey && !body.openaiApiKey.includes("...")) {
      const apiKey = body.openaiApiKey.trim();
      if (apiKey && !apiKey.startsWith("sk-")) {
        return NextResponse.json(
          { error: "Invalid API key format. OpenAI API keys should start with 'sk-'." },
          { status: 400 }
        );
      }
    }

    // Validate maxResults if provided
    if (body.maxResults !== undefined) {
      const maxResults = Number(body.maxResults);
      if (isNaN(maxResults) || maxResults < 1 || maxResults > 50) {
        return NextResponse.json(
          { error: "Max results must be a number between 1 and 50." },
          { status: 400 }
        );
      }
    }

    // Only update API key if it's a new complete key (not masked)
    const newSettings = {
      ...body,
      openaiApiKey:
        body.openaiApiKey && !body.openaiApiKey.includes("...")
          ? body.openaiApiKey.trim()
          : currentSettings.openaiApiKey,
    };

    await saveSettings(newSettings);
    return NextResponse.json({
      success: true,
      message: "Settings saved successfully."
    });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings. Please try again." },
      { status: 500 }
    );
  }
}
