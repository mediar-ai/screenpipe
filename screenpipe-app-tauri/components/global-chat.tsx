"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CustomDialogContent } from "@/components/rewind/custom-dialog-content";
import { useSettings } from "@/lib/hooks/use-settings";
import { cn } from "@/lib/utils";
import { Loader2, Send, Square, Bot, User, X, Sparkles, LogIn } from "lucide-react";
import { MemoizedReactMarkdown } from "@/components/markdown";
import { VideoComponent } from "@/components/rewind/video";
import remarkGfm from "remark-gfm";

const SCREENPIPE_API = "http://localhost:3030";
const VERTEX_PROXY = "https://ai-proxy.i-f9f.workers.dev";

// Tool definitions for Claude
const TOOLS = [
  {
    name: "search_content",
    description:
      "Search screenpipe's recorded content: screen text (OCR), audio transcriptions, and UI elements. " +
      "Returns timestamped results with app context. " +
      "Call with no parameters to get recent activity.",
    input_schema: {
      type: "object" as const,
      properties: {
        q: {
          type: "string",
          description: "Search query. Optional - omit to return all recent content.",
        },
        content_type: {
          type: "string",
          enum: ["all", "ocr", "audio", "ui"],
          description: "Content type filter. Default: 'all'",
        },
        limit: {
          type: "integer",
          description: "Max results. Default: 20",
        },
        start_time: {
          type: "string",
          description: "ISO 8601 UTC start time (e.g., 2024-01-15T10:00:00Z)",
        },
        end_time: {
          type: "string",
          description: "ISO 8601 UTC end time (e.g., 2024-01-15T18:00:00Z)",
        },
        app_name: {
          type: "string",
          description: "Filter by app (e.g., 'Google Chrome', 'Slack', 'zoom.us')",
        },
        window_name: {
          type: "string",
          description: "Filter by window title",
        },
      },
    },
  },
];

