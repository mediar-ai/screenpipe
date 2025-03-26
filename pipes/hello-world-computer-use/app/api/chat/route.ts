import { openai } from "@ai-sdk/openai";
import { jsonSchema, streamObject, streamText } from "ai";
import { ollama } from "ollama-ai-provider";
import { pipe } from "@screenpipe/js";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { messages, system, tools: clientTools } = await req.json();

  const settings = await pipe.settings.getAll();
  const pipeAiPresetId = settings.customSettings
    ? settings.customSettings["hello-world-computer-use"].aiPresetId
    : null;

  const aiPreset = pipeAiPresetId
    ? settings.aiPresets?.find((preset: any) => preset.id === pipeAiPresetId)
    : settings.aiPresets?.find((preset: any) => preset.defaultPreset);

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

  // Get available MCP tools
  const mcpToolsResponse = await pipe.mcp.listTools();
  const mcpTools = mcpToolsResponse.tools.reduce((acc, tool) => {
    acc[tool.name] = {
      // @ts-ignore
      parameters: jsonSchema(tool.inputSchema),
      execute: async (args: any, context: any) => {
        try {
          console.log("executing mcp tool", tool.name, args);
          // Call the MCP tool and return result
          const result = await pipe.mcp.callTool({
            name: tool.name,
            arguments: args,
          });
          console.log("mcp tool result", result);
          return result;
        } catch (error) {
          console.error(`Error executing MCP tool ${tool.name}:`, error);
          throw error;
        }
      },
    };
    return acc;
  }, {} as Record<string, any>);

  // Merge client tools and MCP tools
  const allTools = { ...mcpTools };

  // Add client tools that were passed in the request
  if (clientTools) {
    Object.entries<{ parameters: unknown }>(clientTools).forEach(
      ([name, tool]) => {
        allTools[name] = {
          parameters: jsonSchema(tool.parameters!),
        };
      }
    );
  }

  const model =
    aiPreset.provider === "openai"
      ? openai(aiPreset.model)
      : aiPreset.provider === "native-ollama"
      ? ollama(aiPreset.model)
      : openai(aiPreset.model);

  console.log("model", model);

  const result = streamText({
    model,
    messages,
    system,
    tools: allTools,
  });

  for await (const chunk of result.textStream) {
    console.log("chunk", chunk);
  }

  return result.toDataStreamResponse();
}
