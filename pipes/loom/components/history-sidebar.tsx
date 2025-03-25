"use client";
import React, { useEffect, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { SidebarSearch } from "@/components/histort-sidebar-search";
import { listHistory, HistoryItem, deleteHistoryItem } from "@/lib/actions/history";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function HistorySidebar() {
  const [todayItems, setTodayItems] = useState<HistoryItem[]>([]);
  const [yesterdayItems, setYesterdayItems] = useState<HistoryItem[]>([]);
  const [previous7DaysItems, setPrevious7DaysItems] = useState<HistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchHistory = async () => {
    const history: HistoryItem[] = await listHistory();
    history.sort((a: HistoryItem, b: HistoryItem) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const todayItems: HistoryItem[] = [];
    const yesterdayItems: HistoryItem[] = [];
    const previous7DaysItems: HistoryItem[] = [];

    history.forEach((item: HistoryItem) => {
      const itemDate = new Date(item.timestamp);
      if (itemDate.toDateString() === today.toDateString()) {
        todayItems.push(item);
      } else if (itemDate.toDateString() === yesterday.toDateString()) {
        yesterdayItems.push(item);
      } else if (itemDate >= sevenDaysAgo && itemDate < today) {
        previous7DaysItems.push(item);
      }
    });

    setTodayItems(todayItems);
    setYesterdayItems(yesterdayItems);
    setPrevious7DaysItems(previous7DaysItems);
  };

  const handleDeleteHistory = async (id: string) => {
    setIsDeleting(true);
    await deleteHistoryItem(id);
    fetchHistory();
    setIsDeleting(true);
  };

  const handleHistoryClick = (id: string) => {
    localStorage.setItem("historyId", id);
    window.dispatchEvent(new Event("historyUpdated"));
  };

  const handleNewChat = () => {
    localStorage.removeItem('historyId');
    location.reload();
  };

  const handleSearchChange = (event: React.FormEvent<HTMLFormElement>) => {
    const target = event.target as HTMLInputElement;
    setSearchQuery(target.value);
  };

  useEffect(() => {
    const handleHistoryUpdate = () => {
      fetchHistory();
    };
    window.addEventListener("historyCreated", handleHistoryUpdate);
    return () => {
      window.removeEventListener("historyCreated", handleHistoryUpdate);
    };
  }, []);

  useEffect(() => {
    fetchHistory();
  }, []);

  const filterItems = (items: HistoryItem[]) => {
    return items.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  const renderHistoryItems = (items: HistoryItem[]) => (
    filterItems(items).map(item => (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton asChild>
          <div className="p-1 cursor-pointer" onClick={() => handleHistoryClick(item.id)}>
            <a className="" href="#">
              {item.title.substring(0, 28)}....
            </a>
            <Trash2
              className="absolute right-0 ml-2 cursor-pointer bg-muted z-20"
              onClick={() => setConfirmOpen(true)}
            />
            <Dialog open={confirmOpen} onOpenChange={isDeleting ? () => {} : setConfirmOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>confirm deletion of loom</DialogTitle>
                  <DialogDescription>
                    are you sure you want this loom? <br/> this loom media will delete from your storage as well
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-4">
                  <Button 
                    onClick={() => setConfirmOpen(false)} 
                    disabled={isDeleting}
                    variant={"outline"}
                  >
                    cancel
                  </Button>
                  <Button 
                    onClick={() => handleDeleteHistory(item.id)} 
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        deleting...
                      </>
                    ) : (
                        "confirm"
                      )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ))
  );

  return (
    <Sidebar >
      <SidebarHeader>
        <div className="pl-4">
          <SidebarSearch onChange={handleSearchChange} />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Today</SidebarGroupLabel>
          <SidebarGroupAction title="New Chat" onClick={handleNewChat} >
            <Plus /> <span className="sr-only">New Chat</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderHistoryItems(todayItems)}
            </SidebarMenu>
          </SidebarGroupContent>
          {yesterdayItems.length > 0 && (
            <>
              <SidebarGroupLabel>Yesterday</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {renderHistoryItems(yesterdayItems)}
                </SidebarMenu>
              </SidebarGroupContent>
            </>
          )}
          {previous7DaysItems.length > 0 && (
            <>
              <SidebarGroupLabel > Previous 7 days</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {renderHistoryItems(previous7DaysItems)}
                </SidebarMenu>
              </SidebarGroupContent>
            </>
          )}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar >
  );
}

