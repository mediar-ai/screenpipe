"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { listen } from "@tauri-apps/api/event";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CustomDialogContent } from "@/components/rewind/custom-dialog-content";
import { useSettings } from "@/lib/hooks/use-settings";
import { cn } from "@/lib/utils";
import { Loader2, Send, Square, Bot, User, X, Sparkles, Settings } from "lucide-react";
import { MemoizedReactMarkdown } from "@/components/markdown";
import { VideoComponent } from "@/components/rewind/video";
import { AIPresetsSelector } from "@/components/rewind/ai-presets-selector";
import { AIPreset } from "@/lib/utils/tauri";
import remarkGfm from "remark-gfm";
import OpenAI from "openai";
import { ChatCompletionTool } from "openai/resources/chat/completions";

const SCREENPIPE_API = "http://localhost:3030";

// Tool definitions for OpenAI format
const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_content",
      description: `Search screenpipe's recorded content: screen text (OCR), audio transcriptions, and UI elements.

IMPORTANT QUERY GUIDELINES:
- Start with SPECIFIC queries (app_name + short time range) before broad searches
- Use time ranges of 1-2 hours max initially. If no results, expand gradually
- For "recent" activity, use last 30-60 minutes, not hours
- For "today", search last few hours, not the whole day
- Always prefer app_name filter when user mentions specific apps
- Use limit=10 for initial searches, increase only if needed
- If results are truncated, narrow your search with more filters

GOOD query examples:
- "slack messages" → {app_name: "Slack", limit: 10, start_time: "1 hour ago"}
- "what I did" → {limit: 10, start_time: "30 mins ago"}
- "zoom meeting" → {app_name: "zoom.us", content_type: "audio", limit: 10}

BAD query examples:
- No filters with limit=100 (too broad, will timeout)
- 24-hour time range (too much data)
- Empty query with no time filter (returns everything)`,
      parameters: {
        type: "object",
        properties: {
          q: {
            type: "string",
            description: "Search keywords. Be specific. Optional but recommended.",
          },
          content_type: {
            type: "string",
            enum: ["all", "ocr", "audio", "ui"],
            description: "Filter by type. Use 'audio' for meetings/conversations, 'ocr' for screen text. Default: 'all'",
          },
          limit: {
            type: "integer",
            description: "Max results (1-20). Start with 10, only increase if needed. Default: 10",
          },
          start_time: {
            type: "string",
            description: "ISO 8601 UTC start time. IMPORTANT: Start with short ranges (30-60 mins). Example: 2024-01-15T10:00:00Z",
          },
          end_time: {
            type: "string",
            description: "ISO 8601 UTC end time. Keep range short initially.",
          },
          app_name: {
            type: "string",
            description: "Filter by app name. HIGHLY RECOMMENDED when user mentions an app. Examples: 'Google Chrome', 'Slack', 'zoom.us', 'Code', 'Terminal'",
          },
          window_name: {
            type: "string",
            description: "Filter by window title substring. Useful for specific tabs/documents.",
          },
        },
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a helpful AI assistant that can search through the user's Screenpipe data - their screen recordings, audio transcriptions, and UI interactions.

SEARCH STRATEGY (IMPORTANT):
1. Start with NARROW searches: specific app + short time range (30-60 mins)
2. If no results, gradually expand: longer time range OR broader query
3. Never search more than 2-3 hours at once initially
4. Always use app_name filter when user mentions a specific app
5. For "recent" = last 30-60 mins, "today" = last 2-3 hours, "yesterday" = specific date range
6. Use limit=10 initially, only increase if user needs more

If search returns "truncated" or "timed out", immediately retry with narrower parameters.

Rules for showing videos/audio:
- Show videos by putting .mp4 file paths in inline code blocks: \`/path/to/video.mp4\`
- Use the exact, absolute file_path from search results
- Do NOT use markdown links or multi-line code blocks for videos
- Always show relevant video/audio when answering about what user saw/heard

Be concise. Cite timestamps when relevant.

Current time: ${new Date().toISOString()}`;

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
  const pathname = usePathname();

  // Only show on timeline page (root path), hide on settings and other pages
  const isOnTimeline = pathname === "/" || pathname === "/timeline";

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activePreset, setActivePreset] = useState<AIPreset | undefined>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize active preset from settings
  useEffect(() => {
    const defaultPreset = settings.aiPresets?.find((p) => p.defaultPreset);
    setActivePreset(defaultPreset || settings.aiPresets?.[0]);
  }, [settings.aiPresets]);

  // Check if we have valid AI setup
  const hasPresets = settings.aiPresets && settings.aiPresets.length > 0;
  const hasValidModel = activePreset?.model && activePreset.model.trim() !== "";
  const needsLogin = activePreset?.provider === "screenpipe-cloud" && !settings.user?.token;
  const canChat = hasPresets && hasValidModel && !needsLogin;

  // Debug: log why chat might be disabled
  useEffect(() => {
    if (open && activePreset) {
      console.log("[GlobalChat] Active preset:", {
        id: activePreset.id,
        provider: activePreset.provider,
        model: activePreset.model,
        url: activePreset.url,
        hasValidModel,
        needsLogin,
        canChat,
      });
    }
  }, [open, activePreset, hasValidModel, needsLogin, canChat]);

  // Get error message for why chat is disabled
  const getDisabledReason = (): string | null => {
    if (!hasPresets) return "No AI presets configured";
    if (!activePreset) return "No preset selected";
    if (!hasValidModel) return `No model selected in "${activePreset.id}" preset - click edit to add one`;
    if (needsLogin) return "Login required for Screenpipe Cloud";
    return null;
  };
  const disabledReason = getDisabledReason();

  // Listen for Rust-level open-chat event (Cmd+L / Ctrl+L global shortcut)
  useEffect(() => {
    const unlisten = listen("open-chat", () => {
      setOpen((prev) => !prev);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Browser-level fallback for Cmd+L when window has focus
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
    const MAX_LIMIT = 15; // Cap results to prevent huge responses
    const MAX_RESPONSE_CHARS = 8000; // Truncate if response is too large
    const MAX_TEXT_PER_RESULT = 500; // Truncate individual result text

    try {
      const params = new URLSearchParams();
      if (args.q) params.append("q", String(args.q));
      if (args.content_type && args.content_type !== "all") {
        params.append("content_type", String(args.content_type));
      }

      // Cap limit to prevent huge queries
      const requestedLimit = args.limit ? Number(args.limit) : 10;
      const limit = Math.min(requestedLimit, MAX_LIMIT);
      params.append("limit", String(limit));

      if (args.start_time) params.append("start_time", String(args.start_time));
      if (args.end_time) params.append("end_time", String(args.end_time));
      if (args.app_name) params.append("app_name", String(args.app_name));
      if (args.window_name) params.append("window_name", String(args.window_name));

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(`${SCREENPIPE_API}/search?${params.toString()}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Search failed: ${response.status}`);

      const data = await response.json();
      const searchResults = data.data || [];
      const pagination = data.pagination || {};

      if (searchResults.length === 0) {
        return "No results found. Try: broader search terms, different app_name, wider time range, or different content_type.";
      }

      // Format results with truncation
      const formatted = searchResults.map((result: SearchResult) => {
        const content = result.content;
        if (!content) return null;

        // Truncate text content if too long
        const truncateText = (text: string | undefined) => {
          if (!text) return "";
          if (text.length > MAX_TEXT_PER_RESULT) {
            return text.substring(0, MAX_TEXT_PER_RESULT) + "... [truncated]";
          }
          return text;
        };

        if (result.type === "OCR") {
          const filePath = content.file_path ? `\nfile_path: ${content.file_path}` : "";
          return `[OCR] ${content.app_name || "?"} | ${content.window_name || "?"}\n${content.timestamp}${filePath}\n${truncateText(content.text)}`;
        } else if (result.type === "Audio") {
          const audioPath = content.audio_file_path ? `\naudio_file_path: ${content.audio_file_path}` : "";
          return `[Audio] ${content.device_name || "?"}\n${content.timestamp}${audioPath}\n${truncateText(content.transcription)}`;
        } else if (result.type === "UI") {
          const filePath = content.file_path ? `\nfile_path: ${content.file_path}` : "";
          return `[UI] ${content.app_name || "?"} | ${content.window_name || "?"}\n${content.timestamp}${filePath}\n${truncateText(content.text)}`;
        }
        return null;
      }).filter(Boolean);

      let result = formatted.join("\n---\n");
      let truncationWarning = "";

      // Check if we need to truncate the overall response
      if (result.length > MAX_RESPONSE_CHARS) {
        result = result.substring(0, MAX_RESPONSE_CHARS);
        truncationWarning = "\n\n⚠️ RESPONSE TRUNCATED - Too much data. Please retry with:\n- Narrower time range (e.g., last 30 mins instead of hours)\n- Specific app_name filter\n- Lower limit (5-10)\n- More specific search query";
      }

      const totalAvailable = pagination.total || searchResults.length;
      const header = `Results: ${searchResults.length}/${totalAvailable}${totalAvailable > searchResults.length ? " (more available - narrow search if needed)" : ""}`;

      return `${header}\n\n${result}${truncationWarning}`;
    } catch (error) {
      console.error("Search error:", error);
      if (error instanceof Error && error.name === "AbortError") {
        return "Search timed out - query too broad. Please retry with:\n- Shorter time range\n- Specific app_name\n- Lower limit (5-10)\n- More specific query";
      }
      return `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  // Get OpenAI client for current preset
  function getOpenAIClient(): OpenAI | null {
    if (!activePreset) return null;

    const apiKey =
      activePreset.provider === "screenpipe-cloud"
        ? settings.user?.token || ""
        : "apiKey" in activePreset
          ? (activePreset.apiKey as string) || ""
          : "";

    // Force correct URL for screenpipe-cloud (in case preset has wrong URL saved)
    const baseURL =
      activePreset.provider === "screenpipe-cloud"
        ? "https://ai-proxy.i-f9f.workers.dev/v1"
        : activePreset.url;

    return new OpenAI({
      apiKey,
      baseURL,
      dangerouslyAllowBrowser: true,
    });
  }

  // Send message using OpenAI SDK with streaming
  async function sendMessage(userMessage: string) {
    if (!canChat || !activePreset) return;

    const openai = getOpenAIClient();
    if (!openai) return;

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
      // Build conversation history for OpenAI format
      const conversationMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: userMessage },
      ];

      // Add placeholder for streaming response
      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, role: "assistant", content: "" },
      ]);

      let accumulatedText = "";
      let toolCalls: any[] = [];

      // First request with streaming
      const stream = await openai.chat.completions.create(
        {
          model: activePreset.model || "gpt-4",
          messages: conversationMessages,
          tools: TOOLS,
          stream: true,
        },
        { signal: abortControllerRef.current.signal }
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        // Handle text content
        if (delta?.content) {
          accumulatedText += delta.content;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: accumulatedText }
                : m
            )
          );
        }

        // Handle tool calls
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index;
            if (!toolCalls[index]) {
              toolCalls[index] = {
                id: toolCall.id || "",
                function: { name: "", arguments: "" },
              };
            }
            if (toolCall.id) toolCalls[index].id = toolCall.id;
            if (toolCall.function?.name) toolCalls[index].function.name = toolCall.function.name;
            if (toolCall.function?.arguments) toolCalls[index].function.arguments += toolCall.function.arguments;
          }
        }
      }

      // Handle tool calls if any
      if (toolCalls.length > 0) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: accumulatedText + "\n\n*Searching your data...*" }
              : m
          )
        );

        // Execute tools
        const toolResults: OpenAI.Chat.ChatCompletionMessageParam[] = [];

        // Add assistant message with tool calls
        toolResults.push({
          role: "assistant",
          content: accumulatedText || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        });

        // Execute each tool and add results
        for (const toolCall of toolCalls) {
          if (toolCall.function.name === "search_content") {
            try {
              const args = JSON.parse(toolCall.function.arguments || "{}");
              const result = await executeSearchTool(args);
              toolResults.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: result,
              });
            } catch (e) {
              toolResults.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: `Error parsing tool arguments: ${e}`,
              });
            }
          }
        }

        // Continue conversation with tool results
        accumulatedText = "";
        const continueStream = await openai.chat.completions.create(
          {
            model: activePreset.model || "gpt-4",
            messages: [...conversationMessages, ...toolResults],
            stream: true,
          },
          { signal: abortControllerRef.current?.signal }
        );

        for await (const chunk of continueStream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            accumulatedText += content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: accumulatedText }
                  : m
              )
            );
          }
        }
      }

      // Final update if no content was streamed
      if (!accumulatedText && toolCalls.length === 0) {
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

      let errorMessage = error instanceof Error ? error.message : "Something went wrong";

      // Check for common API errors and provide helpful messages
      if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
        errorMessage = "Invalid API key. Please check your preset configuration.";
      } else if (errorMessage.includes("429")) {
        errorMessage = "Rate limit exceeded. Please wait a moment and try again.";
      } else if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
        errorMessage = "Network error. Please check your internet connection and that the API endpoint is correct.";
      }

      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== assistantMessageId || m.content);
        return [
          ...filtered,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: `Error: ${errorMessage}`,
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

  // Don't render on non-timeline pages (e.g., settings)
  if (!isOnTimeline) return null;

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
            {messages.length === 0 && disabledReason && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className={cn(
                  "p-4 rounded-full",
                  needsLogin ? "bg-amber-500/10" : "bg-destructive/10"
                )}>
                  {needsLogin ? (
                    <Sparkles className="h-8 w-8 text-amber-500" />
                  ) : (
                    <Settings className="h-8 w-8 text-destructive" />
                  )}
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-semibold">
                    {!hasPresets ? "No AI Presets" : !hasValidModel ? "No Model Selected" : "Login Required"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    {disabledReason}
                  </p>
                </div>
                {!hasPresets && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      window.location.href = "/settings";
                    }}
                    className="gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Go to Settings
                  </Button>
                )}
                {hasPresets && !hasValidModel && (
                  <p className="text-xs text-muted-foreground">
                    Use the preset selector below to edit your preset and select a model
                  </p>
                )}
              </div>
            )}
            {messages.length === 0 && canChat && (
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
            {isLoading && !messages.find(m => m.content.includes("Searching")) && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* AI Preset Selector & Input */}
          <div className="border-t">
            <div className="p-2 border-b">
              <AIPresetsSelector onPresetChange={setActivePreset} />
            </div>
            <form onSubmit={handleSubmit} className="p-3">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    disabledReason
                      ? disabledReason
                      : "Ask about your screen activity..."
                  }
                  disabled={isLoading || !canChat}
                  className={cn("flex-1", disabledReason && "border-destructive/50")}
                />
                <Button
                  type={isStreaming ? "button" : "submit"}
                  size="icon"
                  disabled={(!input.trim() && !isStreaming) || !canChat}
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
          </div>
        </CustomDialogContent>
      </Dialog>
    </>
  );
}
