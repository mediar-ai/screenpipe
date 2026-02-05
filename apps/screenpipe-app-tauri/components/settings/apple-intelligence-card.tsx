"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  Sparkles,
  X,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { platform } from "@tauri-apps/plugin-os";

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

const API = "http://localhost:3030";

const SYSTEM_PROMPT = `You extract action items from screen recordings and audio transcripts.
Rules:
- Only extract clear, actionable tasks
- Each item: short, clear sentence
- Set urgency: high (deadline/urgent), medium (should do soon), low (nice to have)
- Include the app name if visible
- Respond ONLY with a JSON array, no other text
- Example: [{"text":"Review PR #42","app":"GitHub","urgency":"high"}]
- If none found, respond with: []`;

// ─── Component ──────────────────────────────────────────────────────────────

export function AppleIntelligenceCard() {
  const { toast } = useToast();
  const [os, setOs] = useState<string>("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [aiStatus, setAiStatus] = useState<
    "unknown" | "available" | "unavailable"
  >("unknown");
  const [isExtracting, setIsExtracting] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todosOpen, setTodosOpen] = useState(true);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lookbackMinutes, setLookbackMinutes] = useState(30);

  useEffect(() => {
    setOs(platform());
  }, []);

  // Load cached results
  useEffect(() => {
    try {
      const saved = localStorage?.getItem("apple-intelligence-todos");
      if (saved) {
        const parsed = JSON.parse(saved);
        setTodos(parsed.items || []);
        if (parsed.lastRun) setLastRun(new Date(parsed.lastRun));
      }
      const lb = localStorage?.getItem("apple-intelligence-lookback");
      if (lb) setLookbackMinutes(parseInt(lb));
    } catch {}
  }, []);

  // Persist
  useEffect(() => {
    try {
      localStorage?.setItem(
        "apple-intelligence-todos",
        JSON.stringify({ items: todos, lastRun: lastRun?.toISOString() })
      );
    } catch {}
  }, [todos, lastRun]);

  useEffect(() => {
    try {
      localStorage?.setItem(
        "apple-intelligence-lookback",
        String(lookbackMinutes)
      );
    } catch {}
  }, [lookbackMinutes]);

  // Check AI availability
  const checkStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/ai/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const data = await resp.json();
        setAiStatus(data.available ? "available" : "unavailable");
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

  // ─── Extract TODOs ──────────────────────────────────────────────────────

  const runExtraction = async () => {
    if (isExtracting || aiStatus !== "available") return;
    setIsExtracting(true);
    setError(null);

    try {
      // 1. Fetch recent data from screenpipe
      const now = new Date();
      const start = new Date(now.getTime() - lookbackMinutes * 60 * 1000);
      const params = new URLSearchParams({
        content_type: "all",
        start_time: start.toISOString(),
        end_time: now.toISOString(),
        limit: "50",
        min_length: "20",
      });

      const searchResp = await fetch(`${API}/search?${params}`);
      if (!searchResp.ok) throw new Error("Failed to fetch screenpipe data");
      const searchData = await searchResp.json();

      // 2. Build context string from results
      const parts: string[] = [];
      for (const item of searchData.data || []) {
        if (item.type === "OCR") {
          const c = item.content;
          const text = c?.text?.trim();
          if (text) parts.push(`[${c.app_name || "?"}] ${text}`);
        } else if (item.type === "Audio") {
          const c = item.content;
          const text = c?.transcription?.trim();
          if (text) parts.push(`[Audio] ${text}`);
        }
      }

      if (parts.length === 0) {
        setError("No recent data found");
        return;
      }

      // 3. Truncate to fit model context (~1500 chars for content)
      let context = parts.join("\n");
      if (context.length > 1500) {
        context = context.slice(0, 1500);
      }

      // 4. Single call to generic AI endpoint
      const aiResp = await fetch(`${API}/ai/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: context },
          ],
        }),
      });

      if (!aiResp.ok) {
        const err = await aiResp.json().catch(() => ({}));
        throw new Error(err.error || `AI error: ${aiResp.status}`);
      }

      const aiData = await aiResp.json();
      const raw = aiData.choices?.[0]?.message?.content || "[]";

      // 5. Parse JSON (strip markdown fences if present)
      let jsonStr = raw.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr
          .split("\n")
          .slice(1)
          .filter((l: string) => !l.startsWith("```"))
          .join("\n");
      }

      const items: TodoItem[] = JSON.parse(jsonStr);
      const valid = items.filter((t) => t.text?.trim());

      setTodos(valid);
      setLastRun(new Date());

      if (valid.length > 0) {
        toast({
          title: `Found ${valid.length} action item${valid.length > 1 ? "s" : ""}`,
        });
      } else {
        toast({ title: "No action items found" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
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
    return `${Math.floor(mins / 60)}h ago`;
  };

  const urgencyIcon = (u: string) =>
    u === "high" ? "⚡" : u === "medium" ? "●" : "○";
  const urgencyColor = (u: string) =>
    u === "high"
      ? "text-red-500"
      : u === "medium"
        ? "text-yellow-500"
        : "text-muted-foreground";

  if (os && os !== "macos") return null;

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start p-4 gap-4">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-[#147CE5] to-[#0E5FC2] flex items-center justify-center">
              <AppleLogo className="w-5 h-5 text-white" />
            </div>
          </div>

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

            <div className="flex flex-wrap items-center gap-2">
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

              <Select
                value={String(lookbackMinutes)}
                onValueChange={(v) => setLookbackMinutes(parseInt(v))}
              >
                <SelectTrigger className="h-7 text-xs w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>

              {todos.length > 0 && (
                <Button
                  onClick={() => {
                    setTodos([]);
                    setLastRun(null);
                  }}
                  variant="ghost"
                  size="sm"
                  className="gap-1 h-7 text-xs text-muted-foreground"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>

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
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
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
                        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => {
                          navigator.clipboard.writeText(todo.text);
                          toast({ title: "Copied" });
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

        {/* Error */}
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
              <span className="text-foreground">{formatLastRun(lastRun)}</span>
            </span>
            <span
              className={`ml-auto ${aiStatus === "available" ? "text-green-500" : ""}`}
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
