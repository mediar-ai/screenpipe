import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
import { listHistory, HistoryItem } from "@/hooks/actions/history";

export function HistorySidebar() {
    const [todayItems, setTodayItems] = useState<HistoryItem[]>([]);
    const [yesterdayItems, setYesterdayItems] = useState<HistoryItem[]>([]);
    const [previous7DaysItems, setPrevious7DaysItems] = useState<HistoryItem[]>([]);

    useEffect(() => {
        const fetchHistory = async () => {
            const history = await listHistory();
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

    const renderHistoryItems = (items: HistoryItem[]) => (
        items.map(item => (
            <SidebarMenuItem key={item.id}>
                <SidebarMenuButton asChild>
                    <a href="#" onClick={() => handleHistoryClick(item.id)}>
                        <span>{item.title}</span>
                    </a>
                </SidebarMenuButton>
            </SidebarMenuItem>
        ))
    );

    return (
        <Sidebar>
            <SidebarHeader>
                <SearchForm />
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Today</SidebarGroupLabel>
                    <SidebarGroupAction title="Add Project">
                        <Plus /> <span className="sr-only">Add Project</span>
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
