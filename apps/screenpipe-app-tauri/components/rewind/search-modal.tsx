"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Search, X, Loader2, Clock, MessageSquare, User, ArrowLeft, Mic, Volume2 } from "lucide-react";
import { useKeywordSearchStore, SearchMatch } from "@/lib/hooks/use-keyword-search-store";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/utils/tauri";
import { emit } from "@tauri-apps/api/event";

interface SpeakerResult {
  id: number;
  name: string;
  metadata: string;
}

interface AudioTranscription {
  timestamp: string;
  transcription: string;
  device_name: string;
  is_input: boolean;
  speaker_name: string;
  duration_secs: number;
}


interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTimestamp: (timestamp: string) => void;
}

// stopwords to filter out from suggestions
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "this", "that", "was", "are",
  "be", "has", "had", "have", "not", "no", "do", "does", "did", "will",
  "can", "could", "would", "should", "may", "might", "shall", "if", "so",
  "as", "he", "she", "we", "they", "you", "i", "my", "your", "his", "her",
  "its", "our", "their", "me", "him", "us", "them", "am", "been", "being",
  "were", "what", "which", "who", "whom", "when", "where", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "other", "some",
  "such", "than", "too", "very", "just", "about", "above", "after", "again",
  "also", "any", "because", "before", "between", "here", "there", "then",
  "these", "those", "through", "under", "until", "while", "into", "over",
  "only", "own", "same", "still", "up", "out", "off", "down", "now", "new",
  "one", "two", "first", "last", "long", "great", "little", "right", "old",
  "big", "high", "small", "large", "next", "early", "young", "important",
  "public", "bad", "com", "www", "http", "https", "html", "css", "div",
  "span", "class", "true", "false", "null", "undefined", "var", "let",
  "const", "function", "return", "import", "export", "default", "type",
  "interface", "string", "number", "boolean", "object", "array", "void",
  "png", "jpg", "svg", "gif", "pdf", "tsx", "jsx", "src", "img", "alt",
  "width", "height", "style", "font", "size", "color", "text", "data",
  "value", "name", "index", "item", "list", "page", "file", "path",
  "error", "log", "get", "set", "app", "use", "end", "start", "time",
  "date", "day", "year", "month", "week", "like", "make", "know", "take",
  "come", "see", "look", "find", "give", "tell", "think", "say", "help",
  "show", "try", "ask", "need", "feel", "become", "leave", "put", "mean",
  "keep", "let", "begin", "seem", "talk", "turn", "hand", "run", "move",
  "play", "back", "way", "home", "work", "even", "good", "much", "well",
  "part", "made", "got", "going", "went", "done", "said", "line", "click",
  "button", "menu", "view", "open", "close", "save", "edit", "delete",
  "copy", "paste", "select", "search", "enter", "tab", "window", "screen",
]);

function isGarbageWord(word: string): boolean {
  if (word.length < 3 || word.length > 25) return true;
  // too many consonants in a row = OCR garbage
  if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(word)) return true;
  // pure numbers
  if (/^\d+$/.test(word)) return true;
  // numbers mixed with letters (like "h3" "x11" etc)
  if (/\d/.test(word) && /[a-z]/i.test(word) && word.length < 6) return true;
  // repeated chars
  if (/(.)\1{3,}/.test(word)) return true;
  // common file extensions / code tokens
  if (/^\.(js|ts|py|rs|md|json|yaml|toml|lock|env|cfg)$/i.test(word)) return true;
  return false;
}

// words that are proper nouns (Capitalized in original text) are more interesting
function extractInterestingWords(text: string): Map<string, { count: number; original: string }> {
  const words = new Map<string, { count: number; original: string }>();
  // split on whitespace/punctuation but preserve original casing
  const tokens = text.match(/[A-Za-z][a-z]{2,24}/g) || [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;
    if (isGarbageWord(lower)) continue;
    const existing = words.get(lower);
    if (existing) {
      existing.count++;
      // prefer the Capitalized version
      if (token[0] === token[0].toUpperCase() && token.slice(1) === token.slice(1).toLowerCase()) {
        existing.original = token;
      }
    } else {
      words.set(lower, { count: 1, original: token });
    }
  }
  return words;
}

