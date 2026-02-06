"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { platform } from "@tauri-apps/plugin-os";
import { Command } from "@tauri-apps/plugin-shell";

const API = "http://localhost:3030";

interface DailySummary {
  date: string; // YYYY-MM-DD
  generatedAt: string;
  timeBreakdown: { app: string; minutes: number }[];
  keyMoments: { time: string; description: string }[];
  actionItems: { text: string; urgency: "high" | "medium" | "low" }[];
  peopleMentioned: { name: string; context: string }[];
  oneLiner: string;
}

const SUMMARY_SYSTEM_PROMPT = `You generate daily summaries of the user's screen activity and audio. You have access to a search tool to query their data. Use it to gather information, then produce a summary.`;

const SUMMARY_JSON_SCHEMA = {
  type: "object",
  properties: {
    oneLiner: { type: "string", description: "casual 1-sentence summary of the day" },
    timeBreakdown: {
      type: "array",
      items: {
        type: "object",
        properties: {
          app: { type: "string" },
          minutes: { type: "number" },
        },
        required: ["app", "minutes"],
      },
      description: "top 5 apps by usage, estimate minutes from context",
    },
    keyMoments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          time: { type: "string" },
          description: { type: "string" },
        },
        required: ["time", "description"],
      },
      description: "max 5 most important events",
    },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          urgency: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["text", "urgency"],
      },
      description: "things the user needs to do",
    },
    peopleMentioned: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          context: { type: "string" },
        },
        required: ["name", "context"],
      },
      description: "real people names only, not apps",
    },
  },
  required: ["oneLiner", "timeBreakdown", "keyMoments", "actionItems", "peopleMentioned"],
};

const SEARCH_TOOL = {
  type: "function" as const,
  function: {
    name: "search_screenpipe",
    description: "Search the user's screen recordings (OCR) and audio transcriptions captured by Screenpipe. Returns text content with timestamps and app names.",
    parameters: {
      type: "object",
      properties: {
        content_type: {
          type: "string",
          enum: ["ocr", "audio", "all"],
          description: "Type of content to search. Use 'ocr' for screen text, 'audio' for transcriptions, 'all' for both.",
        },
        start_time: {
          type: "string",
          description: "ISO 8601 start time for the search range",
        },
        end_time: {
          type: "string",
          description: "ISO 8601 end time for the search range",
        },
        limit: {
          type: "integer",
          description: "Maximum number of results to return (1-50)",
        },
        app_name: {
          type: "string",
          description: "Filter by application name",
        },
      },
      required: ["start_time"],
    },
  },
};

function getStorageKey(date: string) {
  return `daily-summary-${date}`;
}

