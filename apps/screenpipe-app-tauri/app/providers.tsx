// app/providers.tsx
"use client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { ChangelogDialogProvider } from "@/lib/hooks/use-changelog-dialog";
import { SettingsProvider } from "@/lib/hooks/use-settings";
import { ThemeProvider } from "@/components/theme-provider";
import { PermissionMonitorProvider } from "@/lib/hooks/use-permission-monitor";
import { forwardRef } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { invoke } from "@tauri-apps/api/core";

export const Providers = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode }
>(({ children }, ref) => {
  // Hook console to write to disk
  useEffect(() => {
    const origLog = console.log;
    const origError = console.error;
    const origWarn = console.warn;
    const origDebug = console.debug;

    console.log = (...args) => {
      origLog(...args);
      invoke("write_browser_log", { level: "info", message: args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") }).catch(() => {});
    };
    console.error = (...args) => {
      origError(...args);
      invoke("write_browser_log", { level: "error", message: args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") }).catch(() => {});
    };
    console.warn = (...args) => {
      origWarn(...args);
      invoke("write_browser_log", { level: "warn", message: args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") }).catch(() => {});
    };
    console.debug = (...args) => {
      origDebug(...args);
      invoke("write_browser_log", { level: "debug", message: args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") }).catch(() => {});
    };

    return () => {
      console.log = origLog;
      console.error = origError;
      console.warn = origWarn;
      console.debug = origDebug;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isDebug = process.env.TAURI_ENV_DEBUG === "true";
      if (isDebug) return;
      posthog.init("phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce", {
        api_host: "https://eu.i.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: false,
      });
    }
  }, []);

  return (
    <NuqsAdapter>
      <ThemeProvider defaultTheme="light" storageKey="screenpipe-ui-theme">
        <SettingsProvider>
          <ChangelogDialogProvider>
            <PermissionMonitorProvider>
              <PostHogProvider client={posthog}>{children}</PostHogProvider>
            </PermissionMonitorProvider>
          </ChangelogDialogProvider>
        </SettingsProvider>
      </ThemeProvider>
    </NuqsAdapter>
  );
});

Providers.displayName = "Providers";
