"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Search, X, Loader2, Mic, ArrowRight, MessageSquare } from "lucide-react";
import { useKeywordSearchStore, SearchMatch } from "@/lib/hooks/use-keyword-search-store";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { format, subDays, startOfDay, endOfDay, isToday, isYesterday } from "date-fns";
import { emit } from "@tauri-apps/api/event";
import { commands } from "@/lib/utils/tauri";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTimestamp: (timestamp: string) => void;
}

interface ParsedQuery {
  keywords: string[];
  app?: string;
  timeRange?: { start: Date; end: Date };
  timeLabel?: string;
}

// Parse natural language query into structured filters
function parseQuery(query: string): ParsedQuery {
  const result: ParsedQuery = { keywords: [] };
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const keywordWords: string[] = [];

  for (const word of words) {
    // Time filters
    if (word === "today") {
      result.timeRange = { start: startOfDay(new Date()), end: endOfDay(new Date()) };
      result.timeLabel = "today";
    } else if (word === "yesterday") {
      const yesterday = subDays(new Date(), 1);
      result.timeRange = { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      result.timeLabel = "yesterday";
    } else if (word === "week" || word === "this-week") {
      result.timeRange = { start: subDays(new Date(), 7), end: new Date() };
      result.timeLabel = "this week";
    }
    // App filters (common apps)
    else if (["slack", "discord", "teams", "zoom", "chrome", "safari", "firefox", "vscode", "code", "notion", "figma", "terminal", "iterm"].includes(word)) {
      result.app = word === "code" ? "Visual Studio Code" : word.charAt(0).toUpperCase() + word.slice(1);
    }
    // Explicit app filter with @
    else if (word.startsWith("@")) {
      result.app = word.slice(1).charAt(0).toUpperCase() + word.slice(2);
    }
    // Regular keyword
    else {
      keywordWords.push(word);
    }
  }

  result.keywords = keywordWords;
  return result;
}

// Highlight matched text in a string
function highlightMatch(text: string, keywords: string[]): React.ReactNode {
  if (!keywords.length || !text) return text;

  const pattern = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);

  return parts.map((part, i) => {
    const isMatch = keywords.some(k => part.toLowerCase() === k.toLowerCase());
    return isMatch ? (
      <span key={i} className="bg-foreground/20 text-foreground font-medium">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    );
  });
}

// Format relative time
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const time = format(date, "h:mm a");

  if (isToday(date)) return time;
  if (isYesterday(date)) return `yesterday ${time}`;
  return format(date, "MMM d") + " " + time;
}

// Group results by date
function groupResultsByDate(results: SearchMatch[]): { label: string; results: SearchMatch[] }[] {
  const groups: Map<string, SearchMatch[]> = new Map();

  for (const result of results) {
    const date = new Date(result.timestamp);
    let label: string;

    if (isToday(date)) {
      label = "today";
    } else if (isYesterday(date)) {
      label = "yesterday";
    } else {
      label = format(date, "EEEE, MMM d");
    }

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(result);
  }

  return Array.from(groups.entries()).map(([label, results]) => ({ label, results }));
}

