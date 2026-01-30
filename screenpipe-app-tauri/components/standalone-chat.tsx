"use client";

import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettings, ChatMessage, ChatConversation } from "@/lib/hooks/use-settings";
import { cn } from "@/lib/utils";
import { Loader2, Send, Square, User, Settings, ExternalLink, X, ImageIcon, Zap, History, Search, Trash2, ChevronLeft, Plus } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
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
import { getCurrentWindow } from "@tauri-apps/api/window";
import { usePlatform } from "@/lib/hooks/use-platform";
import { useSqlAutocomplete } from "@/lib/hooks/use-sql-autocomplete";
import { commands } from "@/lib/utils/tauri";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import {
  parseMentions,
  buildAppMentionSuggestions,
  normalizeAppTag,
} from "@/components/global-chat";

const SCREENPIPE_API = "http://localhost:3030";

interface MentionSuggestion {
  tag: string;
  description: string;
  category: "time" | "content" | "app" | "speaker";
  appName?: string;
}

const APP_SUGGESTION_LIMIT = 10;

interface Speaker {
  id: number;
  name: string;
  metadata?: string;
}

const STATIC_MENTION_SUGGESTIONS: MentionSuggestion[] = [
  { tag: "@today", description: "today's activity", category: "time" },
  { tag: "@yesterday", description: "yesterday", category: "time" },
  { tag: "@last-week", description: "past 7 days", category: "time" },
  { tag: "@last-hour", description: "past hour", category: "time" },
  { tag: "@audio", description: "audio/meetings only", category: "content" },
  { tag: "@screen", description: "screen text only", category: "content" },
];

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
- If query times out, retry with shorter time range (30 mins)`,
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "Search keywords. Be specific. Optional but recommended." },
          content_type: { type: "string", enum: ["all", "ocr", "audio", "ui"], description: "Filter by type." },
          limit: { type: "integer", description: "Max results (1-20). Default: 10" },
          start_time: { type: "string", description: "ISO 8601 UTC start time. REQUIRED." },
          end_time: { type: "string", description: "ISO 8601 UTC end time." },
          app_name: { type: "string", description: "Filter by app name." },
          window_name: { type: "string", description: "Filter by window title." },
          speaker_name: { type: "string", description: "Filter audio by speaker name." },
        },
      },
    },
  },
];

// Helper to get timezone offset string (e.g., "+1" or "-5")
function getTimezoneOffsetString(): string {
  const offsetMinutes = new Date().getTimezoneOffset();
  const offsetHours = -offsetMinutes / 60; // Negate because getTimezoneOffset returns opposite sign
  return offsetHours >= 0 ? `+${offsetHours}` : `${offsetHours}`;
}

// Build system prompt dynamically to ensure current time is accurate
function buildSystemPrompt(): string {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetStr = getTimezoneOffsetString();

  return `You are a helpful AI assistant that can search through the user's Screenpipe data - their screen recordings, audio transcriptions, and UI interactions.

CRITICAL SEARCH RULES (database has 600k+ entries - ALWAYS use time filters):
1. ALWAYS include start_time in EVERY search - NEVER search without a time range
2. Default time range: last 1-2 hours. Expand ONLY if no results found
3. ALWAYS use app_name filter when user mentions ANY app
4. Keep limit=5-10 initially

Rules for showing videos/audio:
- Show videos by putting .mp4 file paths in inline code blocks: \`/path/to/video.mp4\`
- Use the exact, absolute file_path from search results

Be concise. Cite timestamps when relevant. Always display times in the user's local timezone.

Current time: ${now.toISOString()}
User's timezone: ${timezone} (UTC${offsetStr})
User's local time: ${now.toLocaleString()}`;
}

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

