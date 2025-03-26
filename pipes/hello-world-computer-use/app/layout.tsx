import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SettingsProvider } from "@/lib/settings-provider";
import { AssistantProvider } from "./assistant-provider";

export const metadata: Metadata = {
  title: "Hello World Computer Use • Screenpipe",
  description: "A clean starting point for your Screenpipe pipe",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased min-h-screen bg-background"
        suppressHydrationWarning
        data-suppress-hydration-warning={true}
      >
        <SettingsProvider>
          <AssistantProvider>
            <Toaster />

            {children}
          </AssistantProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
