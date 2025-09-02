"use client";

import React from "react";
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";
import { Clock, Trash2, Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { SearchHistory } from "@/lib/hooks/use-search-history";

interface SearchHistorySidebarProps {
  searches: SearchHistory[];
  currentSearchId: string | null;
  onSelectSearch: (search: SearchHistory) => void;
  onDeleteSearch: (id: string) => void;
  isLoading: boolean;
}

// Group searches by time periods
function groupSearchesByTime(searches: SearchHistory[]) {
  const groups: Record<string, SearchHistory[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    older: [],
  };

  searches.forEach((search) => {
    const date = new Date(search.timestamp);
    
    if (isToday(date)) {
      groups.today.push(search);
    } else if (isYesterday(date)) {
      groups.yesterday.push(search);
    } else if (isThisWeek(date)) {
      groups.thisWeek.push(search);
    } else if (isThisMonth(date)) {
      groups.thisMonth.push(search);
    } else {
      groups.older.push(search);
    }
  });

  return groups;
}

// Format search query for display
function formatSearchQuery(query: string, maxLength: number = 30): string {
  if (!query) return "Empty search";
  if (query.length <= maxLength) return query;
  return query.substring(0, maxLength) + "...";
}

// Get relative time display
function getRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 1) return "Just now";
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  return format(date, "MMM d");
}

interface SearchItemProps {
  search: SearchHistory;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function SearchItem({ search, isActive, onSelect, onDelete }: SearchItemProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "group relative flex items-center gap-2 rounded-md p-2 text-sm cursor-pointer transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
    >
      <Search className="h-4 w-4 shrink-0 text-sidebar-foreground/60" />
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">
          {formatSearchQuery(search.query)}
        </div>
        <div className="text-xs text-sidebar-foreground/60">
          {getRelativeTime(search.timestamp)}
        </div>
      </div>
      
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute right-2"
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface SearchGroupProps {
  title: string;
  searches: SearchHistory[];
  currentSearchId: string | null;
  onSelectSearch: (search: SearchHistory) => void;
  onDeleteSearch: (id: string) => void;
}

function SearchGroup({ 
  title, 
  searches, 
  currentSearchId, 
  onSelectSearch, 
  onDeleteSearch 
}: SearchGroupProps) {
  if (searches.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-xs font-semibold text-sidebar-foreground/70">
        {title}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="space-y-1">
          <AnimatePresence>
            {searches.map((search) => (
              <SearchItem
                key={search.id}
                search={search}
                isActive={search.id === currentSearchId}
                onSelect={() => onSelectSearch(search)}
                onDelete={() => onDeleteSearch(search.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function SearchHistorySidebar({
  searches,
  currentSearchId,
  onSelectSearch,
  onDeleteSearch,
  isLoading,
}: SearchHistorySidebarProps) {
  const { setOpenMobile } = useSidebar();
  const groupedSearches = groupSearchesByTime(searches);

  const handleSelectSearch = (search: SearchHistory) => {
    onSelectSearch(search);
    // Close mobile sidebar when search is selected
    setOpenMobile(false);
  };

  return (
    <Sidebar side="left" variant="sidebar" collapsible="offcanvas" className="border-r">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="font-semibold">Search History</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-sidebar-accent/20 rounded animate-pulse" />
              ))}
            </div>
          ) : searches.length === 0 ? (
            <div className="p-4 text-center text-sidebar-foreground/60">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No search history yet</p>
              <p className="text-xs mt-1">Your searches will appear here</p>
            </div>
          ) : (
            <div className="p-2 space-y-4">
              <SearchGroup
                title="Today"
                searches={groupedSearches.today}
                currentSearchId={currentSearchId}
                onSelectSearch={handleSelectSearch}
                onDeleteSearch={onDeleteSearch}
              />
              
              <SearchGroup
                title="Yesterday"
                searches={groupedSearches.yesterday}
                currentSearchId={currentSearchId}
                onSelectSearch={handleSelectSearch}
                onDeleteSearch={onDeleteSearch}
              />
              
              <SearchGroup
                title="This Week"
                searches={groupedSearches.thisWeek}
                currentSearchId={currentSearchId}
                onSelectSearch={handleSelectSearch}
                onDeleteSearch={onDeleteSearch}
              />
              
              <SearchGroup
                title="This Month"
                searches={groupedSearches.thisMonth}
                currentSearchId={currentSearchId}
                onSelectSearch={handleSelectSearch}
                onDeleteSearch={onDeleteSearch}
              />
              
              <SearchGroup
                title="Older"
                searches={groupedSearches.older}
                currentSearchId={currentSearchId}
                onSelectSearch={handleSelectSearch}
                onDeleteSearch={onDeleteSearch}
              />
            </div>
          )}
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="text-xs text-sidebar-foreground/60 text-center">
          {searches.length} search{searches.length !== 1 ? 'es' : ''} saved
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
