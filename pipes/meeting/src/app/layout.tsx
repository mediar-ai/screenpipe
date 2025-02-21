import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { Analytics } from "@vercel/analytics/react"
import { ChatButton } from "@/components/chat-button"
import { RootProvider } from "@/components/providers/root-provider"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Meeting • Screenpipe",
  description: "The AI notepad for people in back-to-back meetings"
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body 
        suppressHydrationWarning={true}
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen`}
      >
        <RootProvider>
          <main className="h-full p-4 overflow-hidden">
            {children}
          </main>
          <Toaster />
          <ChatButton />
          {/* Comment this out temporarily for testing */}
          {/* <Analytics mode={process.env.NODE_ENV === "development" ? "development" : "production"} /> */}
        </RootProvider>
      </body>
    </html>
  )
}