function loadSummary(date: string): DailySummary | null {
  try {
    const raw = localStorage?.getItem(getStorageKey(date));
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveSummary(summary: DailySummary) {
  try {
    localStorage?.setItem(getStorageKey(summary.date), JSON.stringify(summary));
  } catch {}
}

function isAppleIntelligenceEnabled(): boolean {
  try {
    return localStorage?.getItem("apple-intelligence-enabled") !== "false";
  } catch {
    return true;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

async function isPluggedIn(): Promise<boolean> {
  try {
    const os = platform();
    if (os !== "macos") return true; // assume plugged in on non-mac

    const cmd = Command.create("exec-sh", [
      "-c",
      "pmset -g batt | head -1",
    ]);
    const output = await cmd.execute();
    return output.stdout.includes("AC Power");
  } catch {
    return true; // assume plugged in if detection fails
  }
}

async function checkAiAvailable(): Promise<boolean> {
  try {
    const resp = await fetch(`${API}/ai/status`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.available === true;
  } catch {
    return false;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DailySummaryCard({
  currentDate,
}: {
  currentDate: Date;
}) {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTriggeredRef = useRef<string>("");

  const dateStr =
    currentDate.getFullYear() +
    "-" +
    String(currentDate.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(currentDate.getDate()).padStart(2, "0");

  // Check AI availability
  useEffect(() => {
    const os = platform();
    if (os !== "macos") return;

    checkAiAvailable().then((available) => {
      setAiAvailable(available);
      setIsVisible(available && isAppleIntelligenceEnabled());
    });
  }, []);

  // Load cached summary when date changes
  useEffect(() => {
    const cached = loadSummary(dateStr);
    setSummary(cached);
    setIsExpanded(false);
    setError(null);
  }, [dateStr]);

  // Auto-trigger at 6pm for today
  useEffect(() => {
    if (!aiAvailable || !isVisible) return;

    const checkAutoTrigger = async () => {
      const now = new Date();
      const todayStr =
        now.getFullYear() +
        "-" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(now.getDate()).padStart(2, "0");

      // Only auto-trigger for today, after 6pm, once per day
      if (dateStr !== todayStr) return;
      if (now.getHours() < 18) return;
      if (autoTriggeredRef.current === todayStr) return;
      if (loadSummary(todayStr)) return;

      // Check if plugged in
      const plugged = await isPluggedIn();
      if (!plugged) return;

      autoTriggeredRef.current = todayStr;
      generateSummary();
    };

    checkAutoTrigger();
    const interval = setInterval(checkAutoTrigger, 60000); // check every minute
    return () => clearInterval(interval);
  }, [aiAvailable, isVisible, dateStr]);

  // ─── Generate Summary (Apple Intelligence agent loop) ─────────────────

  const generateSummary = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError(null);

    try {
      // Check power state
      const plugged = await isPluggedIn();
      if (!plugged) {
        setError("Waiting for power — summaries only generate when plugged in");
        return;
      }

      const dayStart = new Date(dateStr + "T00:00:00");
      const dayEnd = new Date(dateStr + "T23:59:59");
      const now = new Date();
      const endTime = dayEnd > now ? now : dayEnd;

      // ── Turn 1: Ask Apple Intelligence to search, providing the tool ──
      const turn1Resp = await fetch(`${API}/ai/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: SUMMARY_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Generate a daily summary for ${dateStr}. Search for screen activity (OCR) and audio transcriptions between ${dayStart.toISOString()} and ${endTime.toISOString()}.`,
            },
          ],
          tools: [SEARCH_TOOL],
        }),
      });

      if (!turn1Resp.ok) throw new Error(`AI error: ${turn1Resp.status}`);
      const turn1Data = await turn1Resp.json();
      const turn1Msg = turn1Data.choices?.[0]?.message;

      // ── Execute tool calls (gather data) ──
      // Build conversation history for the final turn
      const messages: any[] = [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Generate a daily summary for ${dateStr}. Search for screen activity (OCR) and audio transcriptions between ${dayStart.toISOString()} and ${endTime.toISOString()}.`,
        },
      ];

      let hasData = false;

      if (turn1Msg?.tool_calls?.length) {
        // Model requested tool calls — execute them
        messages.push({
          role: "assistant",
          content: turn1Msg.content || null,
          tool_calls: turn1Msg.tool_calls,
        });

        for (const tc of turn1Msg.tool_calls) {
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments); } catch {}

          const searchParams = new URLSearchParams({
            content_type: args.content_type || "all",
            start_time: args.start_time || dayStart.toISOString(),
            end_time: args.end_time || endTime.toISOString(),
            limit: String(Math.min(args.limit || 50, 50)),
            min_length: "20",
          });
          if (args.app_name) searchParams.set("app_name", args.app_name);

          const searchResp = await fetch(`${API}/search?${searchParams}`);
          const searchData = searchResp.ok ? await searchResp.json() : { data: [], pagination: { total: 0 } };
          const total = searchData.pagination?.total || 0;

          // Format results compactly
          const entries = (searchData.data || []).map((item: any) => {
            if (item.type === "OCR") {
              const c = item.content;
              const time = new Date(c.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
              return `[${time}] [${c.app_name || "?"}] ${(c.text || "").trim().slice(0, 120)}`;
            } else if (item.type === "Audio") {
              const c = item.content;
              const time = new Date(c.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
              const speaker = c.speaker?.name ? ` (${c.speaker.name})` : "";
              return `[${time}] [Audio${speaker}] ${(c.transcription || "").trim().slice(0, 120)}`;
            }
            return null;
          }).filter(Boolean);

          if (entries.length > 0) hasData = true;

          // Truncate tool result to ~6000 chars to stay within context limits
          let resultText = `Found ${total} entries (showing ${entries.length}):\n${entries.join("\n")}`;
          if (resultText.length > 6000) resultText = resultText.slice(0, 6000);

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: resultText,
          });
        }
      } else {
        // Model didn't use tools — fall back to fetching data ourselves
        const params = new URLSearchParams({
          content_type: "all",
          start_time: dayStart.toISOString(),
          end_time: endTime.toISOString(),
          limit: "50",
          min_length: "20",
        });
        const searchResp = await fetch(`${API}/search?${params}`);
        if (!searchResp.ok) throw new Error("Failed to fetch data");
        const searchData = await searchResp.json();

        const parts: string[] = [];
        for (const item of searchData.data || []) {
          if (item.type === "OCR") {
            const c = item.content;
            const text = c?.text?.trim();
            if (text) {
              const time = new Date(c.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
              parts.push(`[${time}] [${c.app_name || "?"}] ${text.slice(0, 120)}`);
            }
          } else if (item.type === "Audio") {
            const c = item.content;
            const text = c?.transcription?.trim();
            if (text) {
              const time = new Date(c.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
              parts.push(`[${time}] [Audio] ${text.slice(0, 120)}`);
            }
          }
        }

        if (parts.length > 0) hasData = true;

        // Use the direct text response as a user message for the final turn
        let context = parts.join("\n");
        if (context.length > 6000) context = context.slice(0, 6000);

        // Reset messages for the fallback path
        messages.length = 0;
        messages.push(
          { role: "system", content: "Analyze this screen activity and audio data. Generate a daily summary." },
          { role: "user", content: `Activity data for ${dateStr}:\n${context}` },
        );
      }

      if (!hasData) {
        setError("No activity data for this day");
        return;
      }

      // ── Final turn: Generate JSON summary with schema enforcement ──
      const finalResp = await fetch(`${API}/ai/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "daily_summary",
              schema: SUMMARY_JSON_SCHEMA,
            },
          },
        }),
      });

      let parsed: any;
      if (!finalResp.ok) {
        // Fall back to text mode if json_schema isn't supported
        const fallbackResp = await fetch(`${API}/ai/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        });
        if (!fallbackResp.ok) throw new Error(`AI error: ${fallbackResp.status}`);
        const fallbackData = await fallbackResp.json();
        let raw = fallbackData.choices?.[0]?.message?.content || "{}";
        raw = raw.trim();
        // Strip markdown fences
        if (raw.startsWith("```")) {
          raw = raw.split("\n").slice(1).filter((l: string) => !l.startsWith("```")).join("\n");
        }
        // Extract JSON object if model prepended text like "Here is the summary:"
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          raw = jsonMatch[0];
        }
        parsed = JSON.parse(raw);
      } else {
        const finalData = await finalResp.json();
        const content = finalData.choices?.[0]?.message?.content || "{}";
        parsed = JSON.parse(content);
      }

      const newSummary: DailySummary = {
        date: dateStr,
        generatedAt: new Date().toISOString(),
        timeBreakdown: (parsed.timeBreakdown || []).slice(0, 5),
        keyMoments: (parsed.keyMoments || []).slice(0, 5),
        actionItems: (parsed.actionItems || []).map((a: any) => ({
          text: a.text || a.task || "",
          urgency: ["high", "medium", "low"].includes(a.urgency)
            ? a.urgency
            : "medium",
        })),
        peopleMentioned: parsed.peopleMentioned || [],
        oneLiner: parsed.oneLiner || "No summary available",
      };

      saveSummary(newSummary);
      setSummary(newSummary);
      setIsExpanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate summary");
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, dateStr]);

  // ─── Copy ───────────────────────────────────────────────────────────────

  const copySummary = () => {
    if (!summary) return;
    const lines = [
      `# ${formatDate(summary.date)}`,
      "",
      summary.oneLiner,
      "",
    ];

    if (summary.timeBreakdown.length > 0) {
      lines.push("## Time");
      for (const t of summary.timeBreakdown) {
        const h = Math.floor(t.minutes / 60);
        const m = t.minutes % 60;
        lines.push(
          `- ${t.app}: ${h > 0 ? h + "h " : ""}${m > 0 ? m + "m" : ""}`
        );
      }
      lines.push("");
    }

    if (summary.keyMoments.length > 0) {
      lines.push("## Key Moments");
      for (const k of summary.keyMoments)
        lines.push(`- ${k.time} — ${k.description}`);
      lines.push("");
    }

    if (summary.actionItems.length > 0) {
      lines.push("## Action Items");
      for (const a of summary.actionItems) {
        const icon = a.urgency === "high" ? "⚡" : a.urgency === "medium" ? "●" : "○";
        lines.push(`- ${icon} ${a.text}`);
      }
      lines.push("");
    }

    if (summary.peopleMentioned.length > 0) {
      lines.push("## People");
      for (const p of summary.peopleMentioned)
        lines.push(`- ${p.name} — ${p.context}`);
    }

    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (!isVisible) return null;

  const urgencyIcon = (u: string) =>
    u === "high" ? "⚡" : u === "medium" ? "●" : "○";
  const urgencyColor = (u: string) =>
    u === "high"
      ? "text-orange-400"
      : u === "medium"
        ? "text-yellow-400"
        : "text-muted-foreground";

  // Compact icon button when no summary and not generating
  if (!summary && !isGenerating && !error) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => generateSummary()}
              className="w-10 h-10 backdrop-blur-xl bg-black/60 border border-white/10 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors shadow-2xl"
            >
              <img
                src="/apple-intelligence-logo.svg"
                alt="Generate daily summary"
                className="w-5 h-5 rounded"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="bg-black/80 border-white/10 text-white text-xs">
            <p>click to generate a daily summary</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="w-72 backdrop-blur-xl bg-black/60 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
      {/* Header — always visible */}
      <button
        onClick={() => {
          if (summary) {
            setIsExpanded(!isExpanded);
          } else {
            generateSummary();
          }
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors"
      >
        <img
          src="/apple-intelligence-logo.svg"
          alt=""
          className="w-5 h-5 rounded flex-shrink-0"
        />
        <div className="flex-1 min-w-0 text-left">
          {isGenerating ? (
            <div className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-white/60" />
              <span className="text-xs text-white/60">
                generating summary...
              </span>
            </div>
          ) : summary ? (
            <p className="text-xs text-white/90 truncate">{summary.oneLiner}</p>
          ) : (
            <p className="text-xs text-white/50">
              tap to generate daily summary
            </p>
          )}
        </div>
        {summary && (
          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronUp className="h-3 w-3 text-white/40" />
            ) : (
              <ChevronDown className="h-3 w-3 text-white/40" />
            )}
          </div>
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="px-3 py-1.5 border-t border-white/5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-red-400 truncate flex-1">
              {error}
            </span>
            <button onClick={() => setError(null)}>
              <X className="h-2.5 w-2.5 text-white/30" />
            </button>
          </div>
        </div>
      )}

      {/* Expanded content */}
      {summary && isExpanded && (
        <div className="border-t border-white/10 max-h-[50vh] overflow-y-auto">
          {/* Time breakdown */}
          {summary.timeBreakdown.length > 0 && (
            <div className="px-3 py-2 border-b border-white/5">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">
                time
              </p>
              <div className="space-y-1">
                {summary.timeBreakdown.map((t, i) => {
                  const maxMin = Math.max(
                    ...summary.timeBreakdown.map((x) => x.minutes)
                  );
                  const pct = maxMin > 0 ? (t.minutes / maxMin) * 100 : 0;
                  const h = Math.floor(t.minutes / 60);
                  const m = t.minutes % 60;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-white/60 w-16 truncate">
                        {t.app}
                      </span>
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white/30 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-white/40 w-10 text-right">
                        {h > 0 ? `${h}h` : ""}{m > 0 ? `${m}m` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Key moments */}
          {summary.keyMoments.length > 0 && (
            <div className="px-3 py-2 border-b border-white/5">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">
                key moments
              </p>
              <div className="space-y-1">
                {summary.keyMoments.map((k, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-[10px] text-white/40 w-14 flex-shrink-0">
                      {k.time}
                    </span>
                    <span className="text-[10px] text-white/80">
                      {k.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action items */}
          {summary.actionItems.length > 0 && (
            <div className="px-3 py-2 border-b border-white/5">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">
                action items
              </p>
              <div className="space-y-1">
                {summary.actionItems.map((a, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span
                      className={`text-[10px] mt-px ${urgencyColor(a.urgency)}`}
                    >
                      {urgencyIcon(a.urgency)}
                    </span>
                    <span className="text-[10px] text-white/80">{a.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* People */}
          {summary.peopleMentioned.length > 0 && (
            <div className="px-3 py-2 border-b border-white/5">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">
                people
              </p>
              <div className="space-y-1">
                {summary.peopleMentioned.map((p, i) => (
                  <div key={i} className="flex gap-1.5">
                    <span className="text-[10px] text-white/70 font-medium">
                      {p.name}
                    </span>
                    <span className="text-[10px] text-white/40">
                      — {p.context}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-[9px] text-white/30">
              {new Date(summary.generatedAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
              {" · on-device"}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  generateSummary();
                }}
                className="px-2 py-0.5 text-[9px] text-white/40 hover:text-white/70 transition-colors"
                title="Regenerate"
              >
                ↻
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  copySummary();
                }}
                className="px-2 py-0.5 text-[9px] text-white/40 hover:text-white/70 transition-colors"
              >
                {copied ? (
                  <Check className="h-2.5 w-2.5 inline" />
                ) : (
                  <Copy className="h-2.5 w-2.5 inline" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
