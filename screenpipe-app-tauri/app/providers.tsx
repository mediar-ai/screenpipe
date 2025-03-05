// app/providers.tsx
"use client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { ChangelogDialogProvider } from "@/lib/hooks/use-changelog-dialog";
import { forwardRef } from "react";
import { store as SettingsStore, useSettings } from "@/lib/hooks/use-settings";
import { profilesStore as ProfilesStore } from "@/lib/hooks/use-profiles";

export const Providers = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode }
>(({ children }, ref) => {
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
    <SettingsStore.Provider>
      <ProfilesStore.Provider>
        <ChangelogDialogProvider>
          <PostHogProvider client={posthog}>{children}</PostHogProvider>
        </ChangelogDialogProvider>
      </ProfilesStore.Provider>
    </SettingsStore.Provider>
  );
});

Providers.displayName = "Providers";
