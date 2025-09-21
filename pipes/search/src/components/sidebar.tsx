"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PlusCircle,
  Trash2,
  PanelLeft,
  MessageSquare,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import { useSearchHistory } from "@/lib/hooks/use-search-history";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Search {
  id: string;
  title?: string;
  query?: string;
  timestamp: string;
  results?: any[];
  searchParams?: { app_name?: string; window_name?: string };
}

interface SearchHistoryItemProps {
  search: Search;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}

const SearchHistoryItem = ({
  search,
  isActive,
  onClick,
  onDelete,
  onRename,
}: SearchHistoryItemProps) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = React.useState(false);
  const [tempTitle, setTempTitle] = React.useState("");

  const getDisplayText = () =>
    search.title ||
    search.query ||
    search.searchParams?.app_name ||
    search.searchParams?.window_name ||
    "Untitled";

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempTitle(getDisplayText());
    setIsRenameDialogOpen(true);
    setIsMenuOpen(false);
  };

  const handleRenameSubmit = () => {
    const val = tempTitle.trim() || "Untitled";
    onRename(val);
    setIsRenameDialogOpen(false);
    setTempTitle("");
  };

  return (
    <>
      <div
        className={cn(
          "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm leading-5 cursor-pointer transition-colors duration-200 ease-in-out border border-transparent",
          isActive && !isRenameDialogOpen
            ? "bg-white border-gray-200 text-gray-900 shadow-sm"
            : "bg-transparent text-gray-700 hover:bg-[#ECECF1]"
        )}
        onClick={() => {
          if (!isRenameDialogOpen) onClick();
        }}
      >
        <MessageSquare className="h-4 w-4 flex-shrink-0 text-gray-500" />
        <div className="flex-1 overflow-hidden">
          <div className="truncate">{getDisplayText()}</div>
        </div>

        <div
          className={cn(
            "flex items-center gap-1 transition-opacity duration-200",
            isActive || isMenuOpen
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          )}
        >
          <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-40 bg-white border border-gray-200 shadow-md"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem
                onClick={handleRenameClick}
                className="flex items-center gap-2 focus:bg-gray-100 focus:text-gray-900"
              >
                <Pencil className="h-4 w-4" /> rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="flex items-center gap-2 text-red-600 focus:text-red-700 focus:bg-red-50"
              >
                <Trash2 className="h-4 w-4" /> delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>rename search</DialogTitle>
            <DialogDescription>
              give this search a new name to help you find it later
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              placeholder="Enter conversation name..."
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setIsRenameDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit} disabled={!tempTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const {
    searches,
    currentSearchId,
    setCurrentSearchId,
    deleteSearch,
    clearHistory,
    isCollapsed,
    toggleCollapse,
    renameSearch,
  } = useSearchHistory();

  const list = Array.isArray(searches) ? searches : [];

  const handleNewSearch = React.useCallback(() => {
    setCurrentSearchId(null);
  }, [setCurrentSearchId]);

  const handleSearchSelect = React.useCallback(
    (searchId: string) => setCurrentSearchId(searchId),
    [setCurrentSearchId]
  );

  const handleRename = React.useCallback(
    (id: string, newTitle: string) => renameSearch(id, newTitle),
    [renameSearch]
  );

  const SidebarContent = () => (
    <div
      className={cn(
        "flex flex-col h-full bg-[#F7F7F8] text-gray-900 border-r border-gray-200",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNewSearch}
          className="h-8 px-3 gap-2 bg-white hover:bg-gray-100 text-gray-800 border border-gray-200 shadow-sm"
        >
          <PlusCircle className="h-4 w-4" /> new search
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapse}
          className="h-8 w-8 text-gray-600 hover:text-gray-900 hover:bg-gray-200"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Search History */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full px-3">
          <div className="space-y-1 pb-4">
            {list.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-gray-500 space-y-2">
                <MessageSquare className="h-10 w-10 text-gray-400" />
                <div className="font-medium text-gray-700">no searches yet</div>
                <div className="text-gray-500">
                  your search history will appear here
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewSearch}
                  className="mt-2"
                >
                  start a new search
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {list.map((search) => (
                  <SearchHistoryItem
                    key={search.id}
                    search={search}
                    isActive={currentSearchId === search.id}
                    onClick={() => handleSearchSelect(search.id)}
                    onDelete={() => deleteSearch(search.id)}
                    onRename={(title) => handleRename(search.id, title)}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Footer */}
      {searches.length > 0 && (
        <div className="border-t border-gray-200 p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 h-9"
            onClick={clearHistory}
          >
            <Trash2 className="h-4 w-4" /> clear history
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Button
        aria-pressed={isCollapsed}
        variant="ghost"
        size="icon"
        onClick={toggleCollapse}
        className={cn(
          "fixed top-4 left-4 z-50 h-8 w-8 bg-white border border-gray-200 shadow-sm hidden md:flex text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all duration-300",
          isCollapsed
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        title={isCollapsed ? "Open sidebar" : "Collapse sidebar"}
      >
        <PanelLeft
          className={cn(
            "h-4 w-4 transition-transform",
            isCollapsed ? "" : "rotate-180"
          )}
        />
      </Button>

      <div
        className={cn(
          "fixed top-0 left-0 h-full transition-all duration-300 ease-in-out hidden md:block z-40",
          isCollapsed
            ? "-ml-80 opacity-0 pointer-events-none"
            : "ml-0 opacity-100",
          "w-80"
        )}
      >
        <SidebarContent />
      </div>
    </>
  );
}
