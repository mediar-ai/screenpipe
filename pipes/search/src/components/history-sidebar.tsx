import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { SearchForm } from "@/components/search-form";
import { listHistory, HistoryItem, deleteHistoryItem } from "@/hooks/actions/history";

// Add this function to handle delete action
const handleDeleteHistory = async (id: string) => {
    await deleteHistoryItem(id);
    window.location.reload();
};

export function HistorySidebar() {
    const [todayItems, setTodayItems] = useState<HistoryItem[]>([]);
    const [yesterdayItems, setYesterdayItems] = useState<HistoryItem[]>([]);
    const [previous7DaysItems, setPrevious7DaysItems] = useState<HistoryItem[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const fetchHistory = async () => {
            const history = await listHistory();
            history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const sevenDaysAgo = new Date(today);
            sevenDaysAgo.setDate(today.getDate() - 7);

            const todayItems: HistoryItem[] = [];
            const yesterdayItems: HistoryItem[] = [];
            const previous7DaysItems: HistoryItem[] = [];

            history.forEach(item => {
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

        fetchHistory();
    }, []);

    const handleHistoryClick = (id: string) => {
        localStorage.setItem("historyId", id);
        window.location.reload();
    };

    const handleNewChat = () => {
        localStorage.removeItem('historyId');
        location.reload();
    };
    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(event.target.value);
    };
    const filterItems = (items: HistoryItem[]) => {
        return items.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()));
    };

    const renderHistoryItems = (items: HistoryItem[]) => (
        filterItems(items).map(item => (
            <SidebarMenuItem key={item.id}>
                <SidebarMenuButton asChild>
                    <div className="p-1">
                        <a className="" href="#" onClick={() => handleHistoryClick(item.id)}>
                            <span>{item.title.substring(0, 30)}...</span>
                        </a>
                        <Trash2
                            className="absolute right-0 ml-2 cursor-pointer"
                            onClick={() => handleDeleteHistory(item.id)}
                        />
                    </div>
                </SidebarMenuButton>
            </SidebarMenuItem>
        ))
    );

    return (
        <Sidebar>
            <SidebarHeader>
                <SearchForm onChange={handleSearchChange} />
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
                    <SidebarGroupLabel>Yesterday</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {renderHistoryItems(yesterdayItems)}
                        </SidebarMenu>
                    </SidebarGroupContent>
                    <SidebarGroupLabel>Previous 7 days</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {renderHistoryItems(previous7DaysItems)}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
}
