// ignore all file ts errors
"use client";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage } from "./chat-message-v2";
import { Message, generateText, nanoid, streamText, tool } from "ai";
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();
  const posthog = usePostHog();

  const { messagesRef, scrollRef, visibilityRef, isAtBottom, scrollToBottom } =
    useScrollAnchor();
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    setIsLoading(true);
    setError(null);
    posthog.capture("send_message", {
      userId: settings.userId,
      inputMessage,
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

      // console.log("provider", provider);
      console.log("model", model);

      await generateTextWithRetry({
        model: provider(model),
        tools: {
          query_screenpipe: {
            description: `Query the local screenpipe instance for relevant information. 
              You will return multiple queries under the key 'queries'.
              Make sure to return a list of queries, not a single query.

              ONLY USE THIS TOOL ONCE
              
              - MAKE SURE TO RETURN AN ARRAY OF QUERIES e.g. {"queries": [ ... ]}

              Example answers from you:
              "{
                "queries": [
                  {"q": "goal", "offset": 0, "limit": 10, "content_type": "all", "start_date": "2024-07-21T11:30:25Z", "end_date": "2024-07-21T11:35:25Z", "app_name": "arc"},
                  {"offset": 0, "limit": 50, "content_type": "ocr", "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z"},
                  {"q": "customer", "offset": 0, "limit": 20, "content_type": "audio", "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z"}
                ]
              }"
              
              `,
            parameters: screenpipeMultiQuery,
            execute: async (e: z.infer<typeof screenpipeMultiQuery>) => {
              // @ts-ignore
              setMessages((prevMessages) => [
                ...prevMessages,
                {
                  id: nanoid(),
                  role: "tool",
                  toolInvocations: e.queries,
                  content: [
                    {
                      type: "function",
                      toolName: "query_screenpipe",
                      args: {
                        queries: e.queries,
                      },
                    },
                  ],
                },
              ]);
              const result = await queryScreenpipeNtimes(e);
              // @ts-ignore
              setMessages((prevMessages) => [
                ...prevMessages,
                {
                  id: nanoid(),
                  role: "tool",
                  content: [
                    {
                      type: "function",
                      toolName: "query_screenpipe",
                      args: {
                        queries: e.queries,
                      },
                      result: result,
                    },
                  ],
                },
              ]);
              return result;
            },
          },
          stream_response: {
            description:
              "Stream the final response to the user. ALWAYS FINISH WITH THIS TOOL. ALWAYS FINISH WITH THIS TOOL. ALWAYS FINISH WITH THIS TOOL",
            parameters: z.object({
              response: z
                .string()
                .describe("The final response to stream to the user"),
            }),
            execute: async ({ response }: { response: string }) => {
              const { textStream } = await streamText({
                model: provider(model),
                messages: [{ role: "user", content: response }],
              });
              console.log("response", response);
              const assistantMessageId = nanoid();
              setMessages((prevMessages) => [
                ...prevMessages,
                { id: assistantMessageId, role: "assistant", content: "" },
              ]);
              let fullResponse = "";
              for await (const chunk of textStream) {
                fullResponse += chunk;
                setMessages((prevMessages) =>
                  prevMessages.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: fullResponse }
                      : msg
                  )
                );
              }

              throw new Error("STREAM_COMPLETE");
            },
          },
        },
        toolChoice: "auto",
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
          Return a list of objects with the key "queries"
          - q contains a single query, again, for example instead of "life plan" just use "life"
          - Respond with only the updated JSON object
          - If you return something else than JSON the universe will come to an end
          - DO NOT add \`\`\`json at the beginning or end of your response
          - Do not use '"' around your response
          - Date & time now is ${new Date().toISOString()}. Adjust start_date and end_date to properly match the user intent time range.
          - If the user ask about his morning do not use morning as query that's dumb, try to infer some keywords from the user question
          - Very important: your output will be given to another LLM so make sure not to return too much data (typically each row returns lot of data)
          - Use between 2-5 queries with very different keywords that could maximally match the user's screen text or audio transcript
          - Use "all" for querying the same keyword over vision and audio
          - You typically always query screenpipe in the first user message
          - ALWAYS use the "stream_response" tool to stream the final response to the user
          - ALWAYS use the "stream_response" tool to stream the final response to the user
          - ALWAYS use the "stream_response" tool to stream the final response to the user

          `,
          },
          ...messages,
          {
            role: "user",
            content: inputMessage,
          },
        ],
        maxToolRoundtrips: 2, // allow up to 5 tool roundtrips
      });
    } catch (error) {
      if (error instanceof Error && error.message === "STREAM_COMPLETE") {
        console.log("Streaming completed");
        return;
      }

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
                return <ChatMessage key={index} message={msg} />;
              } else if (msg.role === "tool") {
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
            screenpipe is in beta, base its answer on your computer activity and
            can make errors.
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
