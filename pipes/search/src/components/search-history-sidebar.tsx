"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchHistory } from "@/lib/hooks/use-search-history";
import { formatDistanceToNow } from "date-fns";
import { History, Plus, Trash2, MessageSquare, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchHistorySidebarProps {
  searches: SearchHistory[];
  currentSearchId: string | null;
  onSearchSelect: (search: SearchHistory) => void;
  onSearchDelete: (id: string) => void;
  onNewSearch: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function SearchHistorySidebar({
  searches,
  currentSearchId,
  onSearchSelect,
  onSearchDelete,
  onNewSearch,
  isOpen,
  onToggle,
}: SearchHistorySidebarProps) {
  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        className="fixed left-4 top-4 z-50"
      >
        <History className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="fixed left-0 top-0 h-full w-80 bg-background border-r z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold flex items-center gap-2">
          <History className="h-4 w-4" />
          search history
        </h2>
        <Button variant="ghost" size="sm" onClick={onToggle}>
          ×
        </Button>
      </div>

      {/* New Search Button */}
      <div className="p-4 border-b">
        <Button onClick={onNewSearch} className="w-full justify-start">
          <Plus className="h-4 w-4 mr-2" />
          new search
        </Button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {searches.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">no search history yet</p>
          </div>
        ) : (
          searches.map((search) => (
            <Card
              key={search.id}
              className={cn(
                "p-3 cursor-pointer hover:bg-accent transition-colors",
                search.id === currentSearchId && "bg-accent"
              )}
              onClick={() => onSearchSelect(search)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {search.messages.some((m) => m.type === "ai") ? (
                      <MessageSquare className="h-3 w-3" />
                    ) : (
                      <Search className="h-3 w-3" />
                    )}
                    <span className="text-sm font-medium truncate">
                      {search.query || "untitled search"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(search.timestamp), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 p-1 h-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSearchDelete(search.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
