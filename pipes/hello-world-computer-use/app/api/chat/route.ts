import { openai } from "@ai-sdk/openai";
import { jsonSchema, streamObject, streamText } from "ai";
import { ollama } from "ollama-ai-provider";
import { pipe } from "@screenpipe/js";
import { NextResponse } from "next/server";
import { z } from "zod";

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

  const allTools = {
    get_text: {
      description: "Get text content from an application window",
      parameters: z.object({
        app: z
          .string()
          .describe("The application name (e.g., 'Chrome', 'Firefox')"),
        window: z.string().optional().describe("Optional window name"),
      }),
      execute: async ({ app, window }: { app: string; window?: string }) => {
        console.log(`executing get_text for app: ${app}`);
        try {
          const result = await pipe.operator.getByAppName(app).first();
          return result?.text;
        } catch (error) {
          console.error("error in get_text:", error);
          throw new Error(`Failed to get text: ${error}`);
        }
      },
    },

    click: {
      description: "Click an element in an application",
      parameters: z.object({
        app: z
          .string()
          .describe(
            "The name of the application (e.g., 'Chrome', 'Firefox', 'Safari')"
          ),
        window: z.string().optional().describe("Optional window name"),
        text: z
          .string()
          .optional()
          .describe("Text content of the element to click"),
        role: z
          .string()
          .optional()
          .describe("Role of the element (e.g., 'button', 'checkbox', 'link')"),
        label: z
          .string()
          .optional()
          .describe("Accessibility label of the element"),
      }),
      execute: async ({
        app,
        window,
        text,
        role,
        label,
      }: {
        app: string;
        window?: string;
        text?: string;
        role?: string;
        label?: string;
      }) => {
        console.log(`executing click_element for app: ${app}, text: ${text}`);
        try {
          const result = await pipe.operator.click({
            app,
            window,
            text,
            role,
            label,
          });
          return `Successfully clicked element using ${result.method}`;
        } catch (error) {
          console.error("error in click_element:", error);
          throw new Error(`Failed to click element: ${error}`);
        }
      },
    },

    fill: {
      description: "Fill text in a form field",
      parameters: z.object({
        app: z
          .string()
          .describe(
            "The name of the application (e.g., 'Chrome', 'Firefox', 'Safari')"
          ),
        window: z.string().optional().describe("Optional window name"),
        text: z
          .string()
          .optional()
          .describe("Text content of the field to target"),
        label: z
          .string()
          .optional()
          .describe("Accessibility label of the field"),
        value: z.string().describe("The text to type into the field"),
      }),
      execute: async ({
        app,
        window,
        text,
        label,
        value,
      }: {
        app: string;
        window?: string;
        text?: string;
        label?: string;
        value: string;
      }) => {
        console.log(`executing fill_text for app: ${app}`);
        try {
          const success = await pipe.operator.fill({
            app,
            window,
            text,
            label,
            value,
          });
          return success ? `Successfully entered text` : `Failed to enter text`;
        } catch (error) {
          console.error("error in fill_text:", error);
          throw new Error(`Failed to fill text field: ${error}`);
        }
      },
    },

    list_interactable_elements: {
      description: "List interactable elements in an application",
      parameters: z.object({
        app: z
          .string()
          .describe(
            "The name of the application (e.g., 'Chrome', 'Firefox', 'Safari')"
          ),
        window: z.string().optional().describe("Optional window name"),
        textOnly: z
          .boolean()
          .optional()
          .describe("Only include elements with text"),
        maxElements: z
          .number()
          .optional()
          .describe("Maximum number of elements to return"),
      }),
      execute: async ({
        app,
        window,
        textOnly,
        maxElements,
      }: {
        app: string;
        window?: string;
        textOnly?: boolean;
        maxElements?: number;
      }) => {
        console.log(`executing list_interactable_elements for app: ${app}`);
        try {
          const result = await pipe.operator.getInteractableElements({
            app,
            window,
            withTextOnly: textOnly,
            maxElements,
          });

          const elementList = result.elements
            .map(
              (e) => `${e.index}: ${e.role} "${e.text}" (${e.interactability})`
            )
            .join("\n");

          return `Interactable elements in ${app}:\n${elementList}`;
        } catch (error) {
          console.error("error in list_interactable_elements:", error);
          throw new Error(`Failed to list interactable elements: ${error}`);
        }
      },
    },

    open_application: {
      description: "Open an application",
      parameters: z.object({
        appName: z
          .string()
          .describe(
            "The name of the application to open (e.g., 'Chrome', 'Firefox', 'Safari')"
          ),
      }),
      execute: async ({ appName }: { appName: string }) => {
        console.log(`executing open_application: ${appName}`);
        try {
          const success = await pipe.operator.openApplication(appName);
          return success
            ? `Successfully opened application '${appName}'`
            : `Failed to open application '${appName}'`;
        } catch (error) {
          console.error("error in open_application:", error);
          throw new Error(`Failed to open application: ${error}`);
        }
      },
    },

    open_url: {
      description: "Open a URL in a browser",
      parameters: z.object({
        url: z.string().describe("The URL to open"),
        browser: z
          .string()
          .optional()
          .describe(
            "The browser to use (e.g., 'Chrome', 'Firefox'). If not specified, uses the default browser."
          ),
      }),
      execute: async ({ url, browser }: { url: string; browser?: string }) => {
        console.log(
          `executing open_url: ${url}${browser ? ` in ${browser}` : ""}`
        );
        try {
          const success = await pipe.operator.openUrl(url, browser);
          return success
            ? `Successfully opened URL '${url}'${
                browser ? ` in ${browser}` : ""
              }`
            : `Failed to open URL '${url}'`;
        } catch (error) {
          console.error("error in open_url:", error);
          throw new Error(`Failed to open URL: ${error}`);
        }
      },
    },
  };

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
    toolCallStreaming: true,
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
