import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAG Search - Screenpipe",
  description: "Search your screen history with AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
