import type { Metadata } from "next";
import { Toaster } from "@/components/toaster";
import { Inter } from "next/font/google";
import "./globals.css";
import { WindowSizer } from "@/components/window-sizer";

export const metadata: Metadata = {
  title: "LinkedIn AI Assistant",
  description: "AI agent for LinkedIn",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16" },
      { url: "/icon-32.png", sizes: "32x32" },
      { url: "/icon-128.png", sizes: "128x128" }
    ]
  }
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
        <WindowSizer />
        {children}
        <Toaster />
      </body>
    </html>
  );
}