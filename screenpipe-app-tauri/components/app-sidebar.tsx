import { History, Trash2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
} from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SearchHistory } from "@/lib/types/history"
import { cn } from "@/lib/utils"

interface AppSidebarProps {
  searches?: SearchHistory[]
  currentSearchId?: string | null
  onSelectSearch?: (id: string) => void
  onDeleteSearch?: (id: string) => void
}

export function AppSidebar({
  searches = [],
  currentSearchId,
  onSelectSearch,
  onDeleteSearch,
}: AppSidebarProps) {
  return (
    <Sidebar className="border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarContent className="pt-12">
        <ScrollArea className="h-[calc(100vh-4rem)]">
          <SidebarGroup>
            <SidebarGroupLabel className="px-4 py-2 text-xs font-medium text-muted-foreground/70">
              search history
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5 px-2">
                {searches.length === 0 ? (
                  <div className="px-4 py-2 text-sm text-muted-foreground">
                    no searches yet
                  </div>
                ) : (
                  searches.map((search) => (
                    <SidebarMenuItem 
                      key={search.id}
                      className={cn(
                        "group relative",
                        "after:absolute after:bottom-0 after:left-3 after:right-3 after:h-px after:bg-border",
                        "last:after:hidden" // Hide border on last item
                      )}
                    >
                      <SidebarMenuButton
                        isActive={currentSearchId === search.id}
                        onClick={() => onSelectSearch?.(search.id)}
                        tooltip={search.query || "untitled search"}
                        className={cn(
                          "relative w-full px-3 py-7 text-sm outline-none transition-colors",
                          "hover:bg-accent/40 group/button",
                          currentSearchId === search.id && "bg-accent/50"
                        )}
                      >
                        <div className="flex flex-col gap-1 min-w-0 pr-8"> {/* Added right padding for delete icon */}
                          <span className="truncate font-medium">
                            {search.query || "untitled search"}
                          </span>
                          <span className="text-[11px] text-muted-foreground/80 truncate">
                            {formatDistanceToNow(new Date(search.timestamp), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                        <SidebarMenuAction
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteSearch?.(search.id)
                          }}
                          showOnHover
                          className={cn(
                            "absolute right-3 top-1/2 -translate-y-1/2",
                            "opacity-0 transition-all duration-200",
                            "group-hover/button:opacity-100",
                            "hover:bg-background/80 hover:text-destructive",
                            "h-7 w-7 rounded-md flex items-center justify-center"
                          )}
                        >
                          <Trash2 className="h-4 w-4" />
                        </SidebarMenuAction>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>
    </Sidebar>
  )
} 