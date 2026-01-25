// app/providers.tsx
"use client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { ChangelogDialogProvider } from "@/lib/hooks/use-changelog-dialog";
import { SettingsProvider } from "@/lib/hooks/use-settings";
import { ThemeProvider } from "@/components/theme-provider";
import { forwardRef } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { attachConsole } from "@tauri-apps/plugin-log";

export const Providers = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode }
>(({ children }, ref) => {
  // Attach browser console to Tauri log plugin (writes to file)
  useEffect(() => {
    let detach: (() => void) | undefined;
    attachConsole().then((fn) => {
      detach = fn;
    }).catch((err) => {
      console.error("Failed to attach console to log plugin:", err);
    });
    return () => {
      detach?.();
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
            <PostHogProvider client={posthog}>{children}</PostHogProvider>
          </ChangelogDialogProvider>
        </SettingsProvider>
      </ThemeProvider>
    </NuqsAdapter>
  );
});

Providers.displayName = "Providers";
