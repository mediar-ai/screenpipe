"use client";

import { useEffect, useState } from 'react';
import localforage from 'localforage';

export interface SearchHistory {
    id: string;
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
      type: 'search' | 'ai';
      content: string;
      timestamp: string;
    }[];
  } 

const HISTORY_KEY = 'screenpipe-search-history';

export function useSearchHistory() {
  const [searches, setSearches] = useState<SearchHistory[]>([]);
  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    loadSearches();
  }, []);

  const loadSearches = async () => {
    try {
      const stored = await localforage.getItem<SearchHistory[]>(HISTORY_KEY);
      setSearches(stored || []);
    } catch (error) {
      console.error('failed to load search history:', error);
    }
    setIsLoading(false);
  };

  const saveSearches = async (updated: SearchHistory[]) => {
    try {
      await localforage.setItem(HISTORY_KEY, updated);
      setSearches(updated);
    } catch (error) {
      console.error('failed to save search history:', error);
    }
  };

  const addSearch = async (searchParams: any, results: any[]) => {
    const timestamp = new Date().toISOString();
    const newSearch: SearchHistory = {
      id: crypto.randomUUID(),
      query: searchParams.q || '',
      timestamp,
      searchParams,
      results,
      messages: [{
        id: crypto.randomUUID(),
        type: 'search' as const,
        content: searchParams.q || '',
        timestamp
      }]
    };
    
    const updated = [newSearch, ...searches];
    await saveSearches(updated);
    setCurrentSearchId(newSearch.id);
    return newSearch.id;
  };

  const addAIResponse = async (searchId: string, response: string) => {
    const timestamp = new Date().toISOString();
    const updated = searches.map(search => {
      if (search.id === searchId) {
        return {
          ...search,
          messages: [...search.messages, {
            id: crypto.randomUUID(),
            type: 'ai' as const,
            content: response,
            timestamp
          }]
        };
      }
      return search;
    });
    await saveSearches(updated);
  };

  const deleteSearch = async (id: string) => {
    const updated = searches.filter(s => s.id !== id);
    await saveSearches(updated);
    if (currentSearchId === id) {
      setCurrentSearchId(null);
    }
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return {
    searches,
    currentSearchId,
    setCurrentSearchId,
    addSearch,
    addAIResponse,
    deleteSearch,
    isLoading,
    isCollapsed,
    toggleCollapse
  };
} 
