// app/providers.tsx
"use client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect, useState } from "react";
import "@radix-ui/themes/styles.css";
import { Theme } from "@radix-ui/themes";
import { ThemeProvider } from "next-themes";
import { initOpenTelemetry } from "@/lib/opentelemetry";
import { OnboardingProvider } from "@/lib/hooks/use-onboarding";

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

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

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <ThemeProvider attribute="class">
      <Theme>
        <OnboardingProvider>
          <PostHogProvider client={posthog}>{children}</PostHogProvider>
        </OnboardingProvider>
      </Theme>
    </ThemeProvider>
  );
}
