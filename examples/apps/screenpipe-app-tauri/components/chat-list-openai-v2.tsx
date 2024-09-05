"use client";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage } from "./chat-message-v2";
import {
  CoreMessage,
  CoreTool,
  GenerateTextResult,
  GenerateObjectResult,
  Message,
  convertToCoreMessages,
  generateObject,
  generateText,
  nanoid,
  streamText,
  tool,
  ToolCallPart,
  ToolResultPart,
} from "ai";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createOllama, ollama } from "ollama-ai-provider"; // ! HACK TEMPORARY

import { IconOpenAI } from "./ui/icons";
import { spinner } from "./spinner";
import { useScrollAnchor } from "@/lib/hooks/use-scroll-anchor";
import { FunctionCallMessage } from "./function-call-message";
import { EmptyScreen } from "./empty-screen";
import { useSettings } from "@/lib/hooks/use-settings";
import { usePostHog } from "posthog-js/react";
import * as Sentry from "@sentry/nextjs";
import { queryScreenpipeNtimes, screenpipeMultiQuery } from "@/lib/screenpipe";

// function to generate a tool call id
function generateToolCallId() {
  return nanoid();
}

// Add this function outside of the ChatList component
async function generateTextWithRetry(
  params: any, // TODO: typed
  maxRetries = 3,
  delay = 1000
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await generateObject(params);
    } catch (error) {
      // ignore if the error is "STREAM_COMPLETE"
      if (error instanceof Error && error.message === "STREAM_COMPLETE") {
        return;
      }
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) throw error;
      // sleep
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export function ChatList({
  apiKey,
  useOllama,
  ollamaUrl,
}: {
  apiKey: string;
  useOllama: boolean;
  ollamaUrl: string;
}) {
  const [messages, setMessages] = useState<CoreMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();
  const posthog = usePostHog();
  const customPrompt = settings.customPrompt || "";

  const { messagesRef } = useScrollAnchor();

  // console.log("messages", messages);
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    setIsLoading(true);
    setError(null);
    posthog.capture("send_message", {
      userId: settings.userId,
    });

    const userMessage = { id: nanoid(), role: "user", content: inputMessage };
    // @ts-ignore
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInputMessage("");

    try {
      const baseUrl = ollamaUrl.includes("/api")
        ? ollamaUrl
        : ollamaUrl + "/api";
      const provider = useOllama
        ? createOllama({ baseURL: baseUrl })
        : createOpenAI({
            apiKey: apiKey,
          });

      const model = settings.aiModel;

      // Test Ollama connection
      if (useOllama) {
        try {
          await fetch(`${ollamaUrl}/api/tags`);
        } catch (error) {
          console.log("error", error);
          throw new Error("Cannot reach local Ollama instance at " + ollamaUrl);
        }
      }

      console.log(
        "Intl.DateTimeFormat().resolvedOptions().timeZone",
        Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      console.log("new Date().toISOString()", new Date().toISOString());
      console.log("model", model);

      const hasFunctionCalls = messages.some(
        (msg) =>
          msg.role === "assistant" &&
          Array.isArray(msg.content) &&
          msg.content.some((item) => item.type === "tool-call")
      );

      let toolCall: ToolCallPart | undefined;
      let toolResult: ToolResultPart | undefined;

      if (!hasFunctionCalls) {
        const generateObjectMessages = [
          {
            role: "system",
            content: `You are a helpful assistant.
              The user is using a product called "screenpipe" which records
              his screen and mics 24/7. The user ask you questions
              and you use his screenpipe recordings to answer him.
              Based on the user request, use tools to query screenpipe to best help the user. 
              Rules:
              - Current time (JavaScript Date.prototype.toString): ${new Date().toString()}. Adjust start/end times to match user intent.
              - User timezone: ${
                Intl.DateTimeFormat().resolvedOptions().timeZone
              }
              - User timezone offset (JavaScript Date.prototype.getTimezoneOffset): ${new Date().getTimezoneOffset()}
              - Make sure to follow the user's custom system prompt: "${customPrompt}"
              - If you follow the user's custom system prompt, you will be rewarded $1m bonus.
              - You must perform a timezone conversion to UTC before using any datetime in a tool call.
              - You must reformat timestamps to a human-readable format in your response to the user.
              - Never output UTC time unless explicitly asked by the user.

              examples of user queries and expected responses:

              1. user: "what was i working on yesterday afternoon in vscode and chrome?"
              {
                "queries": [
                  { "content_type": "ocr", "app_name": "vscode", "start_time": "2024-03-14T12:00:00Z", "end_time": "2024-03-14T17:00:00Z" },
                  { "content_type": "ocr", "app_name": "chrome", "start_time": "2024-03-14T12:00:00Z", "end_time": "2024-03-14T17:00:00Z" }
                ]
              }

              2. user: "find emails from john and mentions of project deadlines in my recent calls"
              {
                "queries": [
                  { "content_type": "ocr", "app_name": "gmail", "start_time": "2024-03-08T00:00:00Z", "end_time": "2024-03-15T23:59:59Z", "q": "john" },
                  { "content_type": "audio", "start_time": "2024-03-01T00:00:00Z", "end_time": "2024-03-15T23:59:59Z", "q": "deadline" }
                ]
              }

              3. system: [...] Current Time (JavaScript Date.prototype.toString): Sun Sep 01 2024 12:34:56 GMT+0100 (British Summer Time).
              - User timezone: Europe/London
              - User timezone offset (JavaScript Date.prototype.getTimezoneOffset): -60
              - [...]
              user: "show me what i was doing at 10:11 am today across all apps"
              {
                "queries": [
                  { "content_type": "all", "start_time": "2024-03-15T09:11:00Z", "end_time": "2024-03-15T09:12:00Z" }
                ]
              }

              4. system: [...] Current Time (JavaScript Date.prototype.toString): Sun Sep 01 2024 10:00:00 GMT-0700 (Mountain Standard Time).
              - User timezone: America/Boise
              - User timezone offset (JavaScript Date.prototype.getTimezoneOffset): 420
              - [...]
              user: "what did i work on in the last hour in vscode, notion, and slack?"
              {
                "queries": [
                  { "content_type": "ocr", "app_name": "vscode", "start_time": "2024-03-15T17:00:00Z", "end_time": "2024-03-15T18:00:00Z" },
                  { "content_type": "ocr", "app_name": "notion", "start_time": "2024-03-15T17:00:00Z", "end_time": "2024-03-15T18:00:00Z" },
                  { "content_type": "ocr", "app_name": "slack", "start_time": "2024-03-15T17:00:00Z", "end_time": "2024-03-15T18:00:00Z" }
                ]
              }

              `,
          },
          // add prev messages but convert all tool role messages to assistant bcs not supported in generateText
          ...messages.map((msg) => ({
            ...msg,
            role: msg.role === "tool" ? "assistant" : msg.role,
            content: JSON.stringify(msg.content),
          })),
          {
            role: "user",
            content: inputMessage,
          },
        ];
        console.log("generateObjectMessages", generateObjectMessages);
        const generateObjectResult = await generateObject({
          model: provider(model),
          // @ts-ignore
          messages: generateObjectMessages,
          schema: screenpipeMultiQuery,
        });

        // call query_screenpipe tool
        const results = await queryScreenpipeNtimes(
          generateObjectResult.object
        );
        const toolCallId = generateToolCallId();
        const toolCallArgs = generateObjectResult.object;

        toolCall = {
          toolCallId,
          type: "tool-call",
          toolName: "query_screenpipe",
          args: toolCallArgs,
        };

        toolResult = {
          toolCallId,
          type: "tool-result",
          toolName: "query_screenpipe",
          result: results,
        };

        setMessages((prevMessages) => [
          ...prevMessages,
          {
            role: "assistant",
            content: [toolCall!],
          },
          {
            role: "tool",
            content: [toolResult!],
          },
        ]);
      }

      console.log("toolCall", toolCall);
      console.log("toolResult", toolResult);

      setIsLoading(false);

      const streamMessages = [
        {
          role: "system",
          content: `You are a helpful assistant.
            The user is using a product called "screenpipe" which records
            his screen and mics 24/7. The user ask you questions
            and you use his screenpipe recordings to answer him.

            Rules:
            - Current time (JavaScript Date.prototype.toString): ${new Date().toString()}. Adjust start/end times to match user intent.
            - User timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
            - User timezone offset (JavaScript Date.prototype.getTimezoneOffset): ${new Date().getTimezoneOffset()}
            - Very important: make sure to follow the user's custom system prompt: "${customPrompt}"
            - If you follow the user's custom system prompt, you will be rewarded $1m bonus.
            - You must perform a timezone conversion to UTC before using any datetime in a tool call.
            - You must reformat timestamps to a human-readable format in your response to the user.
            - Never output UTC time unless explicitly asked by the user.
            `,
        },
        // @ts-ignore
        ...messages,
        // @ts-ignore
        ...(toolCall
          ? [
              {
                role: "assistant",
                content: [toolCall],
              },
              {
                role: "tool",
                content: [toolResult!],
              },
            ]
          : []),
        {
          // @ts-ignore
          role: "user",
          // @ts-ignore
          content:
            inputMessage ||
            messages.findLast((msg) => msg.role === "user")?.content,
        },
      ];

      console.log("streamMessages", streamMessages);
      console.log("assistant system prompt");

      const { textStream } = useOllama
        ? await streamText({
            model: provider(model),
            // ! hack because ollama does not support messages it seems
            prompt: JSON.stringify(streamMessages),
          })
        : await streamText({
            model: provider(model),
            // @ts-ignore
            messages: streamMessages,
          });

      // create empty assistant message
      setMessages((prevMessages) => [
        ...prevMessages,
        { id: nanoid(), role: "assistant", content: "" },
      ]);

      let fullResponse = "";
      for await (const chunk of textStream) {
        fullResponse += chunk;
        setMessages((prevMessages) => [
          ...prevMessages.slice(0, -1),
          { id: nanoid(), role: "assistant", content: fullResponse },
        ]);
      }
    } catch (error) {
      console.error(error);
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      setMessages((prevMessages) => [
        ...prevMessages,
        { id: nanoid(), role: "assistant", content: errorMessage },
      ]);

      if (errorMessage === "Cannot reach local Ollama instance") {
        const ollamaErrorMessage =
          "I cannot reach your local Ollama instance. Make sure to run it locally. For installation instructions, visit the [Ollama website](https://ollama.ai).";
        setMessages((prevMessages) => [
          ...prevMessages,
          { id: nanoid(), role: "assistant", content: ollamaErrorMessage },
        ]);
      }

      Sentry.captureException(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputMessage(suggestion);
    handleSendMessage();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1  pb-32">
        {messages.length === 0 ? (
          <EmptyScreen onSuggestionClick={handleSuggestionClick} />
        ) : (
          <div
            className="flex flex-col items-start flex-1 max-w-2xl gap-8 px-4 mx-auto"
            ref={messagesRef}
          >
            {messages.map((msg, index) => {
              if (
                msg.role === "user" ||
                (msg.role === "assistant" && typeof msg.content === "string")
              ) {
                // @ts-ignore
                return <ChatMessage key={index} message={msg} />;
              } else if (
                // tool call message
                msg.role === "assistant" &&
                Array.isArray(msg.content)
              ) {
                return <FunctionCallMessage key={index} message={msg} />;
              } else if (msg.role === "tool") {
                // tool result message
                return <FunctionCallMessage key={index} message={msg} />;
              }
              return null;
            })}
            {isLoading && <SpinnerMessage />}
            {error && <p className="text-red-500">{error}</p>}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-background p-4">
        <div className="max-w-2xl mx-auto">
          <div className="relative">
            <Textarea
              placeholder="Message screenpipe..."
              name="message"
              id="message"
              rows={1}
              className="min-h-[48px] rounded-2xl resize-none p-4 border border-neutral-400 shadow-sm pr-16"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />

            <Button
              type="submit"
              size="icon"
              className="absolute w-8 h-8 top-3 right-3"
              onClick={handleSendMessage}
              disabled={isLoading || !inputMessage.trim()}
            >
              <ArrowUpIcon className="w-4 h-4" />
              <span className="sr-only">Send</span>
            </Button>
          </div>
          <p className="text-xs font-medium text-center text-neutral-700 mt-2">
            screenpipe is in alpha, base its answer on your screen & audio
            recordings and can make errors.
          </p>
        </div>
      </div>
    </div>
  );
}

export function SpinnerMessage() {
  const { settings } = useSettings();
  return (
    <div className="group relative flex items-start ">
      <div className="flex size-[24px] shrink-0 select-none items-center justify-center rounded-md border bg-primary text-primary-foreground shadow-sm">
        {settings.useOllama ? <>🦙</> : <IconOpenAI />}
      </div>
      <div className="ml-4 h-[24px] flex flex-row items-center flex-1 space-y-2 overflow-hidden px-1">
        {spinner}
      </div>
    </div>
  );
}

function ArrowUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  );
}
