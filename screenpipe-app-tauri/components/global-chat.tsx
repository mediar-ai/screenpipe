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
import { Loader2, Send, Square, User, X, Settings, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PipeAIIcon, PipeAIIconLarge } from "@/components/pipe-ai-icon";
import { MemoizedReactMarkdown } from "@/components/markdown";
import { VideoComponent } from "@/components/rewind/video";
import { AIPresetsSelector } from "@/components/rewind/ai-presets-selector";
import { AIPreset } from "@/lib/utils/tauri";
import remarkGfm from "remark-gfm";
import OpenAI from "openai";
import { ChatCompletionTool } from "openai/resources/chat/completions";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { usePlatform } from "@/lib/hooks/use-platform";
import { useTimelineSelection } from "@/lib/hooks/use-timeline-selection";
import { commands } from "@/lib/utils/tauri";

const SCREENPIPE_API = "http://localhost:3030";

// Suggestion badges for timeline selection
const TIMELINE_SUGGESTIONS = [
  "what did i work on?",
  "summarize this period",
  "what apps did i use?",
];

// Tool definitions for OpenAI format
const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_content",
      description: `Search screenpipe's recorded content: screen text (OCR), audio transcriptions, and UI elements.

**MANDATORY**: start_time is REQUIRED for every search. Database has 600k+ entries - searches without time bounds WILL timeout.

RULES:
- ALWAYS include start_time (required) - default to 1-2 hours ago
- Use app_name filter whenever user mentions an app
- Keep limit=5-10, never higher initially
- If query times out, retry with shorter time range (30 mins)

EXAMPLES:
✓ {start_time: "1 hour ago", limit: 10}
✓ {app_name: "Slack", start_time: "2 hours ago", limit: 5}
✗ {limit: 100} - NO start_time = WILL TIMEOUT
✗ {start_time: "24 hours ago"} - too broad, will timeout`,
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

CRITICAL SEARCH RULES (database has 600k+ entries - ALWAYS use time filters):
1. ALWAYS include start_time in EVERY search - NEVER search without a time range
2. Default time range: last 1-2 hours. Expand ONLY if no results found
3. ALWAYS use app_name filter when user mentions ANY app
4. Keep limit=5-10 initially, never higher unless user explicitly needs more
5. "recent" = last 30 mins, "today" = last 2 hours, "yesterday" = yesterday's date range
6. If search times out, IMMEDIATELY retry with narrower time range (e.g., 30 mins instead of 2 hours)

