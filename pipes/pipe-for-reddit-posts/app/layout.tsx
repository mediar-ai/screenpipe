import type { Metadata } from "next";
import { Toaster } from "@/components/toaster";
import { Inter } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reddit post pipe • Screenpipe",
  description: "Make reddit post using your Screenpipe data",
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
        {children}

        <Toaster />
      </body>
    </html>
  );
}
