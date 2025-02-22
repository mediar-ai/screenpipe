import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { HistorySidebar } from "@/components/history-sidebar"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  title: "Search • Screenpipe",
  description: "Search your screenpipe recordings",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased `}
      >
        <SidebarProvider defaultOpen={true}>
          <div className="flex w-full h-full">
            <div className="absolute left-0 top-0 h-full">
              <HistorySidebar />
              <div className="absolute right-[-40px] top-5 z-[1000]  ">
                <SidebarTrigger />
              </div>
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
