"use client";

import { useState } from "react";
import { AIPresetsSelector } from "./ai-presets-selector";
import { convertToCoreMessages, Message, streamText } from "ai";
import { useSettings } from "@/lib/hooks/use-settings";
import { usePipeSettings } from "@/lib/hooks/use-pipe-settings";
import { toast } from "sonner";
import { openai } from "@ai-sdk/openai";
import { ollama } from "ollama-ai-provider";
import { pipe } from "@screenpipe/browser";
import { z } from "zod";
export const Chat = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const { settings, getPreset } = usePipeSettings("hello-world-computer-use");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const preset = getPreset();
    console.log("preset", preset);

    if (!preset) {
      toast.message("please create new or select existing ones");
      return;
    }

    let apiKey = "";
    if (preset.provider === "openai" || preset.provider === "custom") {
      preset.apiKey;
      if ("apiKey" in preset) {
        apiKey = preset.apiKey;
      } else {
        toast.message("e");
        return;
      }
    }

    const model =
      preset.provider === "openai"
        ? openai(preset.model)
        : preset.provider === "native-ollama"
        ? ollama(preset.model)
        : openai(preset.model);

    console.log("model", model);
    const messages = [
      {
        id: "1",
        role: "user",
        content: input,
      },
    ];

    const result = streamText({
      model,
      // @ts-ignore
      messages: convertToCoreMessages(messages),
      onChunk: (chunk) => {
        console.log(chunk);
      },
      onError: (error) => {
        console.log(JSON.stringify(error, null, 2));
      },
      tools: {
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
          execute: async ({
            url,
            browser,
          }: {
            url: string;
            browser?: string;
          }) => {
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
      },
      toolCallStreaming: true,
      maxSteps: 5,
    });

    for await (const chunk of result.textStream) {
      // setMessages((prev) => [...prev, chunk]);
      console.log(chunk);
    }
  };

  return (
    <>
      <AIPresetsSelector pipeName="hello-world-computer-use" />

      {messages.map((message) => (
        <div key={message.id}>
          {message.role === "user" ? "User: " : "AI: "}
          {message.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          name="prompt"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit">Submit</button>
      </form>
    </>
  );
};
