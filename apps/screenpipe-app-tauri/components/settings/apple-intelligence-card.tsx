"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  AlertCircle,
  Clock,
  Sparkles,
  X,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { platform } from "@tauri-apps/plugin-os";

// ─── Apple logo SVG ─────────────────────────────────────────────────────────
const AppleLogo = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 814 1000"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="currentColor"
  >
    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57.8-155.5-127.4c-58.3-81.6-105.6-207.2-105.6-326.4C-1.4 320.7 77.8 210.4 182.7 210.4c65.2 0 119.6 42.8 160.5 42.8 39 0 99.8-45.4 174.7-45.4 28.2 0 129.7 2.6 196.2 133.1zm-270-244.9c31.5-37 53.5-88.4 53.5-139.8 0-7.1-.6-14.3-1.9-20.1-51 1.9-111.4 33.9-147.8 76.5-27.6 31.5-56.5 82.3-56.5 134.6 0 7.8.6 15.6 1.3 18.2 2.6.6 6.5 1.3 10.4 1.3 45.9-.1 103-30.5 141-70.7z" />
  </svg>
);

// ─── Types ──────────────────────────────────────────────────────────────────

interface TodoItem {
  text: string;
  app?: string;
  urgency: "low" | "medium" | "high";
}

interface ExtractStats {
  data_sources: number;
  total_input_chars: number;
  filtered_input_chars: number;
  chunks_processed: number;
  total_time_ms: number;
}

interface AppleIntelligenceSettings {
  enabled: boolean;
  intervalMinutes: number; // 0 = manual
  lookbackMinutes: number;
  chunkSize: number;
}

const DEFAULT_SETTINGS: AppleIntelligenceSettings = {
  enabled: false,
  intervalMinutes: 0,
  lookbackMinutes: 60,
  chunkSize: 1200,
};

// Screenpipe server (same server that's already running)
const SCREENPIPE_API = "http://localhost:3030";

// ─── Component ──────────────────────────────────────────────────────────────

