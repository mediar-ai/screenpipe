import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LiveTranscription } from "@/components/live-transcription";
import { MeetingHistory } from "@/components/meeting-history";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meeting • Screenpipe",
  description: "The AI notepad for people in back-to-back meetings",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <main className="container mx-auto p-4">
          <Tabs defaultValue="live" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="live">live transcription</TabsTrigger>
              <TabsTrigger value="history">meeting history</TabsTrigger>
            </TabsList>
            <TabsContent value="live" className="mt-4">
              <LiveTranscription />
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              <MeetingHistory />
            </TabsContent>
          </Tabs>
        </main>
        <Toaster />
      </body>
    </html>
  );
}
