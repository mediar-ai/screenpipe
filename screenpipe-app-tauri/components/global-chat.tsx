"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { listen } from "@tauri-apps/api/event";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CustomDialogContent } from "@/components/rewind/custom-dialog-content";
import { useSettings, ChatMessage, ChatConversation } from "@/lib/hooks/use-settings";
import { cn } from "@/lib/utils";
import { Loader2, Send, Square, User, X, Settings, ExternalLink, Video, Plus, Zap, History, Search, Trash2, ChevronLeft } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { parseInt } from "lodash";
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
import { useSqlAutocomplete } from "@/lib/hooks/use-sql-autocomplete";
import { commands } from "@/lib/utils/tauri";
import { UpgradeDialog } from "@/components/upgrade-dialog";

const SCREENPIPE_API = "http://localhost:3030";

// Default chat shortcut - matches store.rs defaults
const DEFAULT_CHAT_SHORTCUT_MAC = "Control+Super+L";
const DEFAULT_CHAT_SHORTCUT_OTHER = "Alt+L";

// ============================================================================
// SHORTCUT FORMATTING - Consistent modifier ordering (⌘ → ⌃ → ⌥ → ⇧ → key)
// ============================================================================

/**
 * Format a shortcut string for display with consistent modifier ordering.
 * On macOS: Command (⌘) → Control (⌃) → Option (⌥) → Shift (⇧) → Key
 * On Windows/Linux: Ctrl → Alt → Shift → Key
 */
export function formatShortcutDisplay(shortcut: string, isMac: boolean): string {
  if (!shortcut) return "";

  // Parse the shortcut into parts
  const parts = shortcut.split("+").map(p => p.trim().toLowerCase());

  // Define modifier priorities (lower = comes first)
  const modifierPriority: Record<string, number> = {
    "super": 0, "command": 0, "cmd": 0,
    "ctrl": 1, "control": 1,
    "alt": 2, "option": 2,
    "shift": 3,
  };

  // Separate modifiers from the key
  const modifiers: string[] = [];
  let key = "";

  for (const part of parts) {
    if (modifierPriority[part] !== undefined) {
      modifiers.push(part);
    } else {
      key = part;
    }
  }

  // Sort modifiers by priority
  modifiers.sort((a, b) => (modifierPriority[a] ?? 99) - (modifierPriority[b] ?? 99));

  if (isMac) {
    // Convert to Mac symbols
    const macSymbols: Record<string, string> = {
      "super": "⌘", "command": "⌘", "cmd": "⌘",
      "ctrl": "⌃", "control": "⌃",
      "alt": "⌥", "option": "⌥",
      "shift": "⇧",
    };
    const formattedMods = modifiers.map(m => macSymbols[m] || m).join("");
    return formattedMods + key.toUpperCase();
  } else {
    // Windows/Linux: readable format
    const winNames: Record<string, string> = {
      "super": "Win", "command": "Ctrl", "cmd": "Ctrl",
      "ctrl": "Ctrl", "control": "Ctrl",
      "alt": "Alt", "option": "Alt",
      "shift": "Shift",
    };
    const formattedMods = modifiers.map(m => winNames[m] || m);
    return [...formattedMods, key.toUpperCase()].join("+");
  }
}

// ============================================================================
// @MENTION SYSTEM - Time, Content Type, and App filters
// ============================================================================

interface TimeRange {
  start: Date;
  end: Date;
  label: string;
}

interface ParsedMentions {
  cleanedInput: string;
  timeRanges: TimeRange[];
  contentType: "all" | "ocr" | "audio" | null;
  appName: string | null;
  usedSelection: boolean;
  speakerName: string | null;
}

interface ParseMentionsOptions {
  selectionRange?: { start: Date; end: Date } | null;
  appTagMap?: Record<string, string>;
}

// Common app name mappings (user-friendly -> actual app name patterns)
const APP_MAPPINGS: Record<string, string[]> = {
  "chrome": ["Google Chrome", "Chrome"],
  "slack": ["Slack"],
  "vscode": ["Code", "Visual Studio Code"],
  "code": ["Code", "Visual Studio Code"],
  "terminal": ["Terminal", "iTerm", "iTerm2", "Warp", "Alacritty", "kitty"],
  "zoom": ["zoom.us", "Zoom"],
  "teams": ["Microsoft Teams", "Teams"],
  "discord": ["Discord"],
  "figma": ["Figma"],
  "notion": ["Notion"],
  "obsidian": ["Obsidian"],
  "safari": ["Safari"],
  "firefox": ["Firefox"],
  "arc": ["Arc"],
  "cursor": ["Cursor"],
  "finder": ["Finder"],
  "mail": ["Mail"],
  "messages": ["Messages"],
  "spotify": ["Spotify"],
  "twitter": ["Twitter", "X"],
  "x": ["Twitter", "X"],
  "linear": ["Linear"],
  "github": ["GitHub Desktop"],
  "postman": ["Postman"],
  "iterm": ["iTerm", "iTerm2"],
  "warp": ["Warp"],
};

