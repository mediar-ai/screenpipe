"use client"
import Header from "@/components/header";
import Pipe from "@/components/pipe"
import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { HistorySidebar } from "@/components/history-sidebar"

export default function Home() {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    const savedState = localStorage.getItem("sidebarOpen");
    return savedState !== null ? JSON.parse(savedState) : false;
  });

  useEffect(() => {
    localStorage.setItem("sidebarOpen", JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <main className="max-h-fit mb-[200px]">
      <Header />
      <Pipe />
      <SidebarProvider className="min-h-0" defaultOpen={isSidebarOpen}>
        <div className="absolute left-0 top-0 h-full z-[10]">
          <HistorySidebar />
        </div>
        <div className="fixed left-1 top-2 z-[20]">
          <SidebarTrigger onClick={toggleSidebar} />
        </div>
      </SidebarProvider>
    </main>
  );
}