export function AppleIntelligenceCard() {
  const { toast } = useToast();
  const [os, setOs] = useState<string>("");
  const [settings, setSettings] =
    useState<AppleIntelligenceSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [aiStatus, setAiStatus] = useState<
    "unknown" | "available" | "unavailable"
  >("unknown");
  const [isExtracting, setIsExtracting] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todosOpen, setTodosOpen] = useState(true);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [lastStats, setLastStats] = useState<ExtractStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Platform check — only show on macOS
  useEffect(() => {
    setOs(platform());
  }, []);

  // Load settings
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage?.getItem("apple-intelligence-settings");
    } catch {}
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch {}
    }

    // Load cached todos
    let savedTodos: string | null = null;
    try {
      savedTodos = localStorage?.getItem("apple-intelligence-todos");
    } catch {}
    if (savedTodos) {
      try {
        const parsed = JSON.parse(savedTodos);
        setTodos(parsed.items || []);
        if (parsed.lastRun) setLastRun(new Date(parsed.lastRun));
      } catch {}
    }

    setSettingsLoaded(true);
  }, []);

  // Save settings
  useEffect(() => {
    if (settingsLoaded) {
      try {
        localStorage?.setItem(
          "apple-intelligence-settings",
          JSON.stringify(settings)
        );
      } catch {}
    }
  }, [settings, settingsLoaded]);

  // Save todos
  useEffect(() => {
    if (settingsLoaded) {
      try {
        localStorage?.setItem(
          "apple-intelligence-todos",
          JSON.stringify({ items: todos, lastRun: lastRun?.toISOString() })
        );
      } catch {}
    }
  }, [todos, lastRun, settingsLoaded]);

  // Check AI status via screenpipe server
  const checkStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${SCREENPIPE_API}/ai/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const data = await resp.json();
        setAiStatus(data.available ? "available" : "unavailable");
      } else if (resp.status === 404) {
        // Endpoint doesn't exist — server not built with apple-intelligence feature
        setAiStatus("unavailable");
      } else {
        setAiStatus("unavailable");
      }
    } catch {
      setAiStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  // Auto-extraction interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (
      settings.enabled &&
      settings.intervalMinutes > 0 &&
      aiStatus === "available"
    ) {
      intervalRef.current = setInterval(
        () => runExtraction(),
        settings.intervalMinutes * 60 * 1000
      );
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [settings.enabled, settings.intervalMinutes, aiStatus]);

  // ─── Extraction — single POST to screenpipe server ──────────────────────

  const runExtraction = async () => {
    if (isExtracting || aiStatus !== "available") return;

    setIsExtracting(true);
    setError(null);

    try {
      // Single call to screenpipe server — it queries DB directly,
      // pre-filters, chunks, and processes with Foundation Models.
      // No separate server, no data fetching from frontend.
      const response = await fetch(`${SCREENPIPE_API}/ai/extract-todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookback_minutes: settings.lookbackMinutes,
          chunk_size: settings.chunkSize,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.available) {
        setError("Apple Intelligence not available on this device");
        setAiStatus("unavailable");
        return;
      }

      setTodos(result.items || []);
      setLastStats(result.stats);
      setLastRun(new Date());

      if (result.items.length > 0) {
        toast({
          title: `Found ${result.items.length} action item${result.items.length > 1 ? "s" : ""}`,
          description: `Processed in ${(result.stats.total_time_ms / 1000).toFixed(1)}s`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast({
        variant: "destructive",
        title: "Extraction failed",
        description: msg,
      });
    } finally {
      setIsExtracting(false);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const copyTodos = () => {
    const text = todos
      .map(
        (t, i) =>
          `${i + 1}. ${t.text}${t.app ? ` (${t.app})` : ""}${t.urgency === "high" ? " ⚡" : ""}`
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatLastRun = (date: Date | null) => {
    if (!date) return "Never";
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const urgencyColor = (u: string) => {
    switch (u) {
      case "high":
        return "text-red-500";
      case "medium":
        return "text-yellow-500";
      default:
        return "text-muted-foreground";
    }
  };

  const urgencyIcon = (u: string) => {
    switch (u) {
      case "high":
        return "⚡";
      case "medium":
        return "●";
      default:
        return "○";
    }
  };

  // Only show on macOS
  if (os && os !== "macos") return null;

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start p-4 gap-4">
          {/* Apple Logo */}
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-[#147CE5] to-[#0E5FC2] flex items-center justify-center">
              <AppleLogo className="w-5 h-5 text-white" />
            </div>
          </div>

          {/* Header */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-foreground">
                Apple Intelligence
              </h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-full">
                on-device
              </span>
              {aiStatus === "available" && (
                <span className="px-2 py-0.5 text-xs font-medium bg-foreground text-background rounded-full">
                  available
                </span>
              )}
              {settings.enabled && settings.intervalMinutes > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-foreground/10 text-foreground rounded-full">
                  ● auto
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Extract action items from your screen & audio using on-device AI.
              {aiStatus === "unavailable" && (
                <span className="block mt-1">
                  <AlertCircle className="h-3 w-3 inline mr-1" />
                  Requires macOS 26+ with Apple Intelligence enabled.
                </span>
              )}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setIsExpanded(!isExpanded)}
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
              >
                {isExpanded ? "Hide" : "Configure"}
              </Button>

              <Button
                onClick={runExtraction}
                disabled={isExtracting || aiStatus !== "available"}
                size="sm"
                className="gap-1.5 h-7 text-xs"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    Extract TODOs
                  </>
                )}
              </Button>

              {todos.length > 0 && (
                <Button
                  onClick={() => {
                    setTodos([]);
                    setLastRun(null);
                    setLastStats(null);
                  }}
                  variant="ghost"
                  size="sm"
                  className="gap-1 h-7 text-xs text-muted-foreground"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Settings panel */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Lookback</Label>
                <Select
                  value={String(settings.lookbackMinutes)}
                  onValueChange={(v) =>
                    setSettings((s) => ({
                      ...s,
                      lookbackMinutes: parseInt(v),
                    }))
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                    <SelectItem value="240">4 hours</SelectItem>
                    <SelectItem value="480">8 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Auto-run</Label>
                <Select
                  value={String(settings.intervalMinutes)}
                  onValueChange={(v) =>
                    setSettings((s) => ({
                      ...s,
                      intervalMinutes: parseInt(v),
                      enabled: parseInt(v) > 0,
                    }))
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Manual</SelectItem>
                    <SelectItem value="5">5 min</SelectItem>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Chunk size</Label>
                <Select
                  value={String(settings.chunkSize)}
                  onValueChange={(v) =>
                    setSettings((s) => ({
                      ...s,
                      chunkSize: parseInt(v),
                    }))
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="800">800 chars</SelectItem>
                    <SelectItem value="1200">1200 chars</SelectItem>
                    <SelectItem value="1600">1600 chars</SelectItem>
                    <SelectItem value="2000">2000 chars</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {lastStats && (
              <div className="text-[10px] text-muted-foreground bg-muted/50 rounded p-2 font-mono">
                {lastStats.data_sources} sources ·{" "}
                {lastStats.total_input_chars.toLocaleString()} chars ·{" "}
                {lastStats.chunks_processed} chunks ·{" "}
                {(lastStats.total_time_ms / 1000).toFixed(1)}s
              </div>
            )}
          </div>
        )}

        {/* TODO items */}
        {todos.length > 0 && (
          <div className="border-t border-border">
            <Collapsible open={todosOpen} onOpenChange={setTodosOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full px-4 py-2 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    {todosOpen ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="text-xs font-medium">Action Items</span>
                    <Badge
                      variant="secondary"
                      className="h-4 px-1.5 text-[10px]"
                    >
                      {todos.length}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyTodos();
                    }}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy all
                      </>
                    )}
                  </Button>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-3 space-y-1">
                  {todos.map((todo, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted/50 group"
                    >
                      <span
                        className={`text-xs mt-0.5 ${urgencyColor(todo.urgency)}`}
                        title={todo.urgency}
                      >
                        {urgencyIcon(todo.urgency)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground leading-relaxed">
                          {todo.text}
                        </p>
                        {todo.app && (
                          <span className="text-[10px] text-muted-foreground">
                            {todo.app}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          navigator.clipboard.writeText(todo.text);
                          toast({
                            title: "Copied",
                            description: todo.text.slice(0, 50),
                          });
                        }}
                      >
                        <Copy className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="px-4 py-2 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-red-500">
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{error}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 ml-auto"
                onClick={() => setError(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Status bar */}
        <div className="px-4 py-2 bg-muted/50 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Last:{" "}
              <span className="text-foreground">
                {formatLastRun(lastRun)}
              </span>
            </span>
            {settings.enabled && settings.intervalMinutes > 0 && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                Every {settings.intervalMinutes}m
              </span>
            )}
            <span
              className={`ml-auto ${aiStatus === "available" ? "text-green-500" : "text-muted-foreground"}`}
            >
              {aiStatus === "available"
                ? "● on-device"
                : aiStatus === "unavailable"
                  ? "○ not available"
                  : "○ checking..."}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
