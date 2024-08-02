// ignore all file ts errors
"use client";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage } from "./chat-message-v2";
import { Message, generateText, nanoid, streamText, tool } from "ai";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { ollama } from "ollama-ai-provider-fix"; // ! HACK TEMPORARY

import { IconOpenAI } from "./ui/icons";
import { spinner } from "./spinner";
import { useScrollAnchor } from "@/lib/hooks/use-scroll-anchor";
import { FunctionCallMessage } from "./function-call-message";
import { EmptyScreen } from "./empty-screen";
import { useSettings } from "@/lib/hooks/use-settings";

const screenpipeQuery = z.object({
  q: z
    .string()
    .describe(
      "The search query matching exact keywords. Use a single keyword that best matches the user intent. This would match either audio transcription or OCR screen text. Example: do not use 'discuss' the user ask about conversation, this is dumb, won't return any result"
    )
    .optional(),
  content_type: z
    .enum(["ocr", "audio", "all"])
    .default("all")
    .describe(
      "The type of content to search for: screenshot data or audio transcriptions"
    ),
  limit: z
    .number()
    .default(5)
    .describe(
      "Number of results to return (default: 5). Don't return more than 50 results as it will be fed to an LLM"
    ),
  offset: z.number().default(0).describe("Offset for pagination (default: 0)"),
  start_time: z
    .string()
    // 1 hour ago
    .default(new Date(Date.now() - 3600000).toISOString())
    .describe("Start time for search range in ISO 8601 format"),
  end_time: z
    .string()
    .default(new Date().toISOString())
    .describe("End time for search range in ISO 8601 format"),
  app_name: z
    .string()
    .describe(
      "The name of the app the user was using. This filter out all audio conversations. Only works with screen text. Use this to filter on the app context that would give context matching the user intent. For example 'cursor'. Use lower case. Browser is usually 'arc', 'chrome', 'safari', etc."
    )
    .optional(),
});
const screenpipeMultiQuery = z.object({
  queries: z.array(screenpipeQuery),
});

async function queryScreenpipeNtimes(
  params: z.infer<typeof screenpipeMultiQuery>
) {
  return Promise.all(params.queries.map(queryScreenpipe));
}