export function StandaloneChat() {
  const { settings, updateSettings, isSettingsLoaded } = useSettings();
  const { isMac } = usePlatform();
  const { items: appItems } = useSqlAutocomplete("app");

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

  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"daily_limit" | "model_not_allowed">("daily_limit");
  const [upgradeResetsAt, setUpgradeResetsAt] = useState<string | undefined>();
  const [prefillContext, setPrefillContext] = useState<string | null>(null);
  const [prefillFrameId, setPrefillFrameId] = useState<number | null>(null);
  const [pastedImage, setPastedImage] = useState<string | null>(null); // Base64 data URL
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Chat history state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  // Process an image file to base64
  const processImageFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setPastedImage(base64);
    };
    reader.readAsDataURL(file);
  }, []);

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
    setPastedImage(null);
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

  // Handle drag events for image drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;

    // Check if dragging files that include images
    const hasFiles = e.dataTransfer.types.includes("Files");
    if (hasFiles) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;

    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      // Find first image file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith("image/")) {
          processImageFile(file);
          break;
        }
      }
    }
  }, [processImageFile]);

  // Handle paste events to capture images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    const files = e.clipboardData?.files;

    // Try items first (works in most browsers)
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            processImageFile(file);
          }
          return;
        }
      }
    }

    // Fallback: try files array (some browsers put images here)
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith("image/")) {
          e.preventDefault();
          processImageFile(file);
          return;
        }
      }
    }
  }, [processImageFile]);

  // Listen for chat-prefill events from search modal
  useEffect(() => {
    const unlisten = listen<{ context: string; prompt?: string; frameId?: number }>("chat-prefill", (event) => {
      const { context, prompt, frameId } = event.payload;
      setPrefillContext(context);
      if (frameId) {
        setPrefillFrameId(frameId);
      }
      if (prompt) {
        setInput(prompt);
      }
      // Focus the input
      setTimeout(() => inputRef.current?.focus(), 100);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

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

  // Parse current input to extract active filters for chip display
  const activeFilters = React.useMemo(() => {
    if (!input.trim()) return { timeRanges: [], contentType: null, appName: null, speakerName: null };
    const parsed = parseMentions(input, { appTagMap });
    return {
      timeRanges: parsed.timeRanges,
      contentType: parsed.contentType,
      appName: parsed.appName,
      speakerName: parsed.speakerName,
    };
  }, [input, appTagMap]);

  // Check if any filters are active
  const hasActiveFilters = activeFilters.timeRanges.length > 0 ||
    activeFilters.contentType ||
    activeFilters.appName ||
    activeFilters.speakerName;

  // Remove a specific @mention from input
  const removeFilter = (filterType: "time" | "content" | "app" | "speaker", label?: string) => {
    let newInput = input;
    if (filterType === "time" && label) {
      // Remove time mentions like @today, @yesterday, @last-hour, etc.
      const timePatterns: Record<string, RegExp> = {
        "today": /@today\b/gi,
        "yesterday": /@yesterday\b/gi,
        "last week": /@last[- ]?week\b/gi,
        "last hour": /@last[- ]?hour\b/gi,
        "this morning": /@this[- ]?morning\b/gi,
      };
      const pattern = timePatterns[label];
      if (pattern) newInput = newInput.replace(pattern, "").trim();
    } else if (filterType === "content") {
      newInput = newInput.replace(/@(audio|screen)\b/gi, "").trim();
    } else if (filterType === "app" && activeFilters.appName) {
      // Remove app mention - need to find the pattern
      const appPattern = new RegExp(`@${activeFilters.appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "gi");
      newInput = newInput.replace(appPattern, "").trim();
      // Also try normalized versions
      for (const [tag, name] of Object.entries(appTagMap)) {
        if (name === activeFilters.appName) {
          newInput = newInput.replace(new RegExp(`@${tag}\\b`, "gi"), "").trim();
        }
      }
    } else if (filterType === "speaker" && activeFilters.speakerName) {
      const speakerPattern = new RegExp(`@"?${activeFilters.speakerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?\\b`, "gi");
      newInput = newInput.replace(speakerPattern, "").trim();
    }
    // Clean up extra spaces
    newInput = newInput.replace(/\s+/g, " ").trim();
    setInput(newInput);
  };

  // Fetch speakers dynamically
  useEffect(() => {
    if (!mentionFilter || mentionFilter.length < 1) {
      setSpeakerSuggestions([]);
      return;
    }

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
            .filter(s => s.name)
            .slice(0, 5)
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

  const filteredMentions = React.useMemo(() => {
    const suggestions = !mentionFilter
      ? baseMentionSuggestions
      : baseMentionSuggestions.filter(
          s => s.tag.toLowerCase().includes(mentionFilter.toLowerCase()) ||
               s.description.toLowerCase().includes(mentionFilter.toLowerCase())
        );
    return [...suggestions, ...speakerSuggestions];
  }, [mentionFilter, speakerSuggestions, baseMentionSuggestions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);

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

  const insertMention = (tag: string) => {
    const cursorPos = inputRef.current?.selectionStart || input.length;
    const textBeforeCursor = input.slice(0, cursorPos);
    const textAfterCursor = input.slice(cursorPos);

    const atIndex = textBeforeCursor.lastIndexOf("@");
    if (atIndex !== -1) {
      const newValue = textBeforeCursor.slice(0, atIndex) + tag + " " + textAfterCursor;
      setInput(newValue);
    }

    setShowMentionDropdown(false);
    setMentionFilter("");
    inputRef.current?.focus();
  };

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

  useEffect(() => {
    const defaultPreset = settings.aiPresets?.find((p) => p.defaultPreset);
    setActivePreset(defaultPreset || settings.aiPresets?.[0]);
  }, [settings.aiPresets]);

  const hasPresets = settings.aiPresets && settings.aiPresets.length > 0;
  const hasValidModel = activePreset?.model && activePreset.model.trim() !== "";
  const needsLogin = activePreset?.provider === "screenpipe-cloud" && !settings.user?.token;
  const canChat = hasPresets && hasValidModel && !needsLogin;

  const getDisabledReason = (): string | null => {
    if (!hasPresets) return "No AI presets configured";
    if (!activePreset) return "No preset selected";
    if (!hasValidModel) return `No model selected in "${activePreset.id}" preset`;
    if (needsLogin) return "Login required for Screenpipe Cloud";
    return null;
  };
  const disabledReason = getDisabledReason();

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Escape key to close window
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showMentionDropdown) {
        commands.closeWindow("Chat");
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showMentionDropdown]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function executeSearchTool(args: Record<string, unknown>): Promise<string> {
    const MAX_LIMIT = 10;
    const MAX_RESPONSE_CHARS = 4000;
    const MAX_TEXT_PER_RESULT = 300;

    try {
      const params = new URLSearchParams();
      if (args.q) params.append("q", String(args.q));
      if (args.content_type && args.content_type !== "all") {
        params.append("content_type", String(args.content_type));
      }

      const requestedLimit = args.limit ? Number(args.limit) : 10;
      const limit = Math.min(requestedLimit, MAX_LIMIT);
      params.append("limit", String(limit));

      if (args.start_time) params.append("start_time", String(args.start_time));
      if (args.end_time) params.append("end_time", String(args.end_time));
      if (args.app_name) params.append("app_name", String(args.app_name));
      if (args.window_name) params.append("window_name", String(args.window_name));
      if (args.speaker_name) params.append("speaker_name", String(args.speaker_name));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${SCREENPIPE_API}/search?${params.toString()}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Search failed: ${response.status}`);

      const data = await response.json();

      if (data.error) {
        return `Search failed: ${data.error}`;
      }

      const searchResults = data.data || [];

      if (searchResults.length === 0) {
        return "No results found. Try broader search terms or wider time range.";
      }

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

      if (result.length > MAX_RESPONSE_CHARS) {
        return `Search returned too much data. Try a narrower time range.`;
      }

      return `Found ${searchResults.length} results:\n\n${result}`;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return "Search timed out. Retry with narrower time range and start_time within last 30-60 minutes.";
      }
      return `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  function getOpenAIClient(): OpenAI | null {
    if (!activePreset) return null;

    const apiKey =
      activePreset.provider === "screenpipe-cloud"
        ? settings.user?.token || "anonymous"
        : "apiKey" in activePreset
          ? (activePreset.apiKey as string) || ""
          : "";

    const baseURL =
      activePreset.provider === "screenpipe-cloud"
        ? "https://api.screenpi.pe/v1"
        : activePreset.url;

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

  async function sendMessage(userMessage: string) {
    if (!canChat || !activePreset) return;

    const openai = getOpenAIClient();
    if (!openai) return;

    const mentions = parseMentions(userMessage, { appTagMap });
    const displayMessage = userMessage;
    const processedMessage = mentions.cleanedInput || userMessage;

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
      let systemPrompt = buildSystemPrompt();

      const mentionContext: string[] = [];

      if (mentions.timeRanges.length > 0) {
        const timeContext = mentions.timeRanges.map(t =>
          `- ${t.label}: from ${t.start.toISOString()} to ${t.end.toISOString()}`
        ).join("\n");
        mentionContext.push(`TIME FILTER:\n${timeContext}`);
      }

      if (mentions.contentType) {
        mentionContext.push(`CONTENT TYPE FILTER: ${mentions.contentType}`);
      }

      if (mentions.appName) {
        mentionContext.push(`APP FILTER: ${mentions.appName}`);
      }

      if (mentions.speakerName) {
        mentionContext.push(`SPEAKER FILTER: ${mentions.speakerName}`);
      }

      // Add prefill context from search modal
      if (prefillContext) {
        mentionContext.push(`CONTEXT FROM SEARCH:\n${prefillContext}`);
        // Clear prefill after using it
        setPrefillContext(null);
      }

      if (mentionContext.length > 0) {
        systemPrompt += `\n\nUser specified filters via @mentions:\n${mentionContext.join("\n\n")}`;
      }

      // Fetch frame image if prefillFrameId is set
      let frameImageBase64: string | null = null;
      if (prefillFrameId) {
        try {
          const response = await fetch(`http://localhost:3030/frames/${prefillFrameId}`);
          if (response.ok) {
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const base64 = btoa(
              new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            const mimeType = blob.type || 'image/png';
            frameImageBase64 = `data:${mimeType};base64,${base64}`;
          }
        } catch (error) {
          console.error("Failed to fetch frame image:", error);
        }
        // Clear after using
        setPrefillFrameId(null);
      }

      // Also include pasted image if present
      let pastedImageBase64: string | null = null;
      if (pastedImage) {
        pastedImageBase64 = pastedImage;
        // Clear after using
        setPastedImage(null);
      }

      const MAX_HISTORY = 10;
      const recentMessages = messages.slice(-MAX_HISTORY);

      // Build user message - multimodal if we have image(s)
      let userMessageContent: OpenAI.Chat.ChatCompletionUserMessageParam["content"];
      const hasAnyImage = frameImageBase64 || pastedImageBase64;

      if (hasAnyImage) {
        const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = [
          { type: "text" as const, text: processedMessage },
        ];

        if (frameImageBase64) {
          contentParts.push({
            type: "image_url" as const,
            image_url: { url: frameImageBase64, detail: "auto" as const }
          });
        }

        if (pastedImageBase64) {
          contentParts.push({
            type: "image_url" as const,
            image_url: { url: pastedImageBase64, detail: "auto" as const }
          });
        }

        userMessageContent = contentParts;
      } else {
        userMessageContent = processedMessage;
      }

      const conversationMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...recentMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: userMessageContent },
      ];

      // Debug: log if image is being sent
      if (hasAnyImage) {
        console.log("[Chat] Sending multimodal message with image(s):", {
          hasFrameImage: !!frameImageBase64,
          hasPastedImage: !!pastedImageBase64,
          contentParts: Array.isArray(userMessageContent) ? userMessageContent.length : 1,
          model: activePreset?.model,
          provider: activePreset?.provider,
        });
      }

      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, role: "assistant", content: "", timestamp: Date.now() },
      ]);

      let accumulatedText = "";
      let toolCalls: any[] = [];

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

      if (toolCalls.length > 0) {
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

        const toolResults: OpenAI.Chat.ChatCompletionMessageParam[] = [];

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

      if (errorMessage.includes("daily_limit_exceeded")) {
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
      } else if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
        errorMessage = "Invalid API key. Please check your preset configuration.";
      } else if (errorMessage.includes("429")) {
        errorMessage = "Rate limit exceeded. Please wait and try again.";
      } else if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
        errorMessage = "Network error. Check your connection.";
      } else if (
        errorMessage.includes("context") ||
        errorMessage.includes("token") ||
        errorMessage.includes("too large")
      ) {
        errorMessage = "Response too large. Try a more specific search.";
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
    <div className="flex flex-col h-screen bg-background">
      {/* Header - draggable */}
      {/* Add left padding on macOS to avoid traffic light overlap */}
      <div
        className={cn(
          "relative flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-gradient-to-r from-background to-muted/30 cursor-grab active:cursor-grabbing",
          isMac && "pl-[72px]"
        )}
        onMouseDown={async (e) => {
          if (e.button === 0) {
            try {
              await getCurrentWindow().startDragging();
            } catch {
              // Ignore drag errors
            }
          }
        }}
      >
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
          onClick={(e) => {
            e.stopPropagation();
            setShowHistory(!showHistory);
          }}
          className="h-7 px-2 gap-1 text-xs"
          title="Chat history"
        >
          <History size={14} />
          <span className="hidden sm:inline">History</span>
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            startNewConversation();
          }}
          className="h-7 px-3 gap-1.5 text-xs bg-foreground text-background hover:bg-foreground/90"
          title="New chat"
        >
          <Plus size={14} />
          <span>New</span>
        </Button>
        <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted/50 border border-border/50 rounded">
          {isMac ? "⌘⌥" : "Alt+"}L
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

        {/* Messages */}
        <div className="relative flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && disabledReason && (
          <div className="relative flex flex-col items-center justify-center py-12 space-y-4">
            <div className={cn(
              "relative p-6 rounded-2xl border",
              needsLogin
                ? "bg-muted/50 border-border/50"
                : "bg-destructive/5 border-destructive/20"
            )}>
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
                  await commands.showWindow({ Settings: { page: null } });
                }}
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                Go to Settings
              </Button>
            )}
          </div>
        )}
        {messages.length === 0 && canChat && (
          <div className="relative text-center py-12">
            <div className="relative mx-auto mb-6 w-fit">
              <div className="absolute -inset-4 border border-dashed border-border/50 rounded-xl" />
              <div className="absolute -inset-2 border border-border/30 rounded-lg" />
              <PipeAIIconLarge size={56} thinking={false} className="relative text-foreground/80" />
            </div>
            <h3 className="text-base font-medium mb-2 text-foreground">Ask about your screen activity</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Search your recordings, transcriptions, and interactions
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm mx-auto text-xs text-muted-foreground">
              <span className="px-2 py-1 bg-muted/30 rounded border border-border/30 font-mono">&quot;What did I do in the last hour?&quot;</span>
              <span className="px-2 py-1 bg-muted/30 rounded border border-border/30 font-mono">&quot;Find my Slack messages&quot;</span>
            </div>
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
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

      {/* Input */}
      <div className="relative border-t border-border/50 bg-gradient-to-t from-muted/20 to-transparent">
        <div className="p-2 border-b border-border/30">
          <AIPresetsSelector
            onPresetChange={setActivePreset}
            showLoginCta={false}
          />
        </div>

        {/* Prefill context indicator from search */}
        {(prefillContext || prefillFrameId) && (
          <div className="px-3 py-2 border-b border-border/30 bg-muted/30">
            <div className="flex items-start justify-between gap-2">
              {prefillFrameId && (
                <div className="flex-shrink-0">
                  <div className="relative group">
                    <img
                      src={`http://localhost:3030/frames/${prefillFrameId}`}
                      alt="Attached frame"
                      className="w-16 h-12 object-cover rounded border border-border/50"
                    />
                    <button
                      type="button"
                      onClick={() => setPrefillFrameId(null)}
                      className="absolute -top-1 -right-1 p-0.5 bg-background rounded-full border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              )}
              {prefillContext && (
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    context from search
                  </div>
                  <p className="text-xs text-foreground font-mono line-clamp-2">
                    {prefillContext.slice(0, 150)}{prefillContext.length > 150 ? "..." : ""}
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setPrefillContext(null);
                  setPrefillFrameId(null);
                }}
                className="p-1 hover:bg-muted rounded text-muted-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Active filters chips */}
        {hasActiveFilters && (
          <div className="px-3 py-2 border-b border-border/30 flex flex-wrap gap-1.5">
            {activeFilters.timeRanges.map((range, idx) => (
              <button
                key={`time-${idx}`}
                type="button"
                onClick={() => removeFilter("time", range.label)}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-full hover:bg-blue-500/20 transition-colors"
              >
                <span>🕐</span>
                <span>{range.label}</span>
                <X className="w-2.5 h-2.5 ml-0.5" />
              </button>
            ))}
            {activeFilters.contentType && (
              <button
                type="button"
                onClick={() => removeFilter("content")}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 rounded-full hover:bg-purple-500/20 transition-colors"
              >
                <span>{activeFilters.contentType === "audio" ? "🎤" : "🖥️"}</span>
                <span>{activeFilters.contentType}</span>
                <X className="w-2.5 h-2.5 ml-0.5" />
              </button>
            )}
            {activeFilters.appName && (
              <button
                type="button"
                onClick={() => removeFilter("app")}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 rounded-full hover:bg-green-500/20 transition-colors"
              >
                <span>📱</span>
                <span>{activeFilters.appName}</span>
                <X className="w-2.5 h-2.5 ml-0.5" />
              </button>
            )}
            {activeFilters.speakerName && (
              <button
                type="button"
                onClick={() => removeFilter("speaker")}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 rounded-full hover:bg-orange-500/20 transition-colors"
              >
                <span>👤</span>
                <span>{activeFilters.speakerName}</span>
                <X className="w-2.5 h-2.5 ml-0.5" />
              </button>
            )}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="p-3 relative"
          onPaste={handlePaste}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drop zone overlay */}
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm rounded-lg border-2 border-dashed border-primary m-1"
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ duration: 0.15, delay: 0.05 }}
                  className="flex flex-col items-center gap-3 p-6"
                >
                  <motion.div
                    animate={{
                      y: [0, -8, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="p-4 rounded-2xl bg-primary/10 border border-primary/20"
                  >
                    <ImageIcon className="w-8 h-8 text-primary" />
                  </motion.div>
                  <div className="text-center">
                    <p className="font-semibold text-foreground">Drop your image here</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF, or WebP</p>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

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
                    : "Ask about your screen... (type @ for filters, paste images)"
                }
                disabled={isLoading || !canChat}
                className={cn(
                  "flex-1 bg-background/50 border-border/50 focus:border-foreground/30 focus:ring-foreground/10 transition-colors",
                  disabledReason && "border-destructive/50",
                  pastedImage && "pr-14" // Make room for image preview
                )}
              />

              {/* Pasted image preview inside input */}
              {pastedImage && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <div className="relative group">
                    <img
                      src={pastedImage}
                      alt="Pasted"
                      className="h-7 w-7 object-cover rounded border border-border/50"
                    />
                    <button
                      type="button"
                      onClick={() => setPastedImage(null)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              )}

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
                    {isLoadingSpeakers && (
                      <div className="px-3 py-2 text-[10px] text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Searching speakers...</span>
                      </div>
                    )}
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

      <UpgradeDialog
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
        reason={upgradeReason}
        resetsAt={upgradeResetsAt}
      />
    </div>
  );
}
