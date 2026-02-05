"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Search, X, Loader2, Clock, MessageSquare } from "lucide-react";
import { useKeywordSearchStore, SearchMatch } from "@/lib/hooks/use-keyword-search-store";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/utils/tauri";
import { emit } from "@tauri-apps/api/event";


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
  if (word.length < 3 || word.length > 20) return true;
  if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(word)) return true;
  if (/\d/.test(word) && /[a-z]/i.test(word)) return true;
  if (word === word.toUpperCase() && word.length < 5) return true;
  if (/(.)\1{3,}/.test(word)) return true;
  return false;
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

        const appCounts = new Map<string, number>();
        const wordCounts = new Map<string, number>();

        for (const item of items) {
          const content = item?.content || {};
          const appName = content.app_name || "";
          if (appName && !appName.toLowerCase().includes("screenpipe")) {
            appCounts.set(appName, (appCounts.get(appName) || 0) + 1);
          }

          const text = content.text || "";
          const words = text.split(/[\s\n\r\t,;:!?()[\]{}<>="'/\\|`~@#$%^&*+]+/);
          for (const raw of words) {
            const word = raw.toLowerCase().trim();
            if (STOP_WORDS.has(word)) continue;
            if (isGarbageWord(word)) continue;
            wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
          }
        }

        if (cancelled) return;

        const topApps = [...appCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name]) => name);

        const appNamesLower = new Set(topApps.map((a) => a.toLowerCase()));
        const meaningfulWords = [...wordCounts.entries()]
          .filter(([word]) => !appNamesLower.has(word))
          .filter(([, count]) => count >= 2)
          .sort((a, b) => b[1] - a[1]);

        // take top 15 then randomly pick 6 for variety
        const topPool = meaningfulWords.slice(0, 15);
        const shuffled = topPool.sort(() => Math.random() - 0.5);
        const pickedWords = shuffled.slice(0, 6).map(([word]) => word);

        const combined = [...topApps, ...pickedWords].slice(0, 8);

        if (!cancelled) {
          setSuggestions(combined);
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

      // Single rAF is enough — the NSPanel is now made key window
      // on show, so the input can receive focus immediately.
      const rafId = requestAnimationFrame(() => {
        inputRef.current?.focus();
      });

      return () => cancelAnimationFrame(rafId);
    }
  }, [isOpen, resetSearch]);

  // Perform search when query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      resetSearch();
      return;
    }

    searchKeywords(debouncedQuery, {
      limit: 24,
    });
  }, [debouncedQuery, searchKeywords, resetSearch]);

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

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [isOpen, searchResults, selectedIndex, onClose, onNavigateToTimestamp, handleSendToAI]);

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

  const hasResults = searchResults.length > 0;
  const showEmpty = !isSearching && debouncedQuery && !hasResults;
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

        {/* Results Grid - isolate scroll to prevent timeline from scrolling */}
        <div
          ref={gridRef}
          className="max-h-[60vh] overflow-y-auto p-4 overscroll-contain touch-pan-y"
          onWheel={(e) => {
            // Stop event from reaching timeline, but allow scrolling within this container
            e.stopPropagation();

            // Check if we're at scroll boundaries - if so, prevent default to avoid
            // the event from propagating and scrolling the timeline
            const target = e.currentTarget;
            const isAtTop = target.scrollTop === 0 && e.deltaY < 0;
            const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight && e.deltaY > 0;

            if (isAtTop || isAtBottom) {
              e.preventDefault();
            }
          }}
          onTouchMove={(e) => e.stopPropagation()}
          onScroll={(e) => e.stopPropagation()}
        >
          {/* Empty state */}
          {showEmpty && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              no results for &quot;{debouncedQuery}&quot;
            </div>
          )}

          {/* Loading skeleton */}
          {isSearching && searchResults.length === 0 && (
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

          {/* Results grid */}
          {hasResults && (
            <div className="grid grid-cols-4 gap-3">
              {searchResults.map((result, index) => {
                const isActive = index === activeIndex;
                const isHovered = index === hoveredIndex;

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
                      {/* Expanded details on hover/select - hide noisy OCR, show useful metadata */}
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
        </div>

        {/* Footer with keyboard hints */}
        <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
          <div className="flex items-center gap-4">
            <span>←→↑↓ navigate</span>
            <span>⏎ go to timeline</span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              ⌘⏎ ask AI
            </span>
          </div>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