// Add this new function to handle screenpipe requests
async function queryScreenpipe(params: z.infer<typeof screenpipeQuery>) {
  try {
    console.log("params", params);
    const queryParams = new URLSearchParams(
      Object.entries({
        q: params.q,
        offset: params.offset.toString(),
        limit: params.limit.toString(),
        start_date: params.start_time,
        end_date: params.end_time,
        content_type: params.content_type,
        app_name: params.app_name,
      }).filter(([_, v]) => v != null) as [string, string][]
    );
    console.log("calling screenpipe", JSON.stringify(params));
    const response = await fetch(`http://localhost:3030/search?${queryParams}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status} ${text}`);
    }
    const result = await response.json();
    console.log("result", result);
    return result;
  } catch (error) {
    console.error("Error querying screenpipe:", error);
    return null;
  }
}

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
}: {
  apiKey: string;
  useOllama: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { messagesRef, scrollRef, visibilityRef, isAtBottom, scrollToBottom } =
    useScrollAnchor();
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    setIsLoading(true);
    setError(null);

    const userMessage = { id: nanoid(), role: "user", content: inputMessage };
    // @ts-ignore
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInputMessage("");

    try {
      const provider = useOllama
        ? ollama
        : createOpenAI({
            apiKey: apiKey,
          });

      const model = useOllama ? "llama3.1" : "gpt-4o";

      // Test Ollama connection
      if (useOllama) {
        try {
          await fetch("http://localhost:11434/api/tags");
        } catch (error) {
          console.log("error", error);
          throw new Error("Cannot reach local Ollama instance");
        }
      }

      // console.log("provider", provider);
      console.log("model", model);

      const text = await generateTextWithRetry({
        model: useOllama ? ollama(model) : provider(model),
        tools: {
          query_screenpipe: {
            description:
              "Query the local screenpipe instance for relevant information. You will return multiple queries under the key 'queries'.",
            parameters: screenpipeMultiQuery,
            execute: queryScreenpipeNtimes,
          },
        },
        toolChoice: "required",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant.
          The user is using a product called "screenpipe" which records
          his screen and mics 24/7. The user ask you questions
          and you use his screenpipe recordings to answer him.
          Based on the user request, use tools to query screenpipe to best help the user. 
          Each query should have "q", "offset", "limit", "start_date", "end_date", and "content_type" fields. 
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
          - MAKE SURE TO RETURN AN ARRAY OF QUERIES e.g. {"queries": [ ... ]}
          - MAKE SURE TO RETURN AN ARRAY OF QUERIES e.g. {"queries": [ ... ]}
          - MAKE SURE TO RETURN AN ARRAY OF QUERIES e.g. {"queries": [ ... ]}
          - You typically always query screenpipe in the first user message

          Example answers from you:
          "{
            "queries": [
              {"q": "goal", "offset": 0, "limit": 10, "content_type": "all", "start_date": "2024-07-21T11:30:25Z", "end_date": "2024-07-21T11:35:25Z", "app_name": "arc"},
              {"offset": 0, "limit": 50, "content_type": "ocr", "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z"},
              {"q": "customer", "offset": 0, "limit": 20, "content_type": "audio", "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z"}
            ]
          }"

          or 
          "{
            "queries": [
              {"q": "sales", "offset": 0, "limit": 10, "content_type": "all", "start_date": "2024-07-21T11:30:25Z", "end_date": "2024-07-21T11:35:25Z"},
              {"q": "customer", "offset": 0, "limit": 20, "content_type": "all", "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z"},
              {"offset": 0, "limit": 10, "content_type": "all", "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z", "app_name": "notes"}
            ]
          }"

          `,
          },
          ...messages,
          {
            role: "user",
            content: inputMessage,
          },
        ],
        // maxToolRoundtrips: 2, // allow up to 5 tool roundtrips
        // prompt: inputMessage,
      });

      setIsLoading(false);

      console.log("text", text);

      // @ts-ignore
      setMessages((prevMessages) => [
        ...prevMessages,
        { id: nanoid(), role: "assistant", content: text!.toolCalls },
        { id: nanoid(), role: "tool", content: text!.toolResults },
      ]);

      console.log("streaming now");

      // console.log("toolCalls", text.toolCalls);
      // console.log("toolResults", text.toolResults);

      const { textStream } = useOllama
        ? await streamText({
            model: ollama(model),
            prompt: JSON.stringify([
              {
                role: "user",
                content:
                  messages.findLast((msg) => msg.role === "user")?.content ||
                  inputMessage,
              },
              {
                role: "assistant",
                content: text!.toolCalls,
              },
              {
                role: "tool",
                content: text!.toolResults,
              },
              // just a hack because ollama is drunk
              {
                role: "user",
                content: "MAKE SURE TO ANSWER THE USER QUESTION ROLE 'USER'",
              },
            ]),
          })
        : await streamText({
            model: provider(model),
            messages: [
              {
                role: "user",
                content:
                  messages.findLast((msg) => msg.role === "user")?.content ||
                  inputMessage,
              },
              {
                role: "assistant",
                content: text!.toolCalls,
              },
              {
                role: "tool",
                content: text!.toolResults,
              },
            ],
          });

      // console.log("textStream", textStream);

      // create new assistant
      const assistantMessageId = nanoid();
      setMessages((prevMessages) => [
        ...prevMessages,
        { id: assistantMessageId, role: "assistant", content: "" },
      ]);

      let fullResponse = "";
      for await (const chunk of textStream) {
        fullResponse += chunk;
        // console.log("fullResponse", fullResponse);
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: fullResponse }
              : msg
          )
        );
      }
    } catch (error) {
      console.error(error);
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      const assistantMessageId = nanoid();
      setMessages((prevMessages) => [
        ...prevMessages,
        { id: assistantMessageId, role: "assistant", content: errorMessage },
      ]);

      if (errorMessage === "Cannot reach local Ollama instance") {
        const ollamaErrorMessage =
          "I cannot reach your local Ollama instance. Make sure to run it locally. For installation instructions, visit the [Ollama website](https://ollama.ai).";
        setMessages((prevMessages) => [
          ...prevMessages,
          { id: nanoid(), role: "assistant", content: ollamaErrorMessage },
        ]);
      }
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
      <div className="flex-1 overflow-y-auto pb-32">
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
              } else if (
                msg.role === "assistant" &&
                msg.content &&
                typeof msg.content === "object"
              ) {
                return <FunctionCallMessage key={index} message={msg} />;
              } else if (msg.role === "tool") {
                return (
                  <FunctionCallMessage key={index} message={msg} isResult />
                );
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
    <div className="group relative flex items-start md:-ml-12">
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
