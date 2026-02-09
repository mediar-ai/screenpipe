"use client";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/toaster";
import { useEffect } from "react";
import { DeeplinkHandler } from "@/components/deeplink-handler";
import { ShortcutTracker } from "@/components/shortcut-reminder";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();
  const isOverlay = pathname === "/shortcut-reminder";

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Patch Tauri event listener race condition (APP-2/5/9/W, 69 users)
    // Tauri's unregisterListener doesn't null-check listeners[eventId]
    // causing TypeError when unlisten is called on already-removed listener
    try {
      const internals = (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__;
      if (internals?.unregisterListener) {
        const original = internals.unregisterListener;
        internals.unregisterListener = function(event: string, eventId: number) {
          try {
            return original(event, eventId);
          } catch {
            // listener already removed — race condition, ignore
          }
        };
      }
    } catch {}

    // Auto-reload on IndexedDB disconnect (APP-2E, 27 users on v2.0.379)
    // WKWebView's IndexedDB server can crash; the page becomes unusable.
    // PostHog JS SDK uses IndexedDB for session replay — this is a known WebKit bug.
    let idbReloadPending = false;
    const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason?.message || e.reason || "");
      if (msg.includes("Connection to Indexed Database server lost")) {
        // Prevent the error from reaching Sentry — we handle it via reload
        e.preventDefault();
        if (idbReloadPending) return; // debounce: only one reload
        idbReloadPending = true;
        console.warn("IndexedDB server lost — reloading page in 1s");
        // Short delay to let any in-flight operations settle
        setTimeout(() => window.location.reload(), 1000);
      }
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

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
            // localStorage can be null in Tauri WKWebView during navigation
            if (!localStorage) return;
            localStorage.setItem("console_logs", logs.join("\n"));
          } catch (e) {
            try {
              // If localStorage is full, clear half the logs
              logs.splice(0, logs.length / 2);
              if (localStorage) localStorage.setItem("console_logs", logs.join("\n"));
            } catch {
              // localStorage unavailable, skip silently
            }
          }
        });
      };
    });

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('screenpipe-ui-theme');
                  if (!theme) {
                    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  document.documentElement.classList.add(theme);
                } catch (e) {
                  document.documentElement.classList.add('light');
                }
              })();
            `,
          }}
        />
      </head>
      <Providers>
        <body className={`${inter.className} scrollbar-hide`}>
          {!isOverlay && <DeeplinkHandler />}
          {!isOverlay && <ShortcutTracker />}
          {children}
          {!isOverlay && <Toaster />}
        </body>
      </Providers>
    </html>
  );
}
