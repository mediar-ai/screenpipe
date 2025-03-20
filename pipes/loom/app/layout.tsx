import type { Metadata } from "next";
import { Toaster } from "@/components/toaster";
import { Inter } from "next/font/google";
import "./globals.css";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { HistorySidebar } from "@/components/history-sidebar"

export const metadata: Metadata = {
  title: "Loom • Screenpipe",
  description: "get loom of your spent time",
};

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SidebarProvider defaultOpen={true}>
          <div className="flex w-full h-full">
            <div className="absolute left-0 top-0 h-full z-[10]">
              <HistorySidebar />
            </div>
            <div className="fixed left-1 top-2 z-[20]">
              <SidebarTrigger />
            </div>
            <div className="flex-1 overflow-auto">
              {children}
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </body>
    </html>
  );
}