export function SearchModal({ isOpen, onClose, onNavigateToTimestamp }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 200);
  const parsedQuery = useMemo(() => parseQuery(debouncedQuery), [debouncedQuery]);

  const {
    searchResults,
    isSearching,
    searchKeywords,
    resetSearch,
  } = useKeywordSearchStore();

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("recentSearches");
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved).slice(0, 5));
      } catch {
        // ignore
      }
    }
  }, []);

  // Save search to recent
  const saveToRecent = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;
    const updated = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("recentSearches", JSON.stringify(updated));
  }, [recentSearches]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Perform search when query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      resetSearch();
      return;
    }

    const keywords = parsedQuery.keywords.join(" ");
    if (!keywords) {
      resetSearch();
      return;
    }

    searchKeywords(keywords, {
      limit: 20,
      start_time: parsedQuery.timeRange?.start,
      end_time: parsedQuery.timeRange?.end,
      app_names: parsedQuery.app ? [parsedQuery.app] : undefined,
    });
  }, [debouncedQuery, parsedQuery, searchKeywords, resetSearch]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, searchResults.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (e.metaKey || e.ctrlKey) {
            // Send to AI chat
            handleSendToAI();
          } else if (searchResults[selectedIndex]) {
            // Navigate to timestamp
            handleSelectResult(searchResults[selectedIndex]);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, searchResults, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && searchResults.length > 0) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, searchResults.length]);

  const handleSelectResult = useCallback((result: SearchMatch) => {
    saveToRecent(query);
    onNavigateToTimestamp(result.timestamp);
    onClose();
  }, [query, saveToRecent, onNavigateToTimestamp, onClose]);

  const handleSendToAI = useCallback(async () => {
    const result = searchResults[selectedIndex];
    if (!result) return;

    saveToRecent(query);

    // Build context for AI chat
    const context = `Context from search result:\n${result.app_name} - ${result.window_name}\nTime: ${format(new Date(result.timestamp), "PPpp")}\n\nText:\n${result.text}`;

    // Open AI chat window with context
    await commands.showWindow("Chat");
    // Emit event to pre-fill the chat with context
    await emit("chat-prefill", {
      context,
      prompt: `What would you like to know about this?`,
    });

    onClose();
  }, [searchResults, selectedIndex, query, saveToRecent, onClose]);

  const handleRecentClick = useCallback((recent: string) => {
    setQuery(recent);
    inputRef.current?.focus();
  }, []);

  if (!isOpen) return null;

  const groupedResults = groupResultsByDate(searchResults);
  const hasResults = searchResults.length > 0;
  const showEmpty = !isSearching && debouncedQuery && !hasResults;
  const showRecent = !debouncedQuery && recentSearches.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-xl mx-4 bg-card border border-border shadow-2xl overflow-hidden">
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

        {/* Parsed query indicator */}
        {debouncedQuery && (parsedQuery.app || parsedQuery.timeLabel) && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border bg-muted/30">
            → {parsedQuery.keywords.length > 0 && `"${parsedQuery.keywords.join(" ")}"`}
            {parsedQuery.app && <span className="ml-1">in {parsedQuery.app}</span>}
            {parsedQuery.timeLabel && <span className="ml-1">· {parsedQuery.timeLabel}</span>}
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {/* Recent searches */}
          {showRecent && (
            <div className="p-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">recent</div>
              <div className="space-y-1">
                {recentSearches.map((recent, i) => (
                  <button
                    key={i}
                    onClick={() => handleRecentClick(recent)}
                    className="w-full text-left px-2 py-1.5 text-sm text-foreground hover:bg-muted rounded transition-colors"
                  >
                    {recent}
                  </button>
                ))}
              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                <span className="opacity-60">tips:</span> "slack yesterday" · "@zoom meeting" · "budget today"
              </div>
            </div>
          )}

          {/* Empty state */}
          {showEmpty && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              no results for "{debouncedQuery}"
            </div>
          )}

          {/* Results count */}
          {hasResults && (
            <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
            </div>
          )}

          {/* Grouped results */}
          {groupedResults.map((group) => (
            <div key={group.label}>
              <div className="px-4 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/30">
                {group.label}
              </div>
              {group.results.map((result) => {
                const globalIndex = searchResults.indexOf(result);
                const isSelected = globalIndex === selectedIndex;
                const isAudio = result.text?.includes("[audio]") || result.window_name?.toLowerCase().includes("zoom") || result.window_name?.toLowerCase().includes("meet");

                return (
                  <div
                    key={result.frame_id}
                    data-index={globalIndex}
                    onClick={() => handleSelectResult(result)}
                    className={`
                      px-4 py-2.5 cursor-pointer transition-colors border-b border-border/50
                      ${isSelected ? "bg-foreground/10" : "hover:bg-muted/50"}
                    `}
                  >
                    <div className="flex items-start gap-3">
                      {/* Time + App */}
                      <div className="flex-shrink-0 w-16 text-xs font-mono text-muted-foreground">
                        {format(new Date(result.timestamp), "h:mm a")}
                      </div>

                      {/* App name with icon */}
                      <div className="flex-shrink-0 w-20 flex items-center gap-1.5">
                        {isAudio && <Mic className="w-3 h-3 text-muted-foreground" />}
                        <span className="text-xs font-medium text-foreground truncate">
                          {result.app_name}
                        </span>
                      </div>

                      {/* Matched text */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-muted-foreground truncate">
                          {highlightMatch(
                            result.text?.slice(0, 100) || result.window_name || "",
                            parsedQuery.keywords
                          )}
                        </p>
                      </div>

                      {/* Arrow indicator for selected */}
                      {isSelected && (
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer with keyboard hints */}
        <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
          <div className="flex items-center gap-4">
            <span>↑↓ navigate</span>
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
