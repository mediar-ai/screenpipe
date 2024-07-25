// ignore all file ts errors
// @ts-nocheck
"use client";
import { useState } from "react";
import OpenAI from "openai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatMessage } from "./chat-message-v2";
import { Message, generateText, nanoid, streamText, tool } from "ai";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { IconOpenAI } from "./ui/icons";
import { spinner } from "./spinner";
import { useScrollAnchor } from "@/lib/hooks/use-scroll-anchor";
import { FunctionCallMessage } from "./function-call-message";
import { EmptyScreen } from "./empty-screen";

const screenpipeQuery = z.object({
  q: z
    .string()
    .describe(
      "The search query matching exact keywords. Use a single keyword that best matches the user intent"
    ),
  contentType: z
    .enum(["ocr", "audio", "all"])
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
  startTime: z
    .string()
    // 1 hour ago
    .default(new Date(Date.now() - 3600000).toISOString())
    .describe("Start time for search range in ISO 8601 format"),
  endTime: z
    .string()
    .default(new Date().toISOString())
    .describe("End time for search range in ISO 8601 format"),
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
    const queryParams = new URLSearchParams({
      q: params.q,
      offset: params.offset.toString(),
      limit: params.limit.toString(),
      start_date: params.startTime,
      end_date: params.endTime,
      content_type: params.contentType,
    });
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

export function ChatList({ apiKey }: { apiKey: string }) {
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
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInputMessage("");

    try {
      const provider = createOpenAI({
        apiKey: apiKey,
      });
      const text = await generateText({
        model: provider("gpt-4o"),
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
          Based on the user request, use tools to screenpipe to best help the user. 
          Each query should have "q", "offset", "limit", "start_date", "end_date", and "content_type" fields. 
          Rules:
          - q should be a single keyword that would properly find in the text found on the user screen some infomation that would help answering the user question.
          Return a list of objects with the key "queries"
          - q contains a single query, again, for example instead of "life plan" just use "life"
          - Respond with only the updated JSON object
          - If you return something else than JSON the universe will come to an end
          - DO NOT add \`\`\`json at the beginning or end of your response
          - Do not use '"' around your response
          - Date & time now is ${new Date().toISOString()}
          - If the user ask about his morning do not use morning as query that's dumb, try to infer some keywords from the user question
          - Very important: your output will be given to another LLM so make sure not to return too much data (typically each row returns lot of data)
          - Use between 2-5 queries with very different keywords that could maximally match the user's screen text or audio transcript
          - Use "all" for querying the same keyword over vision and audio

          Example answers from you:
          "{
            "queries": [
              {"q": "goal", "offset": 0, "limit": 10, "start_date": "2024-07-21T11:30:25Z", "end_date": "2024-07-21T11:35:25Z"},
              {"q": "stripe", "offset": 0, "limit": 50, "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z"},
              {"q": "customer", "offset": 0, "limit": 20, "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z"}
            ]
          }"

          or 
          "{
            "queries": [
              {"q": "sales", "offset": 0, "limit": 10, "start_date": "2024-07-21T11:30:25Z", "end_date": "2024-07-21T11:35:25Z"},
              {"q": "customer", "offset": 0, "limit": 20, "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z"},
              {"q": "goal", "offset": 0, "limit": 10, "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z"}
            ]
          }"

          `,
          },
          {
            role: "user",
            content: inputMessage,
          },
        ],
        // maxToolRoundtrips: 5, // allow up to 5 tool roundtrips
        // prompt: inputMessage,
      });

      setIsLoading(false);

      console.log("text", text);

      setMessages((prevMessages) => [
        ...prevMessages,
        { id: nanoid(), role: "assistant", content: text.toolCalls },
        { id: nanoid(), role: "tool", content: text.toolResults },
      ]);

      console.log("streaming now");

      console.log("toolCalls", text.toolCalls);
      console.log("toolResults", text.toolResults);

      const { textStream } = await streamText({
        model: provider("gpt-4o"),
        messages: [
          {
            role: "user",
            content:
              messages.findLast((msg) => msg.role === "user")?.content ||
              inputMessage,
          },
          {
            role: "assistant",
            content: text.toolCalls,
          },
          {
            role: "tool",
            content: text.toolResults,
          },
        ],
      });

      console.log("textStream", textStream);

      // create new assistant
      const assistantMessageId = nanoid();
      setMessages((prevMessages) => [
        ...prevMessages,
        { id: assistantMessageId, role: "assistant", content: "" },
      ]);

      let fullResponse = "";
      for await (const chunk of textStream) {
        fullResponse += chunk;
        console.log("fullResponse", fullResponse);
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
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputMessage(suggestion);
    handleSendMessage();
  };

  return (
    <div className="flex flex-col">
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
              return <FunctionCallMessage key={index} message={msg} isResult />;
            }
            return null;
          })}
          {isLoading && <SpinnerMessage />}
          {error && <p className="text-red-500">{error}</p>}
        </div>
      )}

      {messages.length === 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-background p-4">
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
              screenpipe is in beta, base its answer on your computer activity
              and can make errors.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function SpinnerMessage() {
  return (
    <div className="group relative flex items-start md:-ml-12">
      <div className="flex size-[24px] shrink-0 select-none items-center justify-center rounded-md border bg-primary text-primary-foreground shadow-sm">
        <IconOpenAI />
      </div>
      <div className="ml-4 h-[24px] flex flex-row items-center flex-1 space-y-2 overflow-hidden px-1">
        {spinner}
      </div>
    </div>
  );
}

function ArrowUpIcon(props) {
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

function BotIcon(props) {
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
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

function ChevronDownIcon(props) {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ClipboardIcon(props) {
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
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function PenIcon(props) {
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
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function RefreshCcwIcon(props) {
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
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function SparkleIcon(props) {
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
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}

function ThumbsDownIcon(props) {
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
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

function ThumbsUpIcon(props) {
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
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

function XIcon(props) {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ZapIcon(props) {
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
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  );
}
