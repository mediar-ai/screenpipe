"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Send,
  Loader2,
  Square,
  MessageSquare,
  X,
  Minimize2,
  Maximize2,
} from "lucide-react";
import { ChatMessage } from "./chat-message";
import { useSettings } from "@/lib/hooks/use-settings";
import { cn } from "@/lib/utils";

const SCREENPIPE_API = "http://localhost:3030";
const VERTEX_PROXY = "https://ai-proxy.i-f9f.workers.dev";

// Tool definitions for Claude
const TOOLS = [
  {
    name: "search_screenpipe",
    description:
      "Search through the user's screen recordings, audio transcriptions, and UI elements. " +
      "Returns timestamped results with app context. Use this to find what the user was doing, " +
      "what they saw on screen, what was said in meetings, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        q: {
          type: "string",
          description: "Search query text. Optional - omit to get recent activity.",
        },
        content_type: {
          type: "string",
          enum: ["all", "ocr", "audio", "ui"],
          description: "Type of content to search. 'ocr' for screen text, 'audio' for transcriptions, 'ui' for UI elements. Default: 'all'",
        },
        limit: {
          type: "integer",
          description: "Maximum number of results to return. Default: 10",
        },
        start_time: {
          type: "string",
          description: "ISO 8601 UTC start time filter (e.g., 2024-01-15T10:00:00Z)",
        },
        end_time: {
          type: "string",
          description: "ISO 8601 UTC end time filter (e.g., 2024-01-15T18:00:00Z)",
        },
        app_name: {
          type: "string",
          description: "Filter by application name (e.g., 'Google Chrome', 'Slack', 'zoom.us')",
        },
      },
    },
  },
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ScreenpipeChatProps {
  className?: string;
  defaultOpen?: boolean;
}

export function ScreenpipeChat({ className, defaultOpen = false }: ScreenpipeChatProps) {
  const { settings } = useSettings();
  const user = settings.user;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  // Execute search tool
  async function executeSearchTool(args: Record<string, unknown>): Promise<string> {
    try {
      const params = new URLSearchParams();
      if (args.q) params.append("q", String(args.q));
      if (args.content_type && args.content_type !== "all") {
        params.append("content_type", String(args.content_type));
      }
      if (args.limit) params.append("limit", String(args.limit));
      else params.append("limit", "10");
      if (args.start_time) params.append("start_time", String(args.start_time));
      if (args.end_time) params.append("end_time", String(args.end_time));
      if (args.app_name) params.append("app_name", String(args.app_name));

      const response = await fetch(`${SCREENPIPE_API}/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();
      const results = data.data || [];

      if (results.length === 0) {
        return "No results found. Try broader search terms or a wider time range.";
      }

      // Format results
      const formatted = results.map((result: any) => {
        const content = result.content;
        if (!content) return null;

        if (result.type === "OCR") {
          return `[Screen - ${content.app_name || "Unknown"}] ${content.timestamp}\n${content.text || ""}`;
        } else if (result.type === "Audio") {
          return `[Audio - ${content.device_name || "Unknown"}] ${content.timestamp}\n${content.transcription || ""}`;
        } else if (result.type === "UI") {
          return `[UI - ${content.app_name || "Unknown"}] ${content.timestamp}\n${content.text || ""}`;
        }
        return null;
      }).filter(Boolean);

      return `Found ${results.length} results:\n\n${formatted.join("\n\n---\n\n")}`;
    } catch (error) {
      console.error("Search error:", error);
      return `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  // Send message to Claude via Vertex proxy
  async function sendMessage(userMessage: string) {
    if (!user?.token) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "Please sign in to use the AI chat feature.",
        },
      ]);
      return;
    }

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessage,
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setInput("");
    setIsLoading(true);
    setIsStreaming(true);

    abortControllerRef.current = new AbortController();

    try {
      // Build conversation history
      const conversationMessages = [
        ...messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user" as const, content: userMessage },
      ];

      // Initial request with tools
      let response = await fetch(`${VERTEX_PROXY}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          model: "claude-sonnet-4@20250514",
          max_tokens: 4096,
          system: `You are a helpful AI assistant that can search through the user's Screenpipe data - their screen recordings, audio transcriptions, and UI interactions.

When users ask about what they did, saw, or heard, use the search_screenpipe tool to find relevant information. Be concise in your responses and cite timestamps when relevant.

Current time: ${new Date().toISOString()}`,
          messages: conversationMessages,
          tools: TOOLS,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${error}`);
      }

      let result = await response.json();

      // Handle tool use loop
      while (result.stop_reason === "tool_use") {
        const toolUseBlocks = result.content.filter(
          (block: any) => block.type === "tool_use"
        );

        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
          if (toolUse.name === "search_screenpipe") {
            const searchResult = await executeSearchTool(toolUse.input);
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: searchResult,
            });
          }
        }

        // Continue conversation with tool results
        response = await fetch(`${VERTEX_PROXY}/v1/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({
            model: "claude-sonnet-4@20250514",
            max_tokens: 4096,
            system: `You are a helpful AI assistant that can search through the user's Screenpipe data. Current time: ${new Date().toISOString()}`,
            messages: [
              ...conversationMessages,
              { role: "assistant", content: result.content },
              { role: "user", content: toolResults },
            ],
            tools: TOOLS,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`API error: ${error}`);
        }

        result = await response.json();
      }

      // Extract text response
      const textContent = result.content
        ?.filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("\n");

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: textContent || "I couldn't generate a response.",
        },
      ]);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : "Something went wrong"}`,
        },
      ]);
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

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg z-50",
          className
        )}
        size="icon"
      >
        <MessageSquare className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card
      className={cn(
        "fixed bottom-4 right-4 flex flex-col shadow-2xl border-border bg-background z-50",
        isMinimized ? "w-80 h-14" : "w-96 h-[500px]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <span className="font-medium">Ask Screenpipe</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? (
              <Maximize2 className="h-4 w-4" />
            ) : (
              <Minimize2 className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setIsOpen(false);
              setMessages([]);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-sm">Ask me anything about your Screenpipe data!</p>
                <p className="text-xs mt-2">
                  Try: &quot;What did I do in the last hour?&quot; or &quot;Find my Slack messages&quot;
                </p>
              </div>
            )}
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
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
          <form onSubmit={handleSubmit} className="p-3 border-t border-border">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your screen activity..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                type={isStreaming ? "button" : "submit"}
                size="icon"
                disabled={!input.trim() && !isStreaming}
                onClick={isStreaming ? handleStop : undefined}
              >
                {isStreaming ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            {!user?.token && (
              <p className="text-xs text-muted-foreground mt-2">
                Sign in to use AI chat
              </p>
            )}
          </form>
        </>
      )}
    </Card>
  );
}
