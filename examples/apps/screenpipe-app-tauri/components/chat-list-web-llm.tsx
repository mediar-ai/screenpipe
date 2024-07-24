// ignore all file ts errors
// @ts-nocheck

import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect, useCallback } from "react";
import {
  CreateMLCEngine,
  MLCEngineInterface,
  prebuiltAppConfig,
} from "@mlc-ai/web-llm";

// Add this new function to handle screenpipe requests
async function queryScreenpipe(params: {
  q: string;
  offset: number;
  limit: number;
  start_date: string;
  end_date: string;
}) {
  try {
    const queryParams = new URLSearchParams({
      q: params.q,
      offset: params.offset.toString(),
      limit: params.limit.toString(),
      start_date: params.start_date,
      end_date: params.end_date,
    });
    const response = await fetch(`http://localhost:3030/search?${queryParams}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error querying screenpipe:", error);
    return null;
  }
}

function useWebLLM(modelName: string = "Llama-3.1-8B-Instruct-q4f32_1-MLC") {
  const [engine, setEngine] = useState<MLCEngineInterface | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initEngine() {
      try {
        const appConfig = prebuiltAppConfig;
        appConfig.useIndexedDBCache = true;
        console.log(appConfig.model_list);
        const newEngine = await CreateMLCEngine(modelName, {
          appConfig,
          initProgressCallback: (progress) => {
            console.log("Loading progress:", progress);
          },
        });

        setEngine(newEngine);
        setIsLoading(false);
      } catch (err) {
        setError("Failed to initialize the engine: " + (err as Error).message);
        setIsLoading(false);
      }
    }
    console.log("initEngine");
    initEngine();
  }, [modelName]);

  const streamChat = useCallback(
    async (
      messages: Array<{ role: string; content: string }>,
      onChunk: (chunk: string) => void
    ) => {
      if (!engine) return;

      const chunks = await engine.chat.completions.create({
        messages,
        temperature: 0.7,
        stream: true,
        functions: [
          {
            name: "query_screenpipe",
            description: `Query the local screenpipe instance for relevant information
            
Screenpipe is a product running on the user computer which records his screens and microphones \
24/7 and can be used to answer any questions about the user's activity.
Use this function to answer any questions about the user's activity.
            `,
            parameters: {
              type: "object",
              properties: {
                q: {
                  type: "string",
                  description: "The query to send to screenpipe",
                },
                offset: {
                  type: "number",
                  description: "The offset for pagination",
                },
                limit: {
                  type: "number",
                  description: "The limit for pagination",
                },
                start_date: {
                  type: "string",
                  description: "The start date for the query in ISO format",
                },
                end_date: {
                  type: "string",
                  description: "The end date for the query in ISO format",
                },
              },
              required: ["q", "offset", "limit", "start_date", "end_date"],
            },
          },
        ],
        function_call: "auto",
      });

      for await (const chunk of chunks) {
        const content = JSON.stringify(chunk.choices[0]?.delta) || "";
        onChunk(content);
      }
    },
    [engine]
  );
  const askQuestion = useCallback(
    async (question: string) => {
      if (!engine) return;

      const response = await engine.chat.completions.create({
        messages: [{ role: "user", content: question }],
        temperature: 0.7,
      });

      return response.choices[0]?.message.content;
    },
    [engine]
  );

  return { engine, isLoading, error, streamChat, askQuestion };
}

export function ChatList() {
  const { isLoading, error, streamChat, askQuestion } = useWebLLM();
  const [messages, setMessages] = useState<
    Array<{ role: string; content: string }>
  >([]);
  const [inputMessage, setInputMessage] = useState("");

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const newMessages = [...messages, { role: "user", content: inputMessage }];
    setMessages(newMessages);
    setInputMessage("");

    let aiResponse = "";
    await streamChat(newMessages, async (chunk) => {
      try {
        const parsedChunk = JSON.parse(chunk);
        if (parsedChunk.choices && parsedChunk.choices[0]?.delta?.content) {
          // Regular content
          aiResponse += parsedChunk.choices[0].delta.content;
          setMessages([
            ...newMessages,
            { role: "assistant", content: aiResponse },
          ]);
        } else if (
          parsedChunk.choices &&
          parsedChunk.choices[0]?.delta?.function_call
        ) {
          // Function call
          const functionCall = parsedChunk.choices[0].delta.function_call;
          if (functionCall.name === "query_screenpipe") {
            const args = JSON.parse(functionCall.arguments);
            const screenpipeResult = await queryScreenpipe(args);

            // Send the screenpipe result back to the AI
            const functionResponse = `Screenpipe query result: ${JSON.stringify(
              screenpipeResult
            )}`;
            aiResponse += "Querying Screenpipe... ";
            setMessages([
              ...newMessages,
              { role: "assistant", content: aiResponse },
            ]);

            // Continue the conversation with the AI
            await streamChat(
              [...newMessages, { role: "function", content: functionResponse }],
              (newChunk) => {
                try {
                  const parsedNewChunk = JSON.parse(newChunk);
                  if (
                    parsedNewChunk.choices &&
                    parsedNewChunk.choices[0]?.delta?.content
                  ) {
                    aiResponse += parsedNewChunk.choices[0].delta.content;
                    setMessages([
                      ...newMessages,
                      { role: "assistant", content: aiResponse },
                    ]);
                  }
                } catch (error) {
                  console.error(
                    "Error processing function response chunk:",
                    error
                  );
                }
              }
            );
          }
        }
      } catch (error) {
        // If parsing fails, it's likely not JSON, so just append the chunk
        console.error("Error processing chunk:", error);
        aiResponse += chunk;
        setMessages([
          ...newMessages,
          { role: "assistant", content: aiResponse },
        ]);
      }
    });
  };
  return (
    <div className="grid md:grid-cols-[520] min-h-screen w-full">
      <div className="flex flex-col">
        <div className="sticky top-0 p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
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
        <div className="flex flex-col items-start flex-1 max-w-2xl gap-8 px-4 mx-auto">
          {isLoading && <p>Loading WebLLM engine...</p>}
          {error && <p className="text-red-500">{error}</p>}
          {messages.map((msg, index) => (
            <div key={index} className="flex items-start gap-4">
              <Avatar className="w-6 h-6 border">
                <AvatarImage
                  src={
                    msg.role === "user"
                      ? "/placeholder-user.jpg"
                      : "/placeholder-ai.jpg"
                  }
                />
                <AvatarFallback>
                  {msg.role === "user" ? "YO" : "📺"}
                </AvatarFallback>
              </Avatar>
              <div className="grid gap-1">
                <div className="font-bold">
                  {msg.role === "user" ? "You" : "screen | ⭐️"}
                </div>
                <div className="prose text-muted-foreground">
                  <p>{msg.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
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
