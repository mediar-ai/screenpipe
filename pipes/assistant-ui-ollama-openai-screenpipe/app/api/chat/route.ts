import { openai } from "@ai-sdk/openai";
import { jsonSchema, streamText } from "ai";
import { ollama } from "ollama-ai-provider";
import { pipe } from "@screenpipe/js";
import { NextResponse } from "next/server";

// export const runtime = "edge";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages, system, tools } = await req.json();

  const settings = await pipe.settings.getAll();

  const aiPreset = settings.aiPresets?.find((preset) => preset.defaultPreset);
  console.log("aiPreset", aiPreset);

  // check if aiPreset is correct
  if (!aiPreset) {
    return NextResponse.json({ error: "no ai preset found" }, { status: 400 });
  }

  // check if aiPreset is correct eg api key if openai or screenpipe-cloud
  if (aiPreset.provider === "openai" && !aiPreset.apiKey) {
    return NextResponse.json(
      { error: "no api key found for openai" },
      { status: 400 }
    );
  }

  const model =
    aiPreset.provider === "openai"
      ? openai(aiPreset.model)
      : aiPreset.provider === "native-ollama"
      ? ollama(aiPreset.model)
      : openai(aiPreset.model);

  const result = streamText({
    model,
    messages,
    // forward system prompt and tools from the frontend
    system,
    tools: Object.fromEntries(
      Object.entries<{ parameters: unknown }>(tools).map(([name, tool]) => [
        name,
        {
          parameters: jsonSchema(tool.parameters!),
        },
      ])
    ),
  });

  return result.toDataStreamResponse();
}
