// app/api/settings/route.ts
import { pipe } from "@screenpipe/js";
import { NextResponse } from "next/server";
import type { Settings } from "@screenpipe/js";
// Force Node.js runtime
export const runtime = "nodejs"; // Add this line
export const dynamic = 'force-dynamic'

export async function GET() {
  const defaultSettings: Settings = {
    openaiApiKey: "",
    deepgramApiKey: "",
    aiModel: "gpt-4",
    aiUrl: "https://api.openai.com/v1",
    customPrompt: "",
    port: 3030,
    dataDir: "default",
    disableAudio: false,
    ignoredWindows: [],
    includedWindows: [],
    aiProviderType: "openai",
    embeddedLLM: {
      enabled: false,
      model: "llama3.2:1b-instruct-q4_K_M",
      port: 11438,
    },
    enableFrameCache: true,
    enableUiMonitoring: false,
    aiMaxContextChars: 128000,
    user: {}
  };

  try {
    const settingsManager = pipe.settings;
    if (!settingsManager) {
      throw new Error("settingsManager not found");
    }
    const rawSettings = await settingsManager.getAll();
    return NextResponse.json(rawSettings);
  } catch (error) {
    console.error("failed to get settings:", error);
    return NextResponse.json(defaultSettings);
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
