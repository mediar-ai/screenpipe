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

const screenpipeQuery = z.object({
  q: z.string(),
  offset: z.number(),
  limit: z.number(),
  start_date: z.string(),
  end_date: z.string(),
});
const screenpipeMultiQuery = z.array(screenpipeQuery);

async function queryScreenpipeNtimes(
  params: z.infer<typeof screenpipeMultiQuery>
) {
  await Promise.all(params.map(queryScreenpipe));
}

// Add this new function to handle screenpipe requests
async function queryScreenpipe(params: z.infer<typeof screenpipeQuery>) {
  try {
    const queryParams = new URLSearchParams({
      q: params.q,
      offset: params.offset.toString(),
      limit: params.limit.toString(),
      start_date: params.start_date,
      end_date: params.end_date,
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
              "Query the local screenpipe instance for relevant information (UPDATE: just do a SINGLE QUERY ATM)",
            parameters: screenpipeQuery,
            execute: queryScreenpipe,
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
          Each query should have "q", "offset", "limit", and start_date, end_date fields. 
          Rules:
          - q should be a single keyword that would properly find in the text found on the user screen some infomation that would help answering the user question.
          Return a list of objects with the key "queries"
          - q contains a single query, again, for example instead of "life plan" just use "life"
          - Respond with only the updated JSON object
          - If you return something else than JSON the universe will come to an end
          - DO NOT add \`\`\`json at the beginning or end of your response
          - Do not use '"' around your response
          - Date & time now is ${new Date().toISOString()}
          
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

          Bad example
          "Here's the JSON you wanted:
          [
            {
              "queries": [{"q": "sales", "offset": 0, "limit": 10}]
            },
            {
              "queries": [{"q": "customer", "offset": 0, "limit": 20}]
            },
            {
              "queries": [{"q": "goal", "offset": 0, "limit": 10}]
            }
          ]"
          or
          "\`\`\`json
          [
            {
              "queries": [
                {"q": "goals", "offset": 0, "limit": 3}
              ]
            },
            {
              "queries": [
                {"q": "life plans", "offset": 0, "limit": 5}
              ]
            },
            {
              "queries": [
                {"q": "ambitions", "offset": 0, "limit": 3}
              ]
            }
          ]
          \`\`\`"
          JSON?
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

      const { textStream } = await streamText({
        model: provider("gpt-4o"),
        messages: [
          {
            role: "user",
            content: inputMessage,
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

      // create new assistant
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
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="grid md:grid-cols-[520] min-h-screen w-full"
      ref={scrollRef}
    >
      <div className="flex flex-col">
        <div className="sticky top-0 p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled>
              <Button
                variant="ghost"
                className="gap-1 rounded-xl px-3 h-10 data-[state=open]:bg-muted text-lg"
              >
                llama <span className="text-muted-foreground">3.1-8B</span>
                <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-w-[300px]">
              <DropdownMenuItem className="items-start gap-2">
                <SparkleIcon className="w-4 h-4 mr-2 translate-y-1 shrink-0" />
                <div>
                  <div className="font-medium">GPT-4</div>
                  <div className="text-muted-foreground/80">
                    With DALL-E, browing and analysis. Limit 40 messages / 3
                    hours
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="items-start gap-2">
                <ZapIcon className="w-4 h-4 mr-2 translate-y-1 shrink-0" />
                <div>
                  <div className="font-medium">GPT-3</div>
                  <div className="text-muted-foreground/80">
                    Great for everyday tasks
                  </div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div
          className="flex flex-col items-start flex-1 max-w-2xl gap-8 px-4 mx-auto"
          ref={messagesRef}
        >
          {/* display user message */}

          {messages
            // only show string messages
            .filter((msg) => msg.role === "user")
            .map((msg, index) => (
              <ChatMessage key={index} message={msg} />
            ))}

          {isLoading && <SpinnerMessage />}

          {error && <p className="text-red-500">{error}</p>}
          {messages
            // only show string messages from assistant
            .filter(
              (msg) =>
                msg.role === "assistant" && typeof msg.content === "string"
            )
            .map((msg, index) => (
              <ChatMessage key={index} message={msg} />
            ))}
        </div>

        {messages.length === 0 && (
          <div className="max-w-2xl w-full sticky bottom-0 mx-auto py-2 flex flex-col gap-1.5 px-4 bg-background">
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
            <p className="text-xs font-medium text-center text-neutral-700">
              screenpipe canNOT make mistakes. Consider checking important
              information.
            </p>
          </div>
        )}
      </div>
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

// export const getUIStateFromAIState = (aiState: Chat) => {
//   return aiState.messages
//     .filter((message) => message.role !== "system")
//     .map((message, index) => ({
//       id: `${aiState.chatId}-${index}`,
//       display:
//         message.role === "tool" ? (
//           message.content.map((tool) => {
//             return tool.toolName === "listStocks" ? (
//               <BotCard>
//                 {/* TODO: Infer types based on the tool result*/}
//                 {/* @ts-expect-error */}
//                 <Stocks props={tool.result} />
//               </BotCard>
//             ) : tool.toolName === "showStockPrice" ? (
//               <BotCard>
//                 {/* @ts-expect-error */}
//                 <Stock props={tool.result} />
//               </BotCard>
//             ) : tool.toolName === "showStockPurchase" ? (
//               <BotCard>
//                 {/* @ts-expect-error */}
//                 <Purchase props={tool.result} />
//               </BotCard>
//             ) : tool.toolName === "getEvents" ? (
//               <BotCard>
//                 {/* @ts-expect-error */}
//                 <Events props={tool.result} />
//               </BotCard>
//             ) : null;
//           })
//         ) : message.role === "user" ? (
//           <UserMessage>{message.content as string}</UserMessage>
//         ) : message.role === "assistant" &&
//           typeof message.content === "string" ? (
//           <BotMessage content={message.content} />
//         ) : null,
//     }));
// };

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
