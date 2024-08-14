// ignore all file ts errors
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
  Message,
  convertToCoreMessages,
  generateObject,
  generateText,
  nanoid,
  streamText,
  tool,
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

// Add this function outside of the ChatList component
async function generateTextWithRetry(
  params: any,
  maxRetries = 3,
  delay = 1000
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await generateText(params);
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
      console.log("new Date().toLocaleString()", new Date().toLocaleString());
      console.log("model", model);

      const hasFunctionCalls = messages.some(
        (msg) =>
          msg.role === "assistant" &&
          Array.isArray(msg.content) &&
          msg.content.some((item) => item.type === "tool-call")
      );

      let text:
        | GenerateTextResult<Record<string, CoreTool<any, any>>>
        | undefined;
      if (!hasFunctionCalls) {
        text = await generateTextWithRetry({
          model: provider(model),
          messages: [
            {
              role: "system",
              content: `You are a helpful assistant.
                The user is using a product called "screenpipe" which records
                his screen and mics 24/7. The user ask you questions
                and you use his screenpipe recordings to answer him.
                Based on the user request, use tools to query screenpipe to best help the user. 
                Rules:
                - q should be a single keyword that would properly find in the text found on the user screen some infomation that would help answering the user question.
                - If you return something else than JSON the universe will come to an end
                - your output will be given to another llm, so return concise data (1 to 4 queries max in the array)
                - use "all" for querying the same keyword over vision and audio
                - for time-specific queries, focus on the time range rather than content
                - Do not add '"' around JSON arrays e.g. bad: "queries": "[ ... ]" good: "queries": [ ... ]
                - adapt queries to the user's specific question, intent, and time range
                - use 'app_name' when the user mentions a specific application but keep in mind user might use the app thru browser
                - limit to 1-4 queries per response
                - Current time: ${new Date().toLocaleString()}. Adjust start/end times to match user intent.
                - Convert user times to UTC. User timezone: ${
                  Intl.DateTimeFormat().resolvedOptions().timeZone
                }
                - MAKE SURE TO ADAPT THE TIME RANGE PROPS TO THE USER'S INTENT
                - Also make sure to follow the user's custom system prompt: "${customPrompt}"

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

                3. user: "show me what i was doing at 10:11 am today across all apps"
                {
                  "queries": [
                    { "content_type": "all", "start_time": "2024-03-15T10:11:00Z", "end_time": "2024-03-15T10:12:00Z" }
                  ]
                }

                4. user: "what did i work on in the last hour in vscode, notion, and slack?"
                {
                  "queries": [
                    { "content_type": "ocr", "app_name": "vscode", "start_time": "2024-03-15T09:00:00Z", "end_time": "2024-03-15T10:00:00Z" },
                    { "content_type": "ocr", "app_name": "notion", "start_time": "2024-03-15T09:00:00Z", "end_time": "2024-03-15T10:00:00Z" },
                    { "content_type": "ocr", "app_name": "slack", "start_time": "2024-03-15T09:00:00Z", "end_time": "2024-03-15T10:00:00Z" }
                  ]
                }            
                  
                BAD RESPONSE: {"queries":"[{"content_type": "all", "start_time": "2024-03-15T11:48:00Z", "end_time": "2024-03-15T11:49:00Z"}]"}
                BAD RESPONSE: {"queries":"[{"content_type": "all", "start_time": "2024-03-15T11:48:00Z", "end_time": "2024-03-15T11:49:00Z"}]"}
                You added '"' around the array, you should not do that.
                DO NOT FUCKING ADD '"' AROUND JSON ARRAYS
                - MAKE SURE TO ADAPT THE TIME RANGE PROPS TO THE USER'S INTENT

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
          ],
          tools: {
            query_screenpipe: {
              description:
                "Query the local screenpipe instance for relevant information. You will return multiple queries under the key 'queries'.",
              parameters: screenpipeMultiQuery,
              execute: queryScreenpipeNtimes,
            },
          },
          toolChoice: "required",
        });

        setMessages((prevMessages) => [
          ...prevMessages,
          {
            role: "assistant",
            content: [
              {
                toolCallId: text?.toolCalls?.[0]?.toolCallId!,
                type: "tool-call",
                toolName: "query_screenpipe",
                args: text?.toolCalls?.[0]?.args ? text.toolCalls[0].args : {},
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                toolCallId: text?.toolCalls?.[0]?.toolCallId!,
                type: "tool-result",
                toolName: "query_screenpipe",
                result: text?.toolResults,
              },
            ],
          },
        ]);
      }

      console.log("text", text);

      setIsLoading(false);

      const { textStream } = await streamText({
        model: provider(model),
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant.
            The user is using a product called "screenpipe" which records
            his screen and mics 24/7. The user ask you questions
            and you use his screenpipe recordings to answer him.

            Rules:
            - Date & time now is ${new Date().toISOString()}. Adjust start_time and end_time to properly match the user intent time range.
            - When the user mentions specific times (e.g., "9 to 10 am"), convert these to UTC before querying. Assume the user's local timezone is ${
              Intl.DateTimeFormat().resolvedOptions().timeZone
            }.

            - Do not try to show screenshots
            - You can analyze/view/show/access videos to the user by putting .mp4 files in a code block (we'll render it) like this: \`/users/video.mp4\`
            - You can analyze/view/show/access videos BY JUST FUCKING PUTTING THE ABSOLUTE FILE PATH IN A CODE BLOCK
            - Always use the absolute file path to access videos
            - When the user ask "show me what i was doing at 10.11 am" make sure to embed the path to the video in the response in a code block
            - MAKE SURE TO FUCKING ANSWER THE USER QUESTION
            - Also make sure to follow the user's custom system prompt: "${customPrompt}"
            - If the data retuned by tools is empty or not relevant, make sure to tell the user that you could not find anything relevant to the user question and ask the user to try something more precise in a new chat

            Example responses:

            1. "You were coding in VSCode from 2-3 PM, working on 'UserProfile.js'. In Chrome, you researched React hooks. Need more details?"

            2. "Found 2 emails from John about the project. In a call at 3 PM, the frontend deadline was moved to Friday. Video: \`/users/calls/2024-03-15-15-00.mp4\`"

            3. "At 10:11 AM: Slack chat in #project-alpha, VSCode open to 'dataProcessor.js', Chrome on AWS docs. Video: \`/users/screen/2024-03-15-10-11.mp4\`"

            4. "Last hour: VSCode - API integration, Notion - roadmap updates, Slack - code review discussion. More on any of these?"
            `,
          },
          // @ts-ignore
          ...messages,
          // @ts-ignore
          ...(text
            ? [
                {
                  role: "assistant",
                  content: [
                    {
                      // @ts-ignore
                      toolCallId: text?.toolCalls?.[0]?.toolCallId!,
                      type: "tool-call",
                      toolName: "query_screenpipe",
                      args: text?.toolCalls?.[0]?.args
                        ? text.toolCalls[0].args
                        : {},
                    },
                  ],
                },
                {
                  role: "tool",
                  content: [
                    {
                      toolCallId: text?.toolCalls?.[0]?.toolCallId!,
                      type: "tool-result",
                      toolName: "query_screenpipe",
                      result: text?.toolResults,
                    },
                  ],
                },
              ]
            : []),
          {
            // @ts-ignore
            role: "user",
            // @ts-ignore
            content:
              messages.findLast((msg) => msg.role === "user")?.content ||
              inputMessage,
          },
        ],
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
              } else if (msg.role === "tool") {
                // @ts-ignore
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
