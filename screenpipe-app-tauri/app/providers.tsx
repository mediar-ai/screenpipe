// app/providers.tsx
"use client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { initOpenTelemetry } from "@/lib/opentelemetry";
import { OnboardingProvider } from "@/lib/hooks/use-onboarding";
import { ChangelogDialogProvider } from "@/lib/hooks/use-changelog-dialog";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isDebug = process.env.TAURI_ENV_DEBUG === "true";
      if (isDebug) return;
      posthog.init("phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce", {
        api_host: "https://eu.i.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: false, // Disable automatic pageview capture, as we capture manually
      });
      initOpenTelemetry("82688", new Date().toISOString());
    }
  }, []);

  return (
    <OnboardingProvider>
      <ChangelogDialogProvider>
        <PostHogProvider client={posthog}>{children}</PostHogProvider>
      </ChangelogDialogProvider>
    </OnboardingProvider>
  );
}
