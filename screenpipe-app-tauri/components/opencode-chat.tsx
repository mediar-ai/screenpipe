"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import type { Session, Message, Part } from "@opencode-ai/sdk/v2/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Square, FolderOpen, Terminal, RefreshCw, X, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { commands, OpencodeInfo } from "@/lib/utils/tauri";
import { cn } from "@/lib/utils";
import { MemoizedReactMarkdown } from "@/components/markdown";
import remarkGfm from "remark-gfm";
import { open } from "@tauri-apps/plugin-dialog";
import { open as openUrl } from "@tauri-apps/plugin-shell";

type OpencodeClient = ReturnType<typeof createOpencodeClient>;

interface MessageWithParts {
  message: Message;
  parts: Part[];
}

function createClient(baseUrl: string, username?: string, password?: string): OpencodeClient {
  const headers: Record<string, string> = {};
  if (username && password) {
    const token = `${username}:${password}`;
    const encoded = btoa(token);
    headers.Authorization = `Basic ${encoded}`;
  }
  return createOpencodeClient({
    baseUrl,
    headers: Object.keys(headers).length ? headers : undefined,
  });
}

export function OpenCodeChat() {
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
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if OpenCode is available on mount
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
      const newClient = createClient(
        opencodeInfo.baseUrl,
        opencodeInfo.username || undefined,
        opencodeInfo.password || undefined
      );
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
    setError(null);

    try {
      const result = await commands.opencodeStart(projectDir);
      if (result.status === "ok") {
        setOpencodeInfo(result.data);
        toast({
          title: "OpenCode Started",
          description: `Running on port ${result.data.port}`,
        });
      } else {
        setError(result.error);
        toast({
          title: "Failed to start OpenCode",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast({
        title: "Error",
        description: msg,
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
      toast({
        title: "OpenCode Stopped",
      });
    }
  };

  const loadSessions = async (c: OpencodeClient) => {
    setIsLoading(true);
    try {
      const list = await c.session.list();
      if (list.data) {
        setSessions(list.data);
        // Select most recent session
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
        setMessages(msgs.data.map(m => ({ message: m.info, parts: m.parts })));
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
      }
    } catch (e) {
      console.error("Failed to create session:", e);
      toast({
        title: "Error",
        description: "Failed to create new session",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!client || !selectedSession || !input.trim() || isSending) return;

    const content = input.trim();
    setInput("");
    setIsSending(true);
    setError(null);

    try {
      // Send message using promptAsync (non-blocking)
      await client.session.promptAsync({
        sessionID: selectedSession.id,
        parts: [{ type: "text", text: content }],
      });

      // Reload messages after a short delay
      setTimeout(async () => {
        if (client && selectedSession) {
          const msgs = await client.session.messages({ sessionID: selectedSession.id });
          if (msgs.data) {
            setMessages(msgs.data.map(m => ({ message: m.info, parts: m.parts })));
          }
        }
      }, 1000);

      // Poll for updates
      const pollInterval = setInterval(async () => {
        if (client && selectedSession) {
          const msgs = await client.session.messages({ sessionID: selectedSession.id });
          if (msgs.data) {
            setMessages(msgs.data.map(m => ({ message: m.info, parts: m.parts })));
          }
        }
      }, 2000);

      // Stop polling after 60 seconds
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsSending(false);
      }, 60000);

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setIsSending(false);
      toast({
        title: "Error sending message",
        description: msg,
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

  // Render install instructions if OpenCode is not available
  if (isAvailable === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6">
        <Terminal className="h-16 w-16 text-muted-foreground" />
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">OpenCode Not Installed</h2>
          <p className="text-muted-foreground max-w-md">
            OpenCode is an AI coding assistant. Install it to use this feature.
          </p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm text-left max-w-md w-full">
          <p className="text-muted-foreground mb-2"># Install with:</p>
          <code className="block">curl -fsSL https://opencode.ai/install | bash</code>
          <p className="text-muted-foreground mt-4 mb-2"># Or with Homebrew:</p>
          <code className="block">brew install opencode-ai/tap/opencode</code>
        </div>
        <Button variant="outline" onClick={() => openUrl("https://opencode.ai")}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Learn More
        </Button>
        <Button variant="ghost" onClick={checkAvailability}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Check Again
        </Button>
      </div>
    );
  }

  // Render loading state
  if (isAvailable === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Render setup UI if OpenCode is not running
  if (!opencodeInfo?.running) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6">
        <Terminal className="h-16 w-16 text-primary" />
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Start OpenCode</h2>
          <p className="text-muted-foreground max-w-md">
            Select a project directory to start an AI coding session.
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive rounded-lg p-4 max-w-md w-full flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm text-left whitespace-pre-wrap">{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 w-full max-w-md">
          <div className="flex gap-2">
            <Input
              value={projectDir}
              onChange={(e) => setProjectDir(e.target.value)}
              placeholder="Select project directory..."
              className="flex-1"
            />
            <Button variant="outline" onClick={selectDirectory}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={startOpenCode} disabled={isStarting || !projectDir}>
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Terminal className="h-4 w-4 mr-2" />
                Start OpenCode
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Render chat UI
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold text-sm">OpenCode</h2>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
              {opencodeInfo.projectDir}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={createNewSession} disabled={isLoading}>
            New Session
          </Button>
          <Button variant="ghost" size="sm" onClick={stopOpenCode}>
            <Square className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Sessions sidebar + Messages */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sessions list */}
        {sessions.length > 0 && (
          <div className="w-48 border-r bg-muted/30 overflow-y-auto">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => client && selectSession(client, session)}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors",
                  selectedSession?.id === session.id && "bg-muted"
                )}
              >
                <p className="font-medium truncate">
                  {session.title || "New Session"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {session.time?.created
                    ? new Date(session.time.created).toLocaleDateString()
                    : ""}
                </p>
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {isLoading && messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Terminal className="h-12 w-12 mb-4 opacity-50" />
                <p>Start a conversation with OpenCode</p>
                <p className="text-sm mt-1">Ask about your code, request changes, or get help</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.message.id}
                  className={cn(
                    "flex flex-col gap-2",
                    msg.message.role === "user" ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-4 py-2",
                      msg.message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {msg.parts.map((part) => (
                      <div key={part.id}>
                        {part.type === "text" && (
                          <MemoizedReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            className="prose prose-sm dark:prose-invert max-w-none"
                          >
                            {(part as any).text || ""}
                          </MemoizedReactMarkdown>
                        )}
                        {part.type === "tool" && (
                          <div className="text-xs font-mono bg-background/50 rounded p-2 mt-2">
                            <span className="text-muted-foreground">Tool: </span>
                            {(part as any).tool || "unknown"}
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
                <span className="text-sm">Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t bg-background">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask OpenCode anything..."
                disabled={isSending || !selectedSession}
                className="flex-1"
              />
              <Button
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
      </div>
    </div>
  );
}
