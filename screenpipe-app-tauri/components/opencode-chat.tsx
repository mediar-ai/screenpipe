"use client";

import { useState, useEffect, useRef } from "react";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import type { Session, Part } from "@opencode-ai/sdk/v2/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Square, FolderOpen, Terminal, Plus, LogIn } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { commands, OpencodeInfo } from "@/lib/utils/tauri";
import { cn } from "@/lib/utils";
import { MemoizedReactMarkdown } from "@/components/markdown";
import remarkGfm from "remark-gfm";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettings } from "@/lib/hooks/use-settings";

type OpencodeClient = ReturnType<typeof createOpencodeClient>;

interface MessageWithParts {
  id: string;
  role: string;
  parts: Part[];
}

function createClient(baseUrl: string): OpencodeClient {
  return createOpencodeClient({ baseUrl });
}

interface OpenCodeChatProps {
  className?: string;
}

export function OpenCodeChat({ className }: OpenCodeChatProps) {
  const { settings } = useSettings();
  const [opencodeInfo, setOpencodeInfo] = useState<OpencodeInfo | null>(null);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [projectDir, setProjectDir] = useState("");
  const [client, setClient] = useState<OpencodeClient | null>(null);

  // Session state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<MessageWithParts[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [input, setInput] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get user token from settings
  const userToken = settings?.user?.token || null;
  const isLoggedIn = !!userToken;

  // Check availability and status on mount
  useEffect(() => {
    checkAvailability();
    checkStatus();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Set up client when OpenCode is running
  useEffect(() => {
    if (opencodeInfo?.running && opencodeInfo.baseUrl) {
      const newClient = createClient(opencodeInfo.baseUrl);
      setClient(newClient);
      loadSessions(newClient);
    } else {
      setClient(null);
      setSessions([]);
      setSelectedSession(null);
      setMessages([]);
    }
  }, [opencodeInfo?.running, opencodeInfo?.baseUrl]);

  const checkAvailability = async () => {
    const result = await commands.opencodeCheck();
    if (result.status === "ok") {
      setIsAvailable(result.data.available);
    }
  };

  const checkStatus = async () => {
    const result = await commands.opencodeInfo();
    if (result.status === "ok") {
      setOpencodeInfo(result.data);
      if (result.data.projectDir) {
        setProjectDir(result.data.projectDir);
      }
    }
  };

  const selectDirectory = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Project Directory",
    });
    if (selected) {
      setProjectDir(selected as string);
    }
  };

  const startOpenCode = async () => {
    if (!projectDir) {
      toast({
        title: "Error",
        description: "Please select a project directory first",
        variant: "destructive",
      });
      return;
    }

    setIsStarting(true);

    try {
      const result = await commands.opencodeStart(projectDir, userToken || undefined);
      if (result.status === "ok") {
        setOpencodeInfo(result.data);
      } else {
        toast({
          title: "Failed to start",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const stopOpenCode = async () => {
    const result = await commands.opencodeStop();
    if (result.status === "ok") {
      setOpencodeInfo(result.data);
    }
  };

  const loadSessions = async (c: OpencodeClient) => {
    setIsLoading(true);
    try {
      const list = await c.session.list();
      if (list.data) {
        setSessions(list.data);
        if (list.data.length > 0) {
          selectSession(c, list.data[0]);
        }
      }
    } catch (e) {
      console.error("Failed to load sessions:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const selectSession = async (c: OpencodeClient, session: Session) => {
    setSelectedSession(session);
    setIsLoading(true);
    try {
      const msgs = await c.session.messages({ sessionID: session.id });
      if (msgs.data) {
        setMessages(msgs.data.map(m => ({
          id: m.info.id,
          role: m.info.role,
          parts: m.parts
        })));
      }
    } catch (e) {
      console.error("Failed to load messages:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const createNewSession = async () => {
    if (!client) return;
    setIsLoading(true);
    try {
      const result = await client.session.create({ directory: projectDir });
      if (result.data) {
        setSessions(prev => [result.data!, ...prev]);
        setSelectedSession(result.data);
        setMessages([]);
        inputRef.current?.focus();
      }
    } catch (e) {
      console.error("Failed to create session:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!client || !selectedSession || !input.trim() || isSending) return;

    const content = input.trim();
    setInput("");
    setIsSending(true);

    try {
      await client.session.promptAsync({
        sessionID: selectedSession.id,
        parts: [{ type: "text", text: content }],
      });

      // Poll for updates
      const pollInterval = setInterval(async () => {
        if (client && selectedSession) {
          const msgs = await client.session.messages({ sessionID: selectedSession.id });
          if (msgs.data) {
            setMessages(msgs.data.map(m => ({
              id: m.info.id,
              role: m.info.role,
              parts: m.parts
            })));
          }
        }
      }, 1500);

      setTimeout(() => {
        clearInterval(pollInterval);
        setIsSending(false);
      }, 60000);

    } catch (e) {
      setIsSending(false);
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Loading state
  if (isAvailable === null) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not logged in
  if (!isLoggedIn) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full p-6 text-center gap-4", className)}>
        <LogIn className="h-12 w-12 text-muted-foreground" />
        <div>
          <h3 className="font-semibold">Login Required</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to use the Code Assistant
          </p>
        </div>
      </div>
    );
  }

  // Not available (sidecar not bundled and not in PATH)
  if (isAvailable === false) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full p-6 text-center gap-4", className)}>
        <Terminal className="h-12 w-12 text-muted-foreground" />
        <div>
          <h3 className="font-semibold">Code Assistant Unavailable</h3>
          <p className="text-sm text-muted-foreground mt-1">
            This feature is coming soon
          </p>
        </div>
      </div>
    );
  }

  // Not running - show project picker
  if (!opencodeInfo?.running) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full p-6 gap-4", className)}>
        <Terminal className="h-10 w-10 text-primary" />
        <div className="text-center">
          <h3 className="font-semibold">Code Assistant</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Select a project to start coding
          </p>
        </div>
        <div className="flex gap-2 w-full max-w-sm">
          <Input
            value={projectDir}
            onChange={(e) => setProjectDir(e.target.value)}
            placeholder="~/projects/my-app"
            className="flex-1 text-sm"
          />
          <Button variant="outline" size="icon" onClick={selectDirectory}>
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={startOpenCode} disabled={isStarting || !projectDir} className="w-full max-w-sm">
          {isStarting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Starting...
            </>
          ) : (
            "Start"
          )}
        </Button>
      </div>
    );
  }

  // Running - show chat
  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b text-sm">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-muted-foreground truncate max-w-[150px]">
            {opencodeInfo.projectDir?.split("/").pop()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={createNewSession} disabled={isLoading}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={stopOpenCode}>
            <Square className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <p className="text-sm">Ask anything about your code</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col",
                msg.role === "user" ? "items-end" : "items-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {msg.parts.map((part, i) => (
                  <div key={i}>
                    {part.type === "text" && (
                      <MemoizedReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        className="prose prose-sm dark:prose-invert max-w-none"
                      >
                        {(part as any).text || ""}
                      </MemoizedReactMarkdown>
                    )}
                    {part.type === "tool" && (
                      <div className="text-xs font-mono bg-background/50 rounded px-2 py-1 mt-1">
                        {(part as any).tool}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        {isSending && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your code..."
            disabled={isSending || !selectedSession}
            className="flex-1 text-sm"
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={isSending || !input.trim() || !selectedSession}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
