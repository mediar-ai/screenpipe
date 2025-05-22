// app/providers.tsx
"use client";

import { ThemeProvider } from "next-themes";
import { store as SettingsStore } from "@/lib/hooks/use-settings";
import { ChangelogDialogProvider } from "@/lib/hooks/use-changelog-dialog";
import { profilesStore as ProfilesStore } from "@/lib/hooks/use-profiles";
import { TabsProvider } from "@/lib/hooks/use-tabs";
import React from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
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
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SettingsStore.Provider>
        <ProfilesStore.Provider>
          <ChangelogDialogProvider>
            <TabsProvider>
              <PostHogProvider client={posthog}>
                {children}
              </PostHogProvider>
            </TabsProvider>
          </ChangelogDialogProvider>
        </ProfilesStore.Provider>
      </SettingsStore.Provider>
    </ThemeProvider>
  );
}