export function parseMentions(input: string, options?: ParseMentionsOptions): ParsedMentions {
  const now = new Date();
  const timeRanges: TimeRange[] = [];
  let cleanedInput = input;
  let contentType: "all" | "ocr" | "audio" | null = null;
  let appName: string | null = null;
  let usedSelection = false;
  let speakerName: string | null = null;

  // === TIME MENTIONS ===

  // @selection - timeline selection
  const selectionPattern = /@selection\b/gi;
  if (selectionPattern.test(cleanedInput) && options?.selectionRange) {
    timeRanges.push({
      start: options.selectionRange.start,
      end: options.selectionRange.end,
      label: "selected range",
    });
    cleanedInput = cleanedInput.replace(selectionPattern, "").trim();
    usedSelection = true;
  }

  const timePatterns: { pattern: RegExp; getRange: () => TimeRange }[] = [
    {
      pattern: /@today\b/gi,
      getRange: () => {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        return { start, end: now, label: "today" };
      },
    },
    {
      pattern: /@yesterday\b/gi,
      getRange: () => {
        const start = new Date(now);
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        return { start, end, label: "yesterday" };
      },
    },
    {
      pattern: /@last[- ]?week\b/gi,
      getRange: () => {
        const start = new Date(now);
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        return { start, end: now, label: "last week" };
      },
    },
    {
      pattern: /@this[- ]?morning\b/gi,
      getRange: () => {
        const start = new Date(now);
        start.setHours(6, 0, 0, 0);
        const end = new Date(now);
        end.setHours(12, 0, 0, 0);
        return { start, end: now < end ? now : end, label: "this morning" };
      },
    },
    {
      pattern: /@last[- ]?hour\b/gi,
      getRange: () => {
        const start = new Date(now.getTime() - 60 * 60 * 1000);
        return { start, end: now, label: "last hour" };
      },
    },
  ];

  for (const { pattern, getRange } of timePatterns) {
    if (pattern.test(cleanedInput)) {
      timeRanges.push(getRange());
      cleanedInput = cleanedInput.replace(pattern, "").trim();
    }
  }

  // === CONTENT TYPE MENTIONS ===

  // @audio - audio transcriptions only
  const audioPattern = /@audio\b/gi;
  if (audioPattern.test(cleanedInput)) {
    contentType = "audio";
    cleanedInput = cleanedInput.replace(audioPattern, "").trim();
  }

  // @screen or @ocr - screen text only
  const screenPattern = /@(screen|ocr)\b/gi;
  if (screenPattern.test(cleanedInput)) {
    contentType = "ocr";
    cleanedInput = cleanedInput.replace(screenPattern, "").trim();
  }

  // === APP MENTIONS ===

  const appTagMap = options?.appTagMap || {};
  const appTagEntries = Object.entries(appTagMap);

  // Check for dynamic @appname patterns from autocomplete
  for (const [tag, actualName] of appTagEntries) {
    const appPattern = new RegExp(`@${tag.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "gi");
    if (appPattern.test(cleanedInput)) {
      appName = actualName;
      cleanedInput = cleanedInput.replace(appPattern, "").trim();
      break;
    }
  }

  // Check for @appname patterns (common aliases)
  if (!appName) {
    for (const [shortName, actualNames] of Object.entries(APP_MAPPINGS)) {
      const appPattern = new RegExp(`@${shortName}\\b`, "gi");
      if (appPattern.test(cleanedInput)) {
        appName = actualNames[0]; // Use first (primary) name
        cleanedInput = cleanedInput.replace(appPattern, "").trim();
        break; // Only match first app
      }
    }
  }

  // === SPEAKER MENTIONS ===
  // Match @speaker:Name or just a capitalized name after @ that isn't a known tag
  // Pattern: @Name or @"Full Name" (quoted for multi-word names)
  const quotedSpeakerPattern = /@"([^"]+)"/g;
  const quotedMatch = quotedSpeakerPattern.exec(cleanedInput);
  if (quotedMatch) {
    speakerName = quotedMatch[1].trim();
    cleanedInput = cleanedInput.replace(quotedMatch[0], "").trim();
  } else {
    // Match @CapitalizedName (single word, must start with capital to distinguish from app tags)
    const simpleSpeakerPattern = /@([A-Z][a-zA-Z]+)(?:\s|$|,)/;
    const simpleMatch = simpleSpeakerPattern.exec(cleanedInput);
    if (simpleMatch) {
      const potentialName = simpleMatch[1];
      // Check if it's not a known app or time tag
      const knownTags = [
        "today", "yesterday", "selection", "audio", "screen", "ocr",
        ...Object.keys(APP_MAPPINGS).map(k => k.toLowerCase()),
        ...Object.keys(appTagMap).map(k => k.toLowerCase()),
      ];
      if (!knownTags.includes(potentialName.toLowerCase())) {
        speakerName = potentialName;
        cleanedInput = cleanedInput.replace(`@${potentialName}`, "").trim();
      }
    }
  }

  return { cleanedInput, timeRanges, contentType, appName, usedSelection, speakerName };
}

// ============================================================================
// MENTION SUGGESTIONS for autocomplete dropdown
// ============================================================================

interface MentionSuggestion {
  tag: string;
  description: string;
  category: "time" | "content" | "app" | "speaker";
  appName?: string;
}

const APP_SUGGESTION_LIMIT = 10;

type AppAutocompleteItem = {
  name: string;
  count: number;
};

export function normalizeAppTag(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return base || "app";
}

export function buildAppMentionSuggestions(
  items: AppAutocompleteItem[],
  limit: number
): MentionSuggestion[] {
  const usedTags = new Set<string>();
  return items.slice(0, limit).map((item) => {
    const baseTag = normalizeAppTag(item.name);
    let tag = baseTag;
    let suffix = 2;
    while (usedTags.has(tag)) {
      tag = `${baseTag}${suffix}`;
      suffix += 1;
    }
    usedTags.add(tag);
    return {
      tag: `@${tag}`,
      description: item.name,
      category: "app" as const,
      appName: item.name,
    };
  });
}

// Static suggestions - speakers are loaded dynamically
const STATIC_MENTION_SUGGESTIONS: MentionSuggestion[] = [
  // Time
  { tag: "@today", description: "today's activity", category: "time" },
  { tag: "@yesterday", description: "yesterday", category: "time" },
  { tag: "@last-week", description: "past 7 days", category: "time" },
  { tag: "@last-hour", description: "past hour", category: "time" },
  { tag: "@selection", description: "timeline selection", category: "time" },
  // Content type
  { tag: "@audio", description: "audio/meetings only", category: "content" },
  { tag: "@screen", description: "screen text only", category: "content" },
];

// Speaker interface for dynamic suggestions
interface Speaker {
  id: number;
  name: string;
  metadata?: string;
}

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
          speaker_name: {
            type: "string",
            description: "Filter audio transcriptions by speaker name. Use when user asks about what a specific person said. Case-insensitive partial match.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: `Search the web for current, up-to-date information. Use this when:
- User asks about recent news, events, or current information
- User wants to verify or supplement screen data with web sources
- User asks about topics that need real-time data (stocks, weather, news)
- Combining screen context with external web information

This tool uses Google Search to ground responses in current web data and provides cited sources.

EXAMPLES:
- "What's the latest news about [topic from my screen]?"
- "Search the web for current ECB rates"
- "Find recent articles about [something I was researching]"`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query. Be specific and include relevant context.",
          },
        },
        required: ["query"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a helpful AI assistant that can search through the user's Screenpipe data - their screen recordings, audio transcriptions, and UI interactions. You also have access to web search for current information.

CAPABILITIES:
1. **Screen/Audio Search** (search_content): Search user's captured screen text, audio transcriptions, UI elements
2. **Web Search** (web_search): Search the internet for current news, real-time data, and external information

WHEN TO USE WEB SEARCH:
- User asks about current events, news, or real-time information
- User wants to combine screen context with external web data (e.g., "based on what I was looking at, search for...")
- Topics that need up-to-date information (stock prices, news, weather, recent developments)
- Verifying or supplementing information from screen captures

CRITICAL SCREEN SEARCH RULES (database has 600k+ entries - ALWAYS use time filters):
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

Be concise. Cite timestamps when relevant. When using web search, always cite your sources.

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
  timestamp: number;
}

export function GlobalChat() {
  const [open, setOpen] = useState(false);
  const { settings, updateSettings, isSettingsLoaded } = useSettings();
  const pathname = usePathname();
  const { isMac } = usePlatform();
  const { selectionRange, setSelectionRange } = useTimelineSelection();
  const { items: appItems } = useSqlAutocomplete("app");

  // Only show floating button on timeline page, but keep dialog available everywhere
  // pathname can be null during initial hydration
  const isOnTimeline = !pathname || pathname === "/" || pathname === "/timeline";

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activePreset, setActivePreset] = useState<AIPreset | undefined>();
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [speakerSuggestions, setSpeakerSuggestions] = useState<MentionSuggestion[]>([]);
  const [isLoadingSpeakers, setIsLoadingSpeakers] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Upgrade dialog state
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"daily_limit" | "model_not_allowed">("daily_limit");
  const [upgradeResetsAt, setUpgradeResetsAt] = useState<string | undefined>();

  // Chat history state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  const appMentionSuggestions = React.useMemo(
    () => buildAppMentionSuggestions(appItems, APP_SUGGESTION_LIMIT),
    [appItems]
  );

  const appTagMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const suggestion of appMentionSuggestions) {
      if (suggestion.appName) {
        map[suggestion.tag.slice(1).toLowerCase()] = suggestion.appName;
      }
    }
    return map;
  }, [appMentionSuggestions]);

  const baseMentionSuggestions = React.useMemo(
    () => [...STATIC_MENTION_SUGGESTIONS, ...appMentionSuggestions],
    [appMentionSuggestions]
  );

  // Handle video export
  const handleExport = async () => {
    if (!selectionRange?.frameIds?.length) {
      toast({
        title: "no frames selected",
        description: "drag on the timeline to select frames to export",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    const startTime = selectionRange.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTime = selectionRange.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    toast({
      title: "exporting video",
      description: `${startTime} - ${endTime} (${selectionRange.frameIds.length} frames)`,
    });

    try {
      let isClosingManually = false;
      let ws: WebSocket | null = null;

      const sortedFrameIds = selectionRange.frameIds.sort(
        (a, b) => parseInt(a) - parseInt(b),
      );

      const closeWebSocket = () => {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          isClosingManually = true;
          try { ws.close(); } catch (e) { console.error("Error closing WebSocket:", e); }
        }
        ws = null;
      };

      // Send frame_ids in message body to avoid URL length limits
      ws = new WebSocket(
        `ws://localhost:3030/frames/export?fps=${settings.fps ?? 0.5}`,
      );

      const connectionTimeout = setTimeout(() => {
        if (ws && ws.readyState !== WebSocket.OPEN) {
          toast({ title: "connection timeout", description: "failed to connect to server", variant: "destructive" });
          closeWebSocket();
          setIsExporting(false);
          setExportProgress(0);
        }
      }, 10000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        // Send frame_ids in message body to avoid URL length limits
        ws?.send(JSON.stringify({ frame_ids: sortedFrameIds.map(id => parseInt(id)) }));
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.status) {
            case "extracting":
              setExportProgress(data.progress * 100);
              break;
            case "encoding":
              setExportProgress(50 + data.progress * 50);
              break;
            case "completed":
              if (data.video_data) {
                closeWebSocket();
                const filename = `screenpipe_export_${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`;

                try {
                  if ("__TAURI__" in window) {
                    const tauri = window.__TAURI__ as any;
                    const { save } = tauri.dialog;
                    const { writeFile } = tauri.fs;
                    const filePath = await save({
                      filters: [{ name: "Video", extensions: ["mp4"] }],
                      defaultPath: filename,
                    });
                    if (filePath) {
                      await writeFile(filePath, new Uint8Array(data.video_data));
                      toast({ title: "video exported", description: filePath });
                    }
                  } else {
                    const blob = new Blob([new Uint8Array(data.video_data)], { type: "video/mp4" });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    a.remove();
                    toast({ title: "video exported", description: filename });
                  }
                } catch (downloadError) {
                  console.error("Download error:", downloadError);
                  toast({ title: "download failed", description: "failed to save video", variant: "destructive" });
                }
              }
              setIsExporting(false);
              setExportProgress(0);
              break;
            case "error":
              toast({ title: "export failed", description: data.error || "failed to export video", variant: "destructive" });
              setIsExporting(false);
              setExportProgress(0);
              closeWebSocket();
              break;
          }
        } catch (parseError) {
          console.error("Error parsing message:", parseError);
          toast({ title: "export failed", description: "failed to process server response", variant: "destructive" });
          setIsExporting(false);
          setExportProgress(0);
          closeWebSocket();
        }
      };

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        if (isExporting && !isClosingManually) {
          toast({ title: "connection closed", description: "server connection closed unexpectedly", variant: "destructive" });
          setIsExporting(false);
          setExportProgress(0);
        }
      };

      ws.onerror = (event) => {
        clearTimeout(connectionTimeout);
        if (isClosingManually) return;
        console.error("WebSocket error:", event);
        toast({ title: "export failed", description: "connection error", variant: "destructive" });
        setIsExporting(false);
        setExportProgress(0);
        closeWebSocket();
      };
    } catch (error) {
      console.error("Export setup error:", error);
      toast({ title: "export failed", description: "failed to start export", variant: "destructive" });
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // Export shortcut handler (Cmd+E / Ctrl+E)
  useEffect(() => {
    if (!isOnTimeline) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e" && !isExporting) {
        e.preventDefault();
        if (selectionRange?.frameIds?.length) {
          handleExport();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnTimeline, isExporting, selectionRange]);

  // Load active conversation from settings on mount
  useEffect(() => {
    if (!isSettingsLoaded) return;

    const history = settings.chatHistory;
    if (history?.activeConversationId && history.historyEnabled !== false) {
      const activeConv = history.conversations.find(
        c => c.id === history.activeConversationId
      );
      if (activeConv && activeConv.messages.length > 0) {
        setMessages(activeConv.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })));
        setConversationId(activeConv.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsLoaded]);

  // Save conversation to settings
  const saveConversation = async (msgs: Message[]) => {
    if (!settings.chatHistory?.historyEnabled) return;
    if (msgs.length === 0) return;

    const history = settings.chatHistory || { conversations: [], activeConversationId: null, historyEnabled: true };
    const convId = conversationId || crypto.randomUUID();

    const existingIndex = history.conversations.findIndex(c => c.id === convId);
    // Use first user message for title, truncated to 50 chars
    const firstUserMsg = msgs.find(m => m.role === "user");
    const title = firstUserMsg?.content.slice(0, 50) || "New Chat";

    const conversation: ChatConversation = {
      id: convId,
      title,
      messages: msgs.slice(-100).map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
      createdAt: existingIndex >= 0 ? history.conversations[existingIndex].createdAt : Date.now(),
      updatedAt: Date.now(),
    };

    let newConversations = [...history.conversations];
    if (existingIndex >= 0) {
      newConversations[existingIndex] = conversation;
    } else {
      // Add new conversation at the beginning, limit to 50
      newConversations = [conversation, ...newConversations].slice(0, 50);
    }

    await updateSettings({
      chatHistory: {
        ...history,
        conversations: newConversations,
        activeConversationId: convId,
      }
    });

    if (!conversationId) {
      setConversationId(convId);
    }
  };

  // Delete a conversation
  const deleteConversation = async (convId: string) => {
    const history = settings.chatHistory;
    if (!history) return;

    const newConversations = history.conversations.filter(c => c.id !== convId);
    const newActiveId = history.activeConversationId === convId ? null : history.activeConversationId;

    await updateSettings({
      chatHistory: {
        ...history,
        conversations: newConversations,
        activeConversationId: newActiveId,
      }
    });

    // If we deleted the current conversation, clear the chat
    if (conversationId === convId) {
      setMessages([]);
      setConversationId(null);
    }
  };

  // Load a specific conversation
  const loadConversation = (conv: ChatConversation) => {
    setMessages(conv.messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    })));
    setConversationId(conv.id);
    setShowHistory(false);

    // Update active conversation
    if (settings.chatHistory) {
      updateSettings({
        chatHistory: {
          ...settings.chatHistory,
          activeConversationId: conv.id,
        }
      });
    }
  };

  // Start a new conversation
  const startNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setInput("");
    setShowHistory(false);
  };

  // Filter conversations by search
  const filteredConversations = React.useMemo(() => {
    const convs = settings.chatHistory?.conversations || [];
    if (!historySearch.trim()) return convs;

    const search = historySearch.toLowerCase();
    return convs.filter(c =>
      c.title.toLowerCase().includes(search) ||
      c.messages.some(m => m.content.toLowerCase().includes(search))
    );
  }, [settings.chatHistory?.conversations, historySearch]);

  // Group conversations by date
  const groupedConversations = React.useMemo(() => {
    const groups: { label: string; conversations: ChatConversation[] }[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const todayConvs: ChatConversation[] = [];
    const yesterdayConvs: ChatConversation[] = [];
    const lastWeekConvs: ChatConversation[] = [];
    const olderConvs: ChatConversation[] = [];

    for (const conv of filteredConversations) {
      const convDate = new Date(conv.updatedAt);
      if (convDate >= today) {
        todayConvs.push(conv);
      } else if (convDate >= yesterday) {
        yesterdayConvs.push(conv);
      } else if (convDate >= lastWeek) {
        lastWeekConvs.push(conv);
      } else {
        olderConvs.push(conv);
      }
    }

    if (todayConvs.length > 0) groups.push({ label: "Today", conversations: todayConvs });
    if (yesterdayConvs.length > 0) groups.push({ label: "Yesterday", conversations: yesterdayConvs });
    if (lastWeekConvs.length > 0) groups.push({ label: "Last 7 Days", conversations: lastWeekConvs });
    if (olderConvs.length > 0) groups.push({ label: "Older", conversations: olderConvs });

    return groups;
  }, [filteredConversations]);

  // Fetch speakers dynamically when filter changes
  useEffect(() => {
    if (!mentionFilter || mentionFilter.length < 1) {
      setSpeakerSuggestions([]);
      return;
    }

    // Check if filter matches any static suggestion - if so, don't search speakers
    const matchesBase = baseMentionSuggestions.some(
      s => s.tag.toLowerCase().includes(`@${mentionFilter.toLowerCase()}`)
    );
    if (matchesBase && mentionFilter.length < 3) {
      setSpeakerSuggestions([]);
      return;
    }

    const searchSpeakers = async () => {
      setIsLoadingSpeakers(true);
      try {
        const response = await fetch(
          `${SCREENPIPE_API}/speakers/search?name=${encodeURIComponent(mentionFilter)}`
        );
        if (response.ok) {
          const speakers: Speaker[] = await response.json();
          const suggestions: MentionSuggestion[] = speakers
            .filter(s => s.name) // Only include speakers with names
            .slice(0, 5) // Limit to 5 speakers
            .map(s => ({
              tag: s.name.includes(" ") ? `@"${s.name}"` : `@${s.name}`,
              description: `speaker`,
              category: "speaker" as const,
            }));
          setSpeakerSuggestions(suggestions);
        }
      } catch (error) {
        console.error("Error searching speakers:", error);
      } finally {
        setIsLoadingSpeakers(false);
      }
    };

    const debounceTimeout = setTimeout(searchSpeakers, 300);
    return () => clearTimeout(debounceTimeout);
  }, [mentionFilter, baseMentionSuggestions]);

  // Filter suggestions based on what user is typing after @
  const filteredMentions = React.useMemo(() => {
    const suggestions = !mentionFilter
      ? baseMentionSuggestions
      : baseMentionSuggestions.filter(
          s => s.tag.toLowerCase().includes(mentionFilter.toLowerCase()) ||
               s.description.toLowerCase().includes(mentionFilter.toLowerCase())
        );

    // Combine base suggestions and dynamic speaker suggestions
    return [...suggestions, ...speakerSuggestions];
  }, [mentionFilter, speakerSuggestions, baseMentionSuggestions]);

  // Handle input changes and detect @ mentions
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);

    // Check if user is typing an @mention
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setShowMentionDropdown(true);
      setMentionFilter(atMatch[1]);
      setSelectedMentionIndex(0);
    } else {
      setShowMentionDropdown(false);
      setMentionFilter("");
    }
  };

  // Insert selected mention into input
  const insertMention = (tag: string) => {
    const cursorPos = inputRef.current?.selectionStart || input.length;
    const textBeforeCursor = input.slice(0, cursorPos);
    const textAfterCursor = input.slice(cursorPos);

    // Find where the @ starts
    const atIndex = textBeforeCursor.lastIndexOf("@");
    if (atIndex !== -1) {
      const newValue = textBeforeCursor.slice(0, atIndex) + tag + " " + textAfterCursor;
      setInput(newValue);
    }

    setShowMentionDropdown(false);
    setMentionFilter("");
    inputRef.current?.focus();
  };

  // Handle keyboard navigation in dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showMentionDropdown) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedMentionIndex(i => Math.min(i + 1, filteredMentions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedMentionIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filteredMentions.length > 0) {
      e.preventDefault();
      insertMention(filteredMentions[selectedMentionIndex].tag);
    } else if (e.key === "Escape") {
      setShowMentionDropdown(false);
    } else if (e.key === "Tab" && filteredMentions.length > 0) {
      e.preventDefault();
      insertMention(filteredMentions[selectedMentionIndex].tag);
    }
  };

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

  // Close chat when window is hidden (Esc pressed, timeline closed)
  useEffect(() => {
    const unlisten = listen("window-hidden", () => {
      setOpen(false);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Execute search tool by calling Screenpipe API
  // Keep responses small to avoid exceeding model context window
  async function executeSearchTool(args: Record<string, unknown>): Promise<string> {
    const MAX_LIMIT = 10; // Cap results to prevent huge responses
    const MAX_RESPONSE_CHARS = 4000; // ~1000 tokens - keep small to fit in context
    const MAX_TEXT_PER_RESULT = 300; // Truncate individual result text aggressively

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
      if (args.speaker_name) params.append("speaker_name", String(args.speaker_name));

      // Add timeout to prevent hanging - 30s to handle large datasets
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(`${SCREENPIPE_API}/search?${params.toString()}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Search failed: ${response.status}`);

      const data = await response.json();

      // Check for API error response
      if (data.error) {
        return `Search failed: ${data.error}. Please inform the user about this error and suggest they restart Screenpipe or check logs.`;
      }

      const searchResults = data.data || [];
      const pagination = data.pagination || {};

      if (searchResults.length === 0) {
        return "No results found. Try: broader search terms, different app_name, wider time range, or different content_type.";
      }

      // Format results
      const formatted = searchResults.map((result: SearchResult) => {
        const content = result.content;
        if (!content) return null;

        const truncateText = (text: string | undefined) => {
          if (!text) return "";
          if (text.length > MAX_TEXT_PER_RESULT) {
            return text.substring(0, MAX_TEXT_PER_RESULT) + "...";
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

      const result = formatted.join("\n---\n");
      const totalAvailable = pagination.total || searchResults.length;

      // If results too large, return NO data - just tell model to retry with narrower params
      if (result.length > MAX_RESPONSE_CHARS) {
        return `Search returned too much data (${searchResults.length} results, ~${Math.round(result.length / 1000)}k chars). Try again with a narrower time range or more specific filters.`;
      }

      return `Found ${searchResults.length} results:\n\n${result}`;
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

    // For screenpipe-cloud, use token if available, otherwise "anonymous" for free tier
    const apiKey =
      activePreset.provider === "screenpipe-cloud"
        ? settings.user?.token || "anonymous"
        : "apiKey" in activePreset
          ? (activePreset.apiKey as string) || ""
          : "";

    // Force correct URL for screenpipe-cloud (in case preset has wrong URL saved)
    const baseURL =
      activePreset.provider === "screenpipe-cloud"
        ? "https://api.screenpi.pe/v1"
        : activePreset.url;

    // Add device ID header for usage tracking (free tier)
    const defaultHeaders: Record<string, string> = {};
    if (activePreset.provider === "screenpipe-cloud" && settings.deviceId) {
      defaultHeaders["X-Device-Id"] = settings.deviceId;
    }

    return new OpenAI({
      apiKey,
      baseURL,
      dangerouslyAllowBrowser: true,
      defaultHeaders,
    });
  }

  // Send message using OpenAI SDK with streaming
  async function sendMessage(userMessage: string) {
    if (!canChat || !activePreset) return;

    const openai = getOpenAIClient();
    if (!openai) return;

    // Parse @mentions from input (time, content type, apps)
    const mentions = parseMentions(userMessage, { selectionRange, appTagMap });
    const displayMessage = userMessage; // Show original message with tags to user
    const processedMessage = mentions.cleanedInput || userMessage; // Use cleaned version for AI

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: displayMessage,
      timestamp: Date.now(),
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

      // Add @mention context to system prompt
      const mentionContext: string[] = [];

      // Time ranges from @mentions
      if (mentions.timeRanges.length > 0) {
        const timeContext = mentions.timeRanges.map(t =>
          `- ${t.label}: from ${t.start.toISOString()} to ${t.end.toISOString()}`
        ).join("\n");
        mentionContext.push(`TIME FILTER (use these exact values for start_time/end_time):\n${timeContext}`);
      } else if (selectionRange) {
        // Fall back to timeline selection if no explicit @time tags
        mentionContext.push(`TIME FILTER (timeline selection):\n- from ${selectionRange.start.toISOString()} to ${selectionRange.end.toISOString()}`);
      }

      // Content type from @audio or @screen
      if (mentions.contentType) {
        mentionContext.push(`CONTENT TYPE FILTER: ${mentions.contentType} (use content_type: "${mentions.contentType}")`);
      }

      // App filter from @appname
      if (mentions.appName) {
        mentionContext.push(`APP FILTER: ${mentions.appName} (use app_name: "${mentions.appName}")`);
      }

      // Speaker filter from @SpeakerName
      if (mentions.speakerName) {
        mentionContext.push(`SPEAKER FILTER: ${mentions.speakerName} (use speaker_name: "${mentions.speakerName}" and content_type: "audio")`);
      }

      if (mentionContext.length > 0) {
        systemPrompt += `\n\nIMPORTANT - User specified filters via @mentions. ALWAYS use these in your search_content call:\n${mentionContext.join("\n\n")}`;
      }

      // Build conversation history for OpenAI format
      // Limit to last 10 messages to prevent context overflow
      const MAX_HISTORY = 10;
      const recentMessages = messages.slice(-MAX_HISTORY);
      const conversationMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...recentMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: processedMessage },
      ];

      // Add placeholder for streaming response
      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, role: "assistant", content: "", timestamp: Date.now() },
      ]);

      let accumulatedText = "";
      let toolCalls: any[] = [];
      let streamCompleted = false;
      let lastChunkTime = Date.now();
      let chunkCount = 0;

      // First request with streaming
      console.log("[Chat] Starting stream request", { model: activePreset.model, messageCount: conversationMessages.length });
      const stream = await openai.chat.completions.create(
        {
          model: activePreset.model || "gpt-4",
          messages: conversationMessages,
          tools: TOOLS,
          stream: true,
        },
        { signal: abortControllerRef.current.signal }
      );
      console.log("[Chat] Stream created, waiting for chunks...");

      // Stream timeout - 60 seconds without receiving a chunk
      const STREAM_TIMEOUT_MS = 60000;

      for await (const chunk of stream) {
        chunkCount++;
        lastChunkTime = Date.now();
        const delta = chunk.choices[0]?.delta;
        const finishReason = chunk.choices[0]?.finish_reason;

        // Log every 10th chunk or important events
        if (chunkCount <= 3 || chunkCount % 10 === 0 || finishReason) {
          console.log("[Chat] Chunk", chunkCount, {
            hasContent: !!delta?.content,
            hasToolCalls: !!delta?.tool_calls,
            finishReason,
            contentPreview: delta?.content?.slice(0, 50)
          });
        }

        // Track stream completion
        if (finishReason) {
          streamCompleted = true;
          console.log("[Chat] Stream completed with finish_reason:", finishReason);
        }

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
              console.log("[Chat] Tool call started:", toolCall.function?.name);
            }
            if (toolCall.id) toolCalls[index].id = toolCall.id;
            if (toolCall.function?.name) toolCalls[index].function.name = toolCall.function.name;
            if (toolCall.function?.arguments) toolCalls[index].function.arguments += toolCall.function.arguments;
          }
        }
      }

      console.log("[Chat] Stream loop ended", {
        chunkCount,
        streamCompleted,
        toolCallsCount: toolCalls.length,
        textLength: accumulatedText.length
      });

      // Check for incomplete stream (no finish_reason and no tool calls)
      if (!streamCompleted && toolCalls.length === 0 && accumulatedText) {
        console.warn("[Chat] Stream ended without finish_reason - possible connection issue", {
          chunkCount,
          textLength: accumulatedText.length,
          lastChunkAge: Date.now() - lastChunkTime
        });
        // Append a note that the response may be incomplete
        accumulatedText += "\n\n*(Response may be incomplete due to connection issue)*";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: accumulatedText }
              : m
          )
        );
      }

      // Handle tool calls if any
      if (toolCalls.length > 0) {
        // Show what we're searching for
        const searchArgs = toolCalls[0]?.function?.arguments;
        let searchInfo = "Searching...";
        try {
          const args = JSON.parse(searchArgs || "{}");
          const parts = [];
          if (args.app_name) parts.push(args.app_name);
          if (args.start_time) parts.push(`from ${args.start_time}`);
          if (args.q) parts.push(`"${args.q}"`);
          if (parts.length > 0) searchInfo = `Searching ${parts.join(", ")}...`;
        } catch {}

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: accumulatedText + `\n\n*${searchInfo}*` }
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
              console.log("[Chat] Executing search_content tool", args);
              const result = await executeSearchTool(args);
              console.log("[Chat] Search result length:", result.length);
              toolResults.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: result,
              });
            } catch (e) {
              console.error("[Chat] Tool execution error:", e);
              toolResults.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: `Error parsing tool arguments: ${e}`,
              });
            }
          } else if (toolCall.function.name === "web_search") {
            // For Gemini models, web search is handled via Google Search grounding
            // The grounding results are automatically included in the response
            // For non-Gemini models, this would need an actual search API call
            const args = JSON.parse(toolCall.function.arguments || "{}");
            console.log("[Chat] Web search requested:", args.query);

            // Check if using Gemini (grounding is automatic)
            const isGemini = activePreset.model?.toLowerCase().includes("gemini");
            if (isGemini) {
              toolResults.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: `Web search for "${args.query}" is being performed via Google Search grounding. The results will be included in the response with citations.`,
              });
            } else {
              // For non-Gemini models, we don't have web search yet
              toolResults.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: `Web search is currently only available for Gemini models. Please use a Gemini model to enable web search functionality.`,
              });
            }
          }
        }

        // Continue conversation with tool results - support multiple rounds of tool calls
        let allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [...conversationMessages, ...toolResults];
        const maxToolRounds = 5; // Prevent infinite loops

        for (let toolRound = 1; toolRound <= maxToolRounds; toolRound++) {
          console.log("[Chat] Starting continuation stream (round " + toolRound + ")", {
            totalMessages: allMessages.length
          });
          accumulatedText = "";
          streamCompleted = false;
          let continueChunkCount = 0;
          const continueToolCalls: { id: string; function: { name: string; arguments: string } }[] = [];

          // Create stream - use type assertion to avoid circular type inference in loop
          const continueStream = (await openai.chat.completions.create(
            {
              model: activePreset.model || "gpt-4",
              messages: allMessages,
              tools: TOOLS,
              stream: true,
            },
            { signal: abortControllerRef.current?.signal }
          )) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

          for await (const chunk of continueStream) {
            continueChunkCount++;
            const delta = chunk.choices[0]?.delta;
            const finishReason = chunk.choices[0]?.finish_reason;

            if (continueChunkCount <= 3 || continueChunkCount % 20 === 0 || finishReason) {
              console.log("[Chat] Continue chunk", continueChunkCount, {
                hasContent: !!delta?.content,
                hasToolCalls: !!delta?.tool_calls,
                finishReason
              });
            }

            if (finishReason) {
              streamCompleted = true;
              console.log("[Chat] Continuation stream completed with finish_reason:", finishReason);
            }

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

            // Handle tool calls in continuation
            if (delta?.tool_calls) {
              for (const toolCall of delta.tool_calls) {
                const index = toolCall.index;
                if (!continueToolCalls[index]) {
                  continueToolCalls[index] = {
                    id: toolCall.id || "",
                    function: { name: "", arguments: "" },
                  };
                  console.log("[Chat] Continuation tool call started:", toolCall.function?.name);
                }
                if (toolCall.id) continueToolCalls[index].id = toolCall.id;
                if (toolCall.function?.name) continueToolCalls[index].function.name = toolCall.function.name;
                if (toolCall.function?.arguments) continueToolCalls[index].function.arguments += toolCall.function.arguments;
              }
            }
          }

          console.log("[Chat] Continuation stream loop ended", {
            toolRound,
            continueChunkCount,
            streamCompleted,
            continueToolCallsCount: continueToolCalls.length,
            textLength: accumulatedText.length
          });

          // If no more tool calls, we're done
          if (continueToolCalls.length === 0) {
            break;
          }

          // Execute the new tool calls
          console.log("[Chat] Executing additional tool calls (round " + toolRound + ")");
          const additionalToolResults: OpenAI.Chat.ChatCompletionMessageParam[] = [];

          additionalToolResults.push({
            role: "assistant",
            content: accumulatedText || null,
            tool_calls: continueToolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          });

          for (const toolCall of continueToolCalls) {
            if (toolCall.function.name === "search_content") {
              try {
                const args = JSON.parse(toolCall.function.arguments || "{}");
                console.log("[Chat] Executing search_content tool (round " + toolRound + ")", args);
                const result = await executeSearchTool(args);
                console.log("[Chat] Search result length:", result.length);
                additionalToolResults.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: result,
                });
              } catch (e) {
                console.error("[Chat] Tool execution error:", e);
                additionalToolResults.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: `Error parsing tool arguments: ${e}`,
                });
              }
            } else if (toolCall.function.name === "web_search") {
              const args = JSON.parse(toolCall.function.arguments || "{}");
              console.log("[Chat] Web search requested (round " + toolRound + "):", args.query);
              const isGemini = activePreset.model?.toLowerCase().includes("gemini");
              if (isGemini) {
                additionalToolResults.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: `Web search for "${args.query}" is being performed via Google Search grounding.`,
                });
              } else {
                additionalToolResults.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: `Web search is currently only available for Gemini models.`,
                });
              }
            }
          }

          // Update messages for next round
          allMessages = [...allMessages, ...additionalToolResults];

          // Update UI to show searching
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: accumulatedText + `\n\n*Searching (round ${toolRound})...*` }
                : m
            )
          );

          // Check if we've hit max rounds
          if (toolRound >= maxToolRounds) {
            console.warn("[Chat] Reached maximum tool rounds, stopping");
            accumulatedText += "\n\n*(Reached maximum search rounds)*";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: accumulatedText }
                  : m
              )
            );
            break;
          }
        }

        // Note: If we exited the loop at maxToolRounds, show a message
        // (This is handled inside the loop by the break condition)

        // Check for incomplete continuation stream
        if (!streamCompleted && accumulatedText) {
          console.warn("[Chat] Continuation stream ended without finish_reason");
          accumulatedText += "\n\n*(Response may be incomplete due to connection issue)*";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: accumulatedText }
                : m
            )
          );
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
        console.log("[Chat] Request aborted by user");
        return;
      }
      console.error("[Chat] Error occurred:", {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      let errorMessage = error instanceof Error ? error.message : "Something went wrong";

      // Check for screenpipe-cloud free tier limits
      if (errorMessage.includes("daily_limit_exceeded")) {
        // Parse resets_at from error if available
        try {
          const match = errorMessage.match(/"resets_at":\s*"([^"]+)"/);
          if (match) setUpgradeResetsAt(match[1]);
        } catch {}
        setUpgradeReason("daily_limit");
        setShowUpgradeDialog(true);
        errorMessage = "You've used all your free queries for today.";
      } else if (errorMessage.includes("model_not_allowed")) {
        setUpgradeReason("model_not_allowed");
        setShowUpgradeDialog(true);
        errorMessage = "This model requires an upgrade.";
      }
      // Check for common API errors and provide helpful messages
      else if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
        errorMessage = "Invalid API key. Please check your preset configuration.";
      } else if (errorMessage.includes("429")) {
        errorMessage = "Rate limit exceeded. Please wait a moment and try again.";
      } else if (
        errorMessage.includes("Failed to fetch") ||
        errorMessage.includes("NetworkError") ||
        errorMessage.includes("network") ||
        errorMessage.includes("ECONNRESET") ||
        errorMessage.includes("stream")
      ) {
        errorMessage = "Connection error. The AI response was interrupted. Please try again.";
      } else if (
        errorMessage.includes("context") ||
        errorMessage.includes("token") ||
        errorMessage.includes("too large") ||
        errorMessage.includes("exceed") ||
        errorMessage.includes("maximum")
      ) {
        errorMessage = "Response too large for model context. Try a more specific search with shorter time range.";
        // Clear old messages to free up context for next query
        setMessages([]);
      }

      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== assistantMessageId || m.content);
        return [
          ...filtered,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: `Error: ${errorMessage}`,
            timestamp: Date.now(),
          },
        ];
      });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;

      // Save conversation after state updates
      setTimeout(() => {
        setMessages((currentMsgs) => {
          if (currentMsgs.length > 0) {
            saveConversation(currentMsgs);
          }
          return currentMsgs;
        });
      }, 100);
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
      {/* Floating buttons when dialog is closed - only on timeline */}
      <AnimatePresence>
      {!open && isOnTimeline && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        >
          {/* Export button - only when frames selected */}
          {(selectionRange?.frameIds?.length ?? 0) > 0 && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={handleExport}
              disabled={isExporting}
              className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-background/90 backdrop-blur-md border border-border/50 hover:border-foreground/20 text-xs text-muted-foreground hover:text-foreground transition-all duration-200 shadow-lg shadow-black/5 disabled:opacity-50"
            >
              <div className="p-1 rounded bg-foreground/5 group-hover:bg-foreground/10 transition-colors">
                {isExporting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Video size={14} />
                )}
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wider">
                {isExporting ? `${Math.round(exportProgress)}%` : (isMac ? "⌘E" : "Ctrl+E")}
              </span>
            </motion.button>
          )}

          {/* AI Chat button - opens standalone chat window */}
          <button
            onClick={() => commands.showWindow("Chat")}
            className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-background/90 backdrop-blur-md border border-border/50 hover:border-foreground/20 text-xs text-muted-foreground hover:text-foreground transition-all duration-200 shadow-lg shadow-black/5"
          >
            <div className="p-1 rounded bg-foreground/5 group-hover:bg-foreground/10 transition-colors">
              <PipeAIIcon size={14} animated={false} />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider">
              {formatShortcutDisplay(settings.showChatShortcut || (isMac ? DEFAULT_CHAT_SHORTCUT_MAC : DEFAULT_CHAT_SHORTCUT_OTHER), isMac)}
            </span>
          </button>
        </motion.div>
      )}
      </AnimatePresence>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">AI Chat</DialogTitle>
        <CustomDialogContent
          className="p-0 max-w-2xl h-[70vh] flex flex-col overflow-hidden bg-background/95 backdrop-blur-xl border-border/50"
          customClose={<X className="w-4 h-4" />}
        >
          {/* Header - sleek geometric style */}
          {/* Add left padding on macOS to avoid traffic light overlap */}
          <div className={cn(
            "relative flex items-center gap-3 px-4 py-3 pr-12 border-b border-border/50 bg-gradient-to-r from-background to-muted/30",
            isMac && "pl-[72px]"
          )}>
            {/* Geometric corner accent - hidden on macOS where traffic lights are */}
            {!isMac && (
              <div className="absolute top-0 left-0 w-8 h-8 border-l-2 border-t-2 border-foreground/10 rounded-tl-lg" />
            )}

            <div className="relative z-10 p-1.5 rounded-lg bg-foreground/5 border border-border/50">
              <PipeAIIcon size={18} animated={false} className="text-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-sm tracking-tight">Pipe AI</h2>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Screen Activity Assistant</p>
            </div>
            <Button
              variant={showHistory ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="h-7 px-2 gap-1 text-xs"
              title="Chat history"
            >
              <History size={14} />
              <span className="hidden sm:inline">History</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={startNewConversation}
              className="h-7 px-3 gap-1.5 text-xs bg-foreground text-background hover:bg-foreground/90"
              title="New chat"
            >
              <Plus size={14} />
              <span>New</span>
            </Button>
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted/50 border border-border/50 rounded">
              {formatShortcutDisplay(settings.showChatShortcut || (isMac ? DEFAULT_CHAT_SHORTCUT_MAC : DEFAULT_CHAT_SHORTCUT_OTHER), isMac)}
            </kbd>
          </div>

          {/* Main content area with optional history sidebar */}
          <div className="flex-1 flex overflow-hidden">
            {/* History Sidebar */}
            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 280, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-r border-border/50 bg-muted/30 flex flex-col overflow-hidden"
                >
                  {/* History Header */}
                  <div className="p-3 border-b border-border/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Chat History</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowHistory(false)}
                        className="h-6 w-6 p-0"
                      >
                        <ChevronLeft size={14} />
                      </Button>
                    </div>
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search conversations..."
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        className="h-8 pl-8 text-xs bg-background/50"
                      />
                    </div>
                  </div>

                  {/* Conversations List */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-3">
                    {groupedConversations.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <History className="h-8 w-8 text-muted-foreground/50 mb-2" />
                        <p className="text-xs text-muted-foreground">
                          {historySearch ? "No matching conversations" : "No chat history yet"}
                        </p>
                      </div>
                    ) : (
                      groupedConversations.map((group) => (
                        <div key={group.label} className="space-y-1">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1">
                            {group.label}
                          </p>
                          {group.conversations.map((conv) => (
                            <div
                              key={conv.id}
                              className={cn(
                                "group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors",
                                conv.id === conversationId
                                  ? "bg-foreground/10"
                                  : "hover:bg-foreground/5"
                              )}
                              onClick={() => loadConversation(conv)}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">
                                  {conv.title}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {conv.messages.length} messages
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteConversation(conv.id);
                                }}
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 size={12} />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                    className="gap-2 font-medium bg-foreground text-background hover:bg-foreground/90"
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
                    "relative flex-1 rounded-xl px-4 py-3 text-sm border overflow-hidden min-w-0",
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
                      pre({ children, ...props }) {
                        return (
                          <pre className="overflow-x-auto rounded-lg bg-neutral-900 dark:bg-neutral-950 text-neutral-100 p-3 my-2 text-xs" style={{ maxWidth: 'calc(100% - 0px)' }} {...props}>
                            {children}
                          </pre>
                        );
                      },
                      code({ className, children, ...props }) {
                        const content = String(children).replace(/\n$/, "");
                        const isMedia = content.trim().toLowerCase().match(/\.(mp4|mp3|wav|webm)$/);
                        const isCodeBlock = className?.includes("language-");

                        if (isMedia) {
                          return <VideoComponent filePath={content.trim()} className="my-2" />;
                        }

                        // Code block (inside pre) - just the code, pre handles styling
                        if (isCodeBlock) {
                          return (
                            <code className="font-mono text-xs block whitespace-pre text-neutral-100" {...props}>
                              {content}
                            </code>
                          );
                        }

                        // Inline code
                        return (
                          <code className="px-1.5 py-0.5 rounded bg-neutral-800 dark:bg-neutral-900 text-neutral-100 font-mono text-xs" {...props}>
                            {content}
                          </code>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </MemoizedReactMarkdown>
                  {/* Upgrade button for daily limit errors */}
                  {message.role === "assistant" &&
                   (message.content.includes("used all your free queries") ||
                    message.content.includes("requires an upgrade")) && (
                    <button
                      onClick={() => setShowUpgradeDialog(true)}
                      className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      <Zap className="h-4 w-4" />
                      upgrade now
                    </button>
                  )}
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
          </div> {/* End of main content area with history sidebar */}

          {/* AI Preset Selector & Input - refined styling */}
          <div className="relative border-t border-border/50 bg-gradient-to-t from-muted/20 to-transparent">
            {/* Geometric accent line */}
            <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

            <div className="p-2 border-b border-border/30">
              <AIPresetsSelector
                onPresetChange={setActivePreset}
                showLoginCta={false}
              />
            </div>
            <form onSubmit={handleSubmit} className="p-3">
              {/* Time context indicator */}
              {selectionRange && !isLoading && (
                <div className="flex items-center gap-2 mb-2 text-[10px]">
                  <span className="text-muted-foreground uppercase tracking-wider">time context:</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted/50 border border-border/50 rounded font-mono text-foreground/70">
                    <span className="w-1 h-1 rounded-full bg-foreground/40" />
                    {selectionRange.start.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {" → "}
                    {selectionRange.end.toLocaleString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-muted-foreground/60">
                    use <code className="px-1 bg-muted/30 rounded">@today</code> <code className="px-1 bg-muted/30 rounded">@yesterday</code> to override
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      disabledReason
                        ? disabledReason
                        : selectionRange
                          ? "Ask about selected time... (type @ for filters)"
                          : "Ask about your screen... (type @ for filters)"
                    }
                    disabled={isLoading || !canChat}
                    className={cn(
                      "flex-1 bg-background/50 border-border/50 focus:border-foreground/30 focus:ring-foreground/10 transition-colors",
                      disabledReason && "border-destructive/50"
                    )}
                  />

                  {/* @mention autocomplete dropdown */}
                  <AnimatePresence>
                    {showMentionDropdown && filteredMentions.length > 0 && (
                      <motion.div
                        ref={dropdownRef}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.1 }}
                        className="absolute bottom-full left-0 right-0 mb-1 bg-background border border-border rounded-lg shadow-lg overflow-hidden z-50 max-h-[240px] overflow-y-auto"
                      >
                        {/* Group by category */}
                        {["time", "content", "app", "speaker"].map(category => {
                          const items = filteredMentions.filter(m => m.category === category);
                          if (items.length === 0) return null;
                          return (
                            <div key={category}>
                              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border/50">
                                {category === "time" ? "time" : category === "content" ? "content type" : category === "speaker" ? "speakers" : "apps"}
                              </div>
                              {items.map((suggestion) => {
                                const globalIndex = filteredMentions.indexOf(suggestion);
                                return (
                                  <button
                                    key={suggestion.tag}
                                    type="button"
                                    onClick={() => insertMention(suggestion.tag)}
                                    className={cn(
                                      "w-full px-3 py-1.5 text-left text-sm flex items-center justify-between gap-2 transition-colors",
                                      globalIndex === selectedMentionIndex
                                        ? "bg-muted text-foreground"
                                        : "hover:bg-muted/50"
                                    )}
                                  >
                                    <span className="font-mono text-xs">{suggestion.tag}</span>
                                    <span className="text-[10px] text-muted-foreground truncate">{suggestion.description}</span>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                        {/* Loading indicator for speaker search */}
                        {isLoadingSpeakers && (
                          <div className="px-3 py-2 text-[10px] text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Searching speakers...</span>
                          </div>
                        )}
                        <div className="px-2 py-1 text-[10px] text-muted-foreground border-t border-border/50 bg-muted/20">
                          <kbd className="px-1 bg-muted rounded text-[9px]">↑↓</kbd> navigate
                          <kbd className="px-1 bg-muted rounded text-[9px] ml-2">tab</kbd> select
                          <kbd className="px-1 bg-muted rounded text-[9px] ml-2">esc</kbd> close
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
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

      <UpgradeDialog
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
        reason={upgradeReason}
        resetsAt={upgradeResetsAt}
      />
    </>
  );
}
