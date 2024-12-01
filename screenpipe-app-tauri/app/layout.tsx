"use client";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/toaster";
import { ClerkProvider } from "@clerk/clerk-react";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <ClerkProvider
        publishableKey="pk_test_ZGVjZW50LXRyb3V0LTEuY2xlcmsuYWNjb3VudHMuZGV2JA"
        allowedRedirectOrigins={["http://localhost:3000", "tauri://localhost"]}
      >
        <Providers>
          <body className={inter.className}>
            {children}
            <Toaster />
          </body>
        </Providers>
      </ClerkProvider>
    </html>
  );
}