function useSuggestions(isOpen: boolean) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const now = new Date();
        const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        const endTime = new Date(now.getTime() - 10 * 60000);

        const params = new URLSearchParams({
          content_type: "ocr",
          limit: "50",
          offset: "0",
          start_time: sixHoursAgo.toISOString(),
          end_time: endTime.toISOString(),
        });

        const resp = await fetch(`http://localhost:3030/search?${params}`);
        if (!resp.ok || cancelled) return;

        const data = await resp.json();
        const items = data?.data || [];

        // collect app names to exclude them from suggestions
        const appNames = new Set<string>();
        const allWords = new Map<string, { count: number; original: string }>();

        for (const item of items) {
          const content = item?.content || {};
          const appName = (content.app_name || "").toLowerCase();
          if (appName) appNames.add(appName);

          const text = content.text || "";
          const extracted = extractInterestingWords(text);
          for (const [lower, info] of extracted) {
            const existing = allWords.get(lower);
            if (existing) {
              existing.count += info.count;
              // keep the capitalized form
              if (info.original[0] === info.original[0].toUpperCase()) {
                existing.original = info.original;
              }
            } else {
              allWords.set(lower, { ...info });
            }
          }
        }

        if (cancelled) return;

        // filter: exclude app names, must appear 2+ times, not too frequent (UI chrome)
        const maxCount = items.length * 0.6; // if it appears in >60% of frames it's UI chrome
        const candidates = [...allWords.entries()]
          .filter(([lower]) => !appNames.has(lower))
          .filter(([, info]) => info.count >= 2 && info.count < maxCount)
          // prefer proper nouns (capitalized original)
          .sort((a, b) => {
            const aProper = a[1].original[0] === a[1].original[0].toUpperCase() ? 1 : 0;
            const bProper = b[1].original[0] === b[1].original[0].toUpperCase() ? 1 : 0;
            if (bProper !== aProper) return bProper - aProper;
            return b[1].count - a[1].count;
          });

        // take top 20 then randomly pick 8 for variety
        const topPool = candidates.slice(0, 20);
        const shuffled = topPool.sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, 8).map(([, info]) => info.original);

        if (!cancelled) {
          setSuggestions(picked);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  return { suggestions, isLoading };
}

// Frame thumbnail component with loading state
const FrameThumbnail = ({ frameId, alt }: { frameId: number; alt: string }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="aspect-video bg-muted relative overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {hasError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <span className="text-xs text-muted-foreground">unavailable</span>
        </div>
      ) : (
        <img
          src={`http://localhost:3030/frames/${frameId}`}
          alt={alt}
          className={cn(
            "w-full h-full object-cover transition-opacity",
            isLoading ? "opacity-0" : "opacity-100"
          )}
          loading="lazy"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      )}
    </div>
  );
};

// Format relative time
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const time = format(date, "h:mm a");
  if (isToday(date)) return time;
  if (isYesterday(date)) return `yesterday ${time}`;
  return format(date, "MMM d") + " " + time;
}

