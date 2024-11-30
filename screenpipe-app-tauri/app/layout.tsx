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
      <ClerkProvider publishableKey="pk_live_Y2xlcmsuc2NyZWVucGkucGUk">
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
