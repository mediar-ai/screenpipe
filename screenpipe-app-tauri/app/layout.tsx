"use client";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/toaster";
import { useEffect } from "react";

const inter = Inter({ subsets: ["latin"] });

// Debounced localStorage writer
const createDebouncer = (wait: number) => {
  let timeout: NodeJS.Timeout;
  return (fn: Function) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(), wait);
  };
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const logs: string[] = [];
    const MAX_LOGS = 1000;
    const originalConsole = { ...console };
    const debouncedWrite = createDebouncer(1000);

    ["log", "error", "warn", "info"].forEach((level) => {
      (console[level as keyof Console] as any) = (...args: any[]) => {
        // Call original first for performance
        (originalConsole[level as keyof Console] as Function)(...args);

        // Add to memory buffer
        logs.push(
          `[${level.toUpperCase()}] ${args
            .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : arg))
            .join(" ")}`
        );

        // Trim buffer if needed
        if (logs.length > MAX_LOGS) {
          logs.splice(0, logs.length - MAX_LOGS);
        }

        // Debounced write to localStorage
        debouncedWrite(() => {
          try {
            localStorage.setItem("console_logs", logs.join("\n"));
          } catch (e) {
            // If localStorage is full, clear half the logs
            logs.splice(0, logs.length / 2);
            localStorage.setItem("console_logs", logs.join("\n"));
          }
        });
      };
    });
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <Providers>
        <body className={inter.className}>
          {children}
          <Toaster />
        </body>
      </Providers>
    </html>
  );
}
