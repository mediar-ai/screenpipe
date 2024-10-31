import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Plus, Trash2, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { SearchHistory } from "@/lib/types/history";


interface SearchHistorySidebarProps {
  searches: SearchHistory[];
  currentSearchId: string | null;
  onSelectSearch: (id: string) => void;
  onDeleteSearch: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onNewSearch?: () => void;
}

export default function SearchHistorySidebar({
  searches,
  currentSearchId,
  onSelectSearch,
  onDeleteSearch,
  isCollapsed,
  onToggleCollapse,
  onNewSearch,
}: SearchHistorySidebarProps) {
  return (
    <>
      {/* Top left icons */}
      <div className="fixed top-4 left-4 z-50 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8"
        >
          <History className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNewSearch}
          className="h-8 w-8"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Sidebar */}
      <div 
        className={cn(
          "fixed left-0 top-0 h-screen transition-all duration-300 bg-background border-r z-40",
          isCollapsed ? "-translate-x-full md:translate-x-0 md:w-[50px]" : "translate-x-0 w-[300px]",
          "pt-16" // Add padding top to account for the icons
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          {!isCollapsed && (
            <div className="px-4 py-2 border-b">
              <h2 className="text-sm font-medium">search history</h2>
            </div>
          )}

          {/* Search history list */}
          {!isCollapsed && (
            <ScrollArea className="flex-1">
              <div className="space-y-2 p-2">
                {searches.map((search) => (
                  <div
                    key={search.id}
                    className={cn(
                      "group flex items-center justify-between rounded-lg px-2 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer",
                      currentSearchId === search.id && "bg-accent"
                    )}
                    onClick={() => onSelectSearch(search.id)}
                  >
                    <div className="flex-1 truncate">
                      <p className="text-sm font-medium truncate">
                        {search.query || "untitled search"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(search.timestamp), {
                          addSuffix: true,
                        })}
                      </p>
                      {search.messages.length > 1 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {search.messages.length} messages
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSearch(search.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Backdrop for mobile */}
      {!isCollapsed && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 md:hidden"
          onClick={onToggleCollapse}
        />
      )}
    </>
  );
} 