NEVER search without start_time - queries without time bounds will timeout on large databases.

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
  const { isMac } = usePlatform();
  const { selectionRange, setSelectionRange } = useTimelineSelection();

  // Only show floating button on timeline page, but keep dialog available everywhere
  // pathname can be null during initial hydration
  const isOnTimeline = !pathname || pathname === "/" || pathname === "/timeline";

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

  // Focus input when opening, reset state when closing
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      // Reset chat state when dialog closes
      setMessages([]);
      setInput("");
      // Clear timeline selection when closing
      setSelectionRange(null);
    }
  }, [open, setSelectionRange]);

  // Close chat when leaving timeline
  useEffect(() => {
    if (!isOnTimeline && open) {
      setOpen(false);
    }
  }, [isOnTimeline, open]);

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

      // Add timeout to prevent hanging - 30s to handle large datasets
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

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
        return "Search timed out (30s limit exceeded). The database has 600k+ entries. RETRY with:\n- start_time within last 30-60 minutes (REQUIRED)\n- Specific app_name filter\n- limit=5\nNEVER search without a time range.";
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
      // Build system prompt with selection context if available
      let systemPrompt = SYSTEM_PROMPT;
      if (selectionRange) {
        const startTime = selectionRange.start.toISOString();
        const endTime = selectionRange.end.toISOString();
        systemPrompt += `\n\nIMPORTANT: The user has selected a specific time range on their timeline. Focus your searches on this period:
- Start time: ${startTime}
- End time: ${endTime}

Always use these exact start_time and end_time values when searching, unless the user explicitly asks about a different time period.`;
      }

      // Build conversation history for OpenAI format
      const conversationMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
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

  return (
    <>
      {/* Floating indicator when dialog is closed - only on timeline */}
      <AnimatePresence>
      {!open && isOnTimeline && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-50 group flex items-center gap-2 px-3 py-2 rounded-lg bg-background/90 backdrop-blur-md border border-border/50 hover:border-foreground/20 text-xs text-muted-foreground hover:text-foreground transition-all duration-200 shadow-lg shadow-black/5"
        >
          <div className="p-1 rounded bg-foreground/5 group-hover:bg-foreground/10 transition-colors">
            <PipeAIIcon size={14} animated={false} />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider">{isMac ? "⌘L" : "Ctrl+L"}</span>
        </motion.button>
      )}
      </AnimatePresence>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">AI Chat</DialogTitle>
        <CustomDialogContent
          className="p-0 max-w-2xl h-[70vh] flex flex-col overflow-hidden bg-background/95 backdrop-blur-xl border-border/50"
          customClose={<X className="w-4 h-4" />}
        >
          {/* Header - sleek geometric style */}
          <div className="relative flex items-center gap-3 px-4 py-3 pr-12 border-b border-border/50 bg-gradient-to-r from-background to-muted/30">
            {/* Geometric corner accent */}
            <div className="absolute top-0 left-0 w-8 h-8 border-l-2 border-t-2 border-foreground/10 rounded-tl-lg" />

            <div className="relative z-10 p-1.5 rounded-lg bg-foreground/5 border border-border/50">
              <PipeAIIcon size={18} animated={false} className="text-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-sm tracking-tight">Pipe AI</h2>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Screen Activity Assistant</p>
            </div>
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted/50 border border-border/50 rounded">
              {isMac ? "⌘" : "Ctrl"}+L
            </kbd>
          </div>

          {/* Messages - with subtle pattern background */}
          <div className="relative flex-1 overflow-y-auto p-4 space-y-4">
            {/* Subtle geometric background pattern */}
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23000' stroke-width='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E")`,
            }} />

            {messages.length === 0 && disabledReason && (
              <div className="relative flex flex-col items-center justify-center py-12 space-y-4">
                <div className={cn(
                  "relative p-6 rounded-2xl border",
                  needsLogin
                    ? "bg-muted/50 border-border/50"
                    : "bg-destructive/5 border-destructive/20"
                )}>
                  {/* Corner accents */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-current opacity-20 rounded-tl" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2 border-current opacity-20 rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-l-2 border-b-2 border-current opacity-20 rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-current opacity-20 rounded-br" />

                  {needsLogin ? (
                    <PipeAIIconLarge size={48} className="text-muted-foreground" />
                  ) : (
                    <Settings className="h-12 w-12 text-destructive/70" />
                  )}
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-semibold tracking-tight">
                    {!hasPresets ? "No AI Presets" : !hasValidModel ? "No Model Selected" : "Login Required"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    {disabledReason}
                  </p>
                </div>
                {needsLogin && (
                  <Button
                    variant="default"
                    onClick={() => openUrl("https://screenpi.pe/login")}
                    className="gap-2 font-medium"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Login
                  </Button>
                )}
                {!hasPresets && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      setOpen(false);
                      await commands.showWindow({ Settings: { page: null } });
                    }}
                    className="gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Go to Settings
                  </Button>
                )}
                {hasPresets && !hasValidModel && (
                  <p className="text-xs text-muted-foreground font-mono">
                    Use the preset selector below to configure a model
                  </p>
                )}
              </div>
            )}
            {messages.length === 0 && canChat && (
              <div className="relative text-center py-12">
                {/* Geometric frame around icon */}
                <div className="relative mx-auto mb-6 w-fit">
                  <div className="absolute -inset-4 border border-dashed border-border/50 rounded-xl" />
                  <div className="absolute -inset-2 border border-border/30 rounded-lg" />
                  <PipeAIIconLarge size={56} thinking={false} className="relative text-foreground/80" />
                </div>

                {selectionRange ? (
                  <>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 bg-muted/50 border border-border/50 rounded-full">
                      <div className="w-1.5 h-1.5 bg-foreground/50 rounded-full" />
                      <span className="text-xs font-mono text-foreground/70">
                        {selectionRange.start.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {" → "}
                        {selectionRange.end.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-5 uppercase tracking-wider font-medium">Ask about this time period</p>
                    <div className="flex flex-wrap gap-2 justify-center max-w-md mx-auto">
                      {TIMELINE_SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => {
                            setInput(suggestion);
                            setTimeout(() => {
                              const form = document.querySelector('form') as HTMLFormElement;
                              if (form) form.requestSubmit();
                            }, 50);
                          }}
                          className="group px-4 py-2 text-xs bg-background hover:bg-muted border border-border/50 hover:border-border rounded-lg text-muted-foreground hover:text-foreground transition-all duration-200"
                        >
                          <span className="opacity-50 group-hover:opacity-100 transition-opacity mr-1">→</span>
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-base font-medium mb-2 text-foreground">Ask about your screen activity</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      Search your recordings, transcriptions, and interactions
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center max-w-sm mx-auto text-xs text-muted-foreground">
                      <span className="px-2 py-1 bg-muted/30 rounded border border-border/30 font-mono">&quot;What did I do in the last hour?&quot;</span>
                      <span className="px-2 py-1 bg-muted/30 rounded border border-border/30 font-mono">&quot;Find my Slack messages&quot;</span>
                    </div>
                  </>
                )}
              </div>
            )}
            <AnimatePresence mode="popLayout">
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "relative flex gap-3",
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    message.role === "user"
                      ? "bg-foreground text-background border-foreground"
                      : "bg-muted/50 text-foreground border-border/50"
                  )}
                >
                  {message.role === "user" ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <PipeAIIcon size={16} animated={false} />
                  )}
                </div>
                <div
                  className={cn(
                    "relative flex-1 rounded-xl px-4 py-3 text-sm border",
                    message.role === "user"
                      ? "bg-foreground text-background border-foreground"
                      : "bg-muted/30 border-border/50"
                  )}
                >
                  {/* Subtle corner accent on AI messages */}
                  {message.role === "assistant" && (
                    <div className="absolute top-0 left-0 w-3 h-3 border-l border-t border-foreground/10 rounded-tl-xl" />
                  )}
                  <MemoizedReactMarkdown
                    className={cn(
                      "prose prose-sm max-w-none",
                      message.role === "user" ? "prose-invert" : "dark:prose-invert"
                    )}
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p({ children }) {
                        return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
                      },
                      a({ href, children, ...props }) {
                        const isMediaLink = href?.toLowerCase().match(/\.(mp4|mp3|wav|webm)$/);
                        if (isMediaLink && href) {
                          return <VideoComponent filePath={href} className="my-2" />;
                        }
                        return (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" {...props}>
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
                          <code className="px-1.5 py-0.5 rounded bg-background/50 border border-border/50 font-mono text-xs" {...props}>
                            {content}
                          </code>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </MemoizedReactMarkdown>
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
            {isLoading && !messages.find(m => m.content.includes("Searching")) && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-xl border border-border/50 w-fit"
              >
                <PipeAIIcon size={18} thinking={true} className="text-foreground/70" />
                <span className="text-sm text-muted-foreground font-medium">Processing...</span>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* AI Preset Selector & Input - refined styling */}
          <div className="relative border-t border-border/50 bg-gradient-to-t from-muted/20 to-transparent">
            {/* Geometric accent line */}
            <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

            <div className="p-2 border-b border-border/30">
              <AIPresetsSelector onPresetChange={setActivePreset} />
            </div>
            <form onSubmit={handleSubmit} className="p-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
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
                    className={cn(
                      "flex-1 bg-background/50 border-border/50 focus:border-foreground/30 focus:ring-foreground/10 transition-colors",
                      disabledReason && "border-destructive/50"
                    )}
                  />
                </div>
                <Button
                  type={isStreaming ? "button" : "submit"}
                  size="icon"
                  disabled={(!input.trim() && !isStreaming) || !canChat}
                  onClick={isStreaming ? handleStop : undefined}
                  className={cn(
                    "shrink-0 transition-all duration-200",
                    isStreaming
                      ? "bg-destructive hover:bg-destructive/90"
                      : "bg-foreground hover:bg-foreground/90 text-background"
                  )}
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
