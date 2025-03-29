"use client"
import Header from "@/components/header";
import Pipe from "@/components/pipe"
import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { HistorySidebar } from "@/components/history-sidebar"
import localforage from "localforage";

export default function Home() {

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const fetchSidebarState = async () => {
      const savedState = await localforage.getItem("sidebarOpen");
      if (savedState !== undefined) {
        setIsSidebarOpen(JSON.parse(savedState as string));
      } else {
        setIsSidebarOpen(false);
      }
    };

    fetchSidebarState();
  }, []);

  useEffect(() => {
    if (isSidebarOpen !== undefined) {
      localforage.setItem("sidebarOpen", JSON.stringify(isSidebarOpen));
    }
  }, [isSidebarOpen]);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  if (isSidebarOpen === undefined) {
    return undefined;
  }

  console.log("SIDEBAR", isSidebarOpen)

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
