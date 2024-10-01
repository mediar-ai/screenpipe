// app/providers.tsx
"use client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { initOpenTelemetry } from "@/lib/opentelemetry";

if (typeof window !== "undefined") {
  posthog.init("phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce", {
    api_host: "https://eu.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false, // Disable automatic pageview capture, as we capture manually
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      initOpenTelemetry("82688", new Date().toISOString());
    }
  }, []);

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