interface SearchResult {
  type: "OCR" | "Audio" | "UI";
  content: {
    text?: string;
    transcription?: string;
    timestamp: string;
    app_name?: string;
    window_name?: string;
    device_name?: string;
    file_path?: string;
    audio_file_path?: string;
  };
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function GlobalChat() {
  const [open, setOpen] = useState(false);
  const { settings } = useSettings();
  const user = settings.user;

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for Cmd+L / Ctrl+L shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Execute search tool by calling Screenpipe API
  async function executeSearchTool(args: Record<string, unknown>): Promise<string> {
    try {
      const params = new URLSearchParams();
      if (args.q) params.append("q", String(args.q));
      if (args.content_type && args.content_type !== "all") {
        params.append("content_type", String(args.content_type));
      }
      if (args.limit) params.append("limit", String(args.limit));
      else params.append("limit", "20");
      if (args.start_time) params.append("start_time", String(args.start_time));
      if (args.end_time) params.append("end_time", String(args.end_time));
      if (args.app_name) params.append("app_name", String(args.app_name));
      if (args.window_name) params.append("window_name", String(args.window_name));

      const response = await fetch(`${SCREENPIPE_API}/search?${params.toString()}`);
      if (!response.ok) throw new Error(`Search failed: ${response.status}`);

      const data = await response.json();
      const searchResults = data.data || [];
      const pagination = data.pagination || {};

      if (searchResults.length === 0) {
        return "No results found. Try broader search terms or a wider time range.";
      }

      const formatted = searchResults.map((result: SearchResult) => {
        const content = result.content;
        if (!content) return null;

        if (result.type === "OCR") {
          const filePath = content.file_path ? `\nfile_path: ${content.file_path}` : "";
          return `[OCR] ${content.app_name || "?"} | ${content.window_name || "?"}\n${content.timestamp}${filePath}\n${content.text || ""}`;
        } else if (result.type === "Audio") {
          const audioPath = content.audio_file_path ? `\naudio_file_path: ${content.audio_file_path}` : "";
          return `[Audio] ${content.device_name || "?"}\n${content.timestamp}${audioPath}\n${content.transcription || ""}`;
        } else if (result.type === "UI") {
          const filePath = content.file_path ? `\nfile_path: ${content.file_path}` : "";
          return `[UI] ${content.app_name || "?"} | ${content.window_name || "?"}\n${content.timestamp}${filePath}\n${content.text || ""}`;
        }
        return null;
      }).filter(Boolean);

      const header = `Results: ${searchResults.length}/${pagination.total || "?"}`;
      return `${header}\n\n${formatted.join("\n---\n")}`;
    } catch (error) {
      console.error("Search error:", error);
      return `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  const SYSTEM_PROMPT = `You are a helpful AI assistant that can search through the user's Screenpipe data - their screen recordings, audio transcriptions, and UI interactions.

When users ask about what they did, saw, or heard, use the search_content tool to find relevant information. Be concise in your responses and cite timestamps when relevant.

Rules for showing videos/audio:
- You can show videos to the user by putting .mp4 file paths in an inline code block like this: \`/path/to/video.mp4\`
- Use the exact, absolute file_path from search results
- Do NOT use markdown links for videos (e.g. [video](path.mp4) won't work)
- Do NOT use multi-line code blocks for videos (e.g. \`\`\`path.mp4\`\`\` won't work)
- For audio, use the audio_file_path the same way: \`/path/to/audio.mp3\`
- Always show relevant video/audio when answering questions about what the user saw or heard

Current time: ${new Date().toISOString()}`;

  // Send message to Claude via Vertex proxy with streaming
  async function sendMessage(userMessage: string) {
    if (!user?.token) {
      return; // UI already handles this case
    }

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessage,
    };

    const assistantMessageId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, newUserMessage]);
    setInput("");
    setIsLoading(true);
    setIsStreaming(true);

    abortControllerRef.current = new AbortController();

    try {
      const conversationMessages = [
        ...messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user" as const, content: userMessage },
      ];

      // Add placeholder for streaming response
      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, role: "assistant", content: "" },
      ]);

      let response = await fetch(`${VERTEX_PROXY}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          model: "claude-sonnet-4@20250514",
          max_tokens: 4096,
          stream: true,
          system: SYSTEM_PROMPT,
          messages: conversationMessages,
          tools: TOOLS,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${error}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulatedText = "";
      let toolUseBlocks: any[] = [];
      let currentToolUse: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);

              if (event.type === "content_block_start") {
                if (event.content_block?.type === "tool_use") {
                  currentToolUse = {
                    id: event.content_block.id,
                    name: event.content_block.name,
                    input: "",
                  };
                }
              } else if (event.type === "content_block_delta") {
                if (event.delta?.type === "text_delta") {
                  accumulatedText += event.delta.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, content: accumulatedText }
                        : m
                    )
                  );
                } else if (event.delta?.type === "input_json_delta" && currentToolUse) {
                  currentToolUse.input += event.delta.partial_json;
                }
              } else if (event.type === "content_block_stop" && currentToolUse) {
                try {
                  currentToolUse.input = JSON.parse(currentToolUse.input);
                } catch {
                  currentToolUse.input = {};
                }
                toolUseBlocks.push(currentToolUse);
                currentToolUse = null;
              } else if (event.type === "message_stop") {
                // Check if we need to handle tool use
                if (toolUseBlocks.length > 0) {
                  setIsLoading(true);

                  // Update message to show we're searching
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, content: accumulatedText + "\n\n*Searching your data...*" }
                        : m
                    )
                  );

                  // Execute tools
                  const toolResults = [];
                  for (const toolUse of toolUseBlocks) {
                    if (toolUse.name === "search_content") {
                      const searchResult = await executeSearchTool(toolUse.input);
                      toolResults.push({
                        type: "tool_result",
                        tool_use_id: toolUse.id,
                        content: searchResult,
                      });
                    }
                  }

                  // Build content array for assistant message
                  const assistantContent: any[] = [];
                  if (accumulatedText) {
                    assistantContent.push({ type: "text", text: accumulatedText });
                  }
                  for (const tool of toolUseBlocks) {
                    assistantContent.push({
                      type: "tool_use",
                      id: tool.id,
                      name: tool.name,
                      input: tool.input,
                    });
                  }

                  // Continue conversation with tool results
                  const continueResponse = await fetch(`${VERTEX_PROXY}/v1/messages`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${user.token}`,
                    },
                    body: JSON.stringify({
                      model: "claude-sonnet-4@20250514",
                      max_tokens: 4096,
                      stream: true,
                      system: SYSTEM_PROMPT,
                      messages: [
                        ...conversationMessages,
                        { role: "assistant", content: assistantContent },
                        { role: "user", content: toolResults },
                      ],
                      tools: TOOLS,
                    }),
                    signal: abortControllerRef.current?.signal,
                  });

                  if (!continueResponse.ok) {
                    throw new Error(`API error: ${await continueResponse.text()}`);
                  }

                  // Stream the continuation
                  const continueReader = continueResponse.body?.getReader();
                  if (continueReader) {
                    accumulatedText = ""; // Reset for new response
                    toolUseBlocks = [];

                    while (true) {
                      const { done: contDone, value: contValue } = await continueReader.read();
                      if (contDone) break;

                      const contChunk = decoder.decode(contValue, { stream: true });
                      const contLines = contChunk.split("\n");

                      for (const contLine of contLines) {
                        if (contLine.startsWith("data: ")) {
                          const contData = contLine.slice(6);
                          if (contData === "[DONE]") continue;

                          try {
                            const contEvent = JSON.parse(contData);
                            if (contEvent.type === "content_block_delta" && contEvent.delta?.type === "text_delta") {
                              accumulatedText += contEvent.delta.text;
                              setMessages((prev) =>
                                prev.map((m) =>
                                  m.id === assistantMessageId
                                    ? { ...m, content: accumulatedText }
                                    : m
                                )
                              );
                            }
                          } catch {
                            // Skip invalid JSON
                          }
                        }
                      }
                    }
                  }
                }
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }

      // Final update if no content was streamed
      if (!accumulatedText) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: "I couldn't generate a response." }
              : m
          )
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Chat error:", error);
      setMessages((prev) => {
        // Remove empty assistant message and add error
        const filtered = prev.filter((m) => m.id !== assistantMessageId || m.content);
        return [
          ...filtered,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: `Error: ${error instanceof Error ? error.message : "Something went wrong"}`,
          },
        ];
      });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  return (
    <>
      {/* Floating indicator when dialog is closed */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors shadow-sm"
        >
          <Sparkles className="h-3 w-3" />
          <span>⌘L</span>
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">AI Chat</DialogTitle>
        <CustomDialogContent
          className="p-0 max-w-2xl h-[70vh] flex flex-col"
          customClose={<X className="w-4 h-4" />}
        >
          {/* Header */}
          <div className="flex items-center gap-2 p-3 pr-10 border-b">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="font-medium">Ask about your screen activity</span>
            <span className="text-xs text-muted-foreground ml-auto">⌘L to toggle</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !user?.token && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="p-4 rounded-full bg-muted">
                  <LogIn className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-semibold">Login Required</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Sign in to your Screenpipe account to use AI chat powered by Claude.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    window.location.href = "/settings?section=account";
                  }}
                  className="gap-2"
                >
                  <LogIn className="h-4 w-4" />
                  Go to Login
                </Button>
              </div>
            )}
            {messages.length === 0 && user?.token && (
              <div className="text-center text-muted-foreground py-12">
                <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Ask me anything about your screen activity!</p>
                <p className="text-xs mt-2 opacity-70">
                  Try: "What did I do in the last hour?" or "Find my Slack messages"
                </p>
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {message.role === "user" ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>
                <div
                  className={cn(
                    "flex-1 rounded-lg px-4 py-3 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <MemoizedReactMarkdown
                    className={cn(
                      "prose prose-sm max-w-none",
                      message.role === "user" ? "prose-invert" : "dark:prose-invert"
                    )}
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p({ children }) {
                        return <p className="mb-2 last:mb-0">{children}</p>;
                      },
                      a({ href, children, ...props }) {
                        const isMediaLink = href?.toLowerCase().match(/\.(mp4|mp3|wav|webm)$/);
                        if (isMediaLink && href) {
                          return <VideoComponent filePath={href} className="my-2" />;
                        }
                        return (
                          <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                            {children}
                          </a>
                        );
                      },
                      code({ className, children, ...props }) {
                        const content = String(children).replace(/\n$/, "");
                        const isMedia = content.trim().toLowerCase().match(/\.(mp4|mp3|wav|webm)$/);

                        if (isMedia) {
                          return <VideoComponent filePath={content.trim()} className="my-2" />;
                        }

                        return (
                          <code className="px-1 py-0.5 rounded-sm bg-muted font-mono text-xs" {...props}>
                            {content}
                          </code>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </MemoizedReactMarkdown>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Searching your data...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={user?.token ? "Ask about your screen activity..." : "Sign in to use AI chat"}
                disabled={isLoading || !user?.token}
                className="flex-1"
              />
              <Button
                type={isStreaming ? "button" : "submit"}
                size="icon"
                disabled={(!input.trim() && !isStreaming) || !user?.token}
                onClick={isStreaming ? handleStop : undefined}
              >
                {isStreaming ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </CustomDialogContent>
      </Dialog>
    </>
  );
}
