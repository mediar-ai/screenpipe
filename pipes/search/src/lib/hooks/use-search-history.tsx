"use client";

import { useEffect, useSyncExternalStore } from "react";
import localforage from "localforage";

export interface SearchHistory {
  id: string;
  title?: string;
  query: string;
  timestamp: string;
  searchParams: {
    q?: string;
    content_type: string;
    limit: number;
    offset: number;
    start_time: string;
    end_time: string;
    app_name?: string;
    window_name?: string;
    include_frames: boolean;
    min_length: number;
    max_length: number;
  };
  results: any[];
  messages: {
    id: string;
    type: "search" | "ai";
    content: string;
    timestamp: string;
  }[];
}

const STORAGE_KEY = "screenpipe-search-history";

type StoreState = {
  searches: SearchHistory[];
  currentSearchId: string | null;
  isCollapsed: boolean;
  loaded: boolean;
};

const store = {
  state: {
    searches: [] as SearchHistory[],
    currentSearchId: null as string | null,
    isCollapsed: true,
    loaded: false,
  } as StoreState,
  listeners: new Set<() => void>(),
  set(partial: Partial<StoreState>) {
    store.state = { ...store.state, ...partial };
    store.listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    store.listeners.add(listener);
    return () => store.listeners.delete(listener);
  },
  getSnapshot() {
    return store.state;
  },
};

// helper: normalize/migrate any legacy or corrupt shapes to an array
function normalizeSearches(raw: any): SearchHistory[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((s) => s && typeof s === "object");
  if (typeof raw === "object") {
    // legacy map/object-of-id -> value
    return Object.values(raw).filter(
      (s) => s && typeof s === "object"
    ) as SearchHistory[];
  }
  return [];
}

// persist helpers
async function persist() {
  try {
    await localforage.setItem(STORAGE_KEY, store.state.searches);
  } catch (e) {
    console.error("persist history failed", e);
  }
}

async function loadOnce() {
  if (store.state.loaded) return;
  try {
    const data = await localforage.getItem<any>(STORAGE_KEY);
    const normalized = normalizeSearches(data);
    store.set({ searches: normalized, loaded: true });
  } catch (e) {
    console.error("load history failed", e);
    store.set({ loaded: true, searches: [] });
  }
}

export function useSearchHistory() {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );

  useEffect(() => {
    loadOnce();
  }, []);

  const safeSearches = Array.isArray(snapshot.searches)
    ? snapshot.searches
    : normalizeSearches(snapshot.searches);

  const setCurrentSearchId = (id: string | null) => {
    store.set({ currentSearchId: id });
  };

  const addSearch = (searchParams: any, results: any[]) => {
    const ts = new Date().toISOString();
    const derivedTitle =
      searchParams.q ||
      searchParams.app_name ||
      searchParams.window_name ||
      "Untitled";
    const newSearch: SearchHistory = {
      id: crypto.randomUUID(),
      title: derivedTitle,
      query: searchParams.q || "",
      timestamp: ts,
      searchParams: {
        q: searchParams.q,
        content_type: searchParams.contentType,
        limit: searchParams.limit,
        offset: searchParams.offset,
        start_time: searchParams.startTime,
        end_time: searchParams.endTime,
        app_name: searchParams.appName,
        window_name: searchParams.windowName,
        include_frames: searchParams.includeFrames,
        min_length: searchParams.minLength,
        max_length: searchParams.maxLength,
      },
      results: Array.isArray(results) ? results : [],
      messages: [
        {
          id: crypto.randomUUID(),
          type: "search",
          content: searchParams.q || "",
          timestamp: ts,
        },
      ],
    };
    const current = Array.isArray(store.state.searches)
      ? store.state.searches
      : normalizeSearches(store.state.searches);
    store.set({
      searches: [newSearch, ...current],
      currentSearchId: newSearch.id,
    });
    persist();
    return newSearch.id;
  };

  const addAIResponse = (searchId: string, response: string) => {
    const ts = new Date().toISOString();
    const updated = store.state.searches.map((s) =>
      s.id === searchId
        ? {
            ...s,
            messages: [
              ...s.messages,
              {
                id: crypto.randomUUID(),
                type: "ai" as const,
                content: response,
                timestamp: ts,
              },
            ],
          }
        : s
    );
    store.set({ searches: updated });
    persist();
  };

  const addUserMessage = (searchId: string, message: string) => {
    const ts = new Date().toISOString();
    const updated = store.state.searches.map((s) =>
      s.id === searchId
        ? {
            ...s,
            messages: [
              ...s.messages,
              {
                id: crypto.randomUUID(),
                type: "search" as const,
                content: message,
                timestamp: ts,
              },
            ],
          }
        : s
    );
    store.set({ searches: updated });
    persist();
  };

  const deleteSearch = (id: string) => {
    const updated = store.state.searches.filter((s) => s.id !== id);
    store.set({
      searches: updated,
      currentSearchId:
        store.state.currentSearchId === id ? null : store.state.currentSearchId,
    });
    persist();
  };

  const clearHistory = () => {
    store.set({ searches: [], currentSearchId: null });
    persist();
  };

  const resetHistoryState = () => {
    store.set({ currentSearchId: null });
  };

  const toggleCollapse = () =>
    store.set({ isCollapsed: !store.state.isCollapsed });

  const renameSearch = (id: string, title: string) => {
    const updated = store.state.searches.map((s) =>
      s.id === id ? { ...s, title } : s
    );
    store.set({ searches: updated });
    persist();
  };

  return {
    searches: safeSearches,
    currentSearchId: snapshot.currentSearchId,
    isCollapsed: snapshot.isCollapsed,
    setCurrentSearchId,
    addSearch,
    addAIResponse,
    addUserMessage,
    deleteSearch,
    clearHistory,
    resetHistoryState,
    toggleCollapse,
    renameSearch,
    isLoading: !snapshot.loaded,
  };
}