export function SearchModal({ isOpen, onClose, onNavigateToTimestamp }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Speaker search state
  const [speakerResults, setSpeakerResults] = useState<SpeakerResult[]>([]);
  const [isSearchingSpeakers, setIsSearchingSpeakers] = useState(false);
  // Drill-down: selected speaker to show their transcriptions
  const [selectedSpeaker, setSelectedSpeaker] = useState<SpeakerResult | null>(null);
  const [speakerTranscriptions, setSpeakerTranscriptions] = useState<AudioTranscription[]>([]);
  const [isLoadingTranscriptions, setIsLoadingTranscriptions] = useState(false);
  const [selectedTranscriptionIndex, setSelectedTranscriptionIndex] = useState(0);

  const debouncedQuery = useDebounce(query, 200);
  const { suggestions, isLoading: suggestionsLoading } = useSuggestions(isOpen);

  const {
    searchResults,
    isSearching,
    searchKeywords,
    resetSearch,
  } = useKeywordSearchStore();

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
      setQuery("");
      resetSearch();
      setSpeakerResults([]);
      setSelectedSpeaker(null);
      setSpeakerTranscriptions([]);
      setSelectedTranscriptionIndex(0);

      // Focus after next frame. The panel is made key window on show,
      // but the global shortcut path also calls show_main_window first.
      // A small delay handles the case where make_key_window is still
      // propagating through the window server.
      const rafId = requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 80);

      return () => {
        cancelAnimationFrame(rafId);
        clearTimeout(timer);
      };
    }
  }, [isOpen, resetSearch]);

  // Perform search when query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      resetSearch();
      setSpeakerResults([]);
      return;
    }

    searchKeywords(debouncedQuery, {
      limit: 24,
    });
  }, [debouncedQuery, searchKeywords, resetSearch]);

  // Search speakers in parallel
  useEffect(() => {
    if (!debouncedQuery.trim() || debouncedQuery.length < 2 || selectedSpeaker) {
      setSpeakerResults([]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setIsSearchingSpeakers(true);
      try {
        const resp = await fetch(
          `http://localhost:3030/speakers/search?name=${encodeURIComponent(debouncedQuery)}`,
          { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]) }
        );
        if (resp.ok && !cancelled) {
          const speakers: SpeakerResult[] = await resp.json();
          setSpeakerResults(speakers.filter(s => s.name).slice(0, 5));
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setIsSearchingSpeakers(false);
      }
    })();

    return () => { cancelled = true; controller.abort(); };
  }, [debouncedQuery, selectedSpeaker]);

  // Load transcriptions when a speaker is selected
  useEffect(() => {
    if (!selectedSpeaker) {
      setSpeakerTranscriptions([]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setIsLoadingTranscriptions(true);
      try {
        const params = new URLSearchParams({
          content_type: "audio",
          speaker_name: selectedSpeaker.name,
          limit: "30",
          offset: "0",
        });
        const resp = await fetch(
          `http://localhost:3030/search?${params}`,
          { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) }
        );
        if (resp.ok && !cancelled) {
          const data = await resp.json();
          const items = (data?.data || []).map((item: any) => ({
            timestamp: item.content?.timestamp || "",
            transcription: item.content?.transcription || "",
            device_name: item.content?.device_name || "",
            is_input: item.content?.is_input ?? true,
            speaker_name: item.content?.speaker_name || selectedSpeaker.name,
            duration_secs: item.content?.duration_secs || 0,
          }));
          setSpeakerTranscriptions(items);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setIsLoadingTranscriptions(false);
      }
    })();

    return () => { cancelled = true; controller.abort(); };
  }, [selectedSpeaker]);

  // Send to AI handler
  const handleSendToAI = useCallback(async () => {
    const result = searchResults[selectedIndex];
    if (!result) return;

    const context = `Context from search result:\n${result.app_name} - ${result.window_name}\nTime: ${format(new Date(result.timestamp), "PPpp")}\n\nText:\n${result.text || ""}`;

    // Close search modal first
    onClose();

    // Show chat window (it will overlay on top of timeline, not close it)
    await commands.showWindow("Chat");

    // Small delay to ensure chat window's React components are mounted and listening
    await new Promise(resolve => setTimeout(resolve, 150));

    // Emit prefill event with context and frame image
    await emit("chat-prefill", { context, frameId: result.frame_id });
  }, [searchResults, selectedIndex, onClose]);

  // Handle going back from speaker drill-down
  const handleBackFromSpeaker = useCallback(() => {
    setSelectedSpeaker(null);
    setSpeakerTranscriptions([]);
    setSelectedTranscriptionIndex(0);
    // Re-focus the input
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Speaker drill-down mode
      if (selectedSpeaker) {
        switch (e.key) {
          case "Escape":
            e.preventDefault();
            handleBackFromSpeaker();
            break;
          case "ArrowDown":
            e.preventDefault();
            setSelectedTranscriptionIndex(i => Math.min(i + 1, speakerTranscriptions.length - 1));
            break;
          case "ArrowUp":
            e.preventDefault();
            setSelectedTranscriptionIndex(i => Math.max(i - 1, 0));
            break;
          case "Enter":
            e.preventDefault();
            if (speakerTranscriptions[selectedTranscriptionIndex]?.timestamp) {
              onNavigateToTimestamp(speakerTranscriptions[selectedTranscriptionIndex].timestamp);
              onClose();
            }
            break;
        }
        return;
      }

      const cols = 4; // Grid columns

      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowRight":
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, searchResults.length - 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + cols, searchResults.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - cols, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (e.metaKey || e.ctrlKey) {
            // Cmd+Enter = send to AI
            handleSendToAI();
          } else if (searchResults[selectedIndex]) {
            // Enter = navigate to timestamp
            onNavigateToTimestamp(searchResults[selectedIndex].timestamp);
            onClose();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, searchResults, selectedIndex, selectedSpeaker, speakerTranscriptions, selectedTranscriptionIndex, onClose, onNavigateToTimestamp, handleSendToAI, handleBackFromSpeaker]);

  // Scroll selected item into view
  useEffect(() => {
    if (gridRef.current && searchResults.length > 0) {
      const selectedEl = gridRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, searchResults.length]);

  const handleSelectResult = useCallback((result: SearchMatch) => {
    onNavigateToTimestamp(result.timestamp);
    onClose();
  }, [onNavigateToTimestamp, onClose]);

  if (!isOpen) return null;

  const hasResults = searchResults.length > 0 || speakerResults.length > 0;
  const showEmpty = !isSearching && !isSearchingSpeakers && debouncedQuery && !hasResults && !selectedSpeaker;
  const activeIndex = hoveredIndex ?? selectedIndex;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] isolate"
      onWheel={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {/* Backdrop - captures all pointer events to prevent interaction with timeline */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        onWheel={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onTouchMove={(e) => e.stopPropagation()}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl mx-4 bg-card border border-border shadow-2xl overflow-hidden rounded-lg isolate">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your memory..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm outline-none"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
          />
          {isSearching && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 hover:bg-muted rounded"
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Results area - isolate scroll to prevent timeline from scrolling */}
        <div
          ref={gridRef}
          className="max-h-[60vh] overflow-y-auto p-4 overscroll-contain touch-pan-y"
          onWheel={(e) => {
            e.stopPropagation();
            const target = e.currentTarget;
            const isAtTop = target.scrollTop === 0 && e.deltaY < 0;
            const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight && e.deltaY > 0;
            if (isAtTop || isAtBottom) e.preventDefault();
          }}
          onTouchMove={(e) => e.stopPropagation()}
          onScroll={(e) => e.stopPropagation()}
        >
          {/* === Speaker drill-down view === */}
          {selectedSpeaker ? (
            <div>
              {/* Back button + speaker name */}
              <button
                onClick={handleBackFromSpeaker}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <User className="w-3.5 h-3.5" />
                <span className="font-medium text-foreground">{selectedSpeaker.name}</span>
              </button>

              {isLoadingTranscriptions && (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="bg-muted animate-pulse rounded p-3 h-16" />
                  ))}
                </div>
              )}

              {!isLoadingTranscriptions && speakerTranscriptions.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  no transcriptions found for {selectedSpeaker.name}
                </div>
              )}

              {speakerTranscriptions.length > 0 && (
                <div className="space-y-1">
                  {speakerTranscriptions.map((t, index) => (
                    <div
                      key={`${t.timestamp}-${index}`}
                      data-index={index}
                      onClick={() => {
                        if (t.timestamp) {
                          onNavigateToTimestamp(t.timestamp);
                          onClose();
                        }
                      }}
                      className={cn(
                        "px-3 py-2.5 rounded cursor-pointer transition-all duration-100",
                        index === selectedTranscriptionIndex
                          ? "bg-foreground/10 ring-1 ring-foreground/20"
                          : "hover:bg-muted"
                      )}
                    >
                      <p className="text-sm text-foreground leading-relaxed line-clamp-2">
                        {t.transcription || "(empty)"}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          {t.timestamp ? formatRelativeTime(t.timestamp) : "unknown"}
                        </span>
                        <span className="flex items-center gap-1">
                          {t.is_input ? <Mic className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                          {t.is_input ? "mic" : "speaker"}
                        </span>
                        {t.duration_secs > 0 && (
                          <span>{Math.round(t.duration_secs)}s</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Empty state */}
              {showEmpty && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  no results for &quot;{debouncedQuery}&quot;
                </div>
              )}

              {/* Loading skeleton */}
              {isSearching && searchResults.length === 0 && speakerResults.length === 0 && (
                <div className="grid grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="bg-muted animate-pulse rounded overflow-hidden">
                      <div className="aspect-video" />
                      <div className="p-2 space-y-1">
                        <div className="h-3 bg-muted-foreground/20 rounded w-16" />
                        <div className="h-2 bg-muted-foreground/20 rounded w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* People section */}
              {speakerResults.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                    <User className="w-3 h-3" />
                    people
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {speakerResults.map((speaker) => (
                      <button
                        key={speaker.id}
                        onClick={() => {
                          setSelectedSpeaker(speaker);
                          setSelectedTranscriptionIndex(0);
                        }}
                        className="flex items-center gap-2 px-3 py-2 border border-border rounded-md
                          hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer"
                      >
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{speaker.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Screen results grid */}
              {searchResults.length > 0 && (
                <>
                  {speakerResults.length > 0 && (
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Search className="w-3 h-3" />
                      screen
                    </p>
                  )}
                  <div className="grid grid-cols-4 gap-3">
                    {searchResults.map((result, index) => {
                      const isActive = index === activeIndex;

                      return (
                        <div
                          key={result.frame_id}
                          data-index={index}
                          onClick={() => handleSelectResult(result)}
                          onMouseEnter={() => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex(null)}
                          className={cn(
                            "cursor-pointer rounded overflow-hidden border transition-all duration-150",
                            isActive
                              ? "ring-2 ring-foreground border-foreground scale-[1.02] shadow-lg z-10"
                              : "border-border hover:border-foreground/50"
                          )}
                        >
                          <FrameThumbnail
                            frameId={result.frame_id}
                            alt={`${result.app_name} - ${result.window_name}`}
                          />
                          <div className="p-2 bg-card">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                              <Clock className="w-3 h-3" />
                              <span className="font-mono">{formatRelativeTime(result.timestamp)}</span>
                            </div>
                            <p className="text-xs font-medium text-foreground truncate">
                              {result.app_name}
                            </p>
                            {isActive && (
                              <div className="mt-1 pt-1 border-t border-border space-y-1">
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {result.window_name}
                                </p>
                                {result.url && (
                                  <p className="text-xs text-muted-foreground/70 truncate">
                                    {result.url}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Suggestions when no query */}
              {!debouncedQuery && !isSearching && (
                <div className="py-8 px-2">
                  {suggestions.length > 0 ? (
                    <>
                      <p className="text-xs text-muted-foreground mb-3 text-center">
                        from your recent activity
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {suggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => setQuery(suggestion)}
                            className="px-3 py-1.5 text-sm border border-border rounded-md
                              hover:bg-muted hover:border-foreground/30 transition-colors
                              text-foreground/80 hover:text-foreground cursor-pointer"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : suggestionsLoading ? (
                    <div className="text-center text-sm text-muted-foreground">
                      loading suggestions...
                    </div>
                  ) : (
                    <div className="text-center text-sm text-muted-foreground">
                      type to search your screen history
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
          <div className="flex items-center gap-4">
            {selectedSpeaker ? (
              <>
                <span>↑↓ navigate</span>
                <span>⏎ go to timeline</span>
                <span>esc back</span>
              </>
            ) : (
              <>
                <span>←→↑↓ navigate</span>
                <span>⏎ go to timeline</span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  ⌘⏎ ask AI
                </span>
              </>
            )}
          </div>
          <span>esc {selectedSpeaker ? "back" : "close"}</span>
        </div>
      </div>
    </div>
  );
}
