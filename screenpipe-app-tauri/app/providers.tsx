// app/providers.tsx
"use client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect, useState, useCallback } from "react";
import { ChangelogDialogProvider } from "@/lib/hooks/use-changelog-dialog";
import React from "react";
// Modern Zustand stores  
import { 
  useSettingsZustand, 
  awaitZustandHydration 
} from "@/lib/hooks/use-settings-zustand";
import {
  useProfilesZustand,
} from "@/lib/hooks/use-profiles-zustand";

// Separate analytics initialization to prevent unnecessary re-renders
const useAnalyticsInitialization = (analyticsEnabled: boolean) => {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isDebug = process.env.TAURI_ENV_DEBUG === "true";
    if (isDebug) return;

    // Only initialize once
    if (initialized) return;

    let cancelled = false;
    let timeoutId: NodeJS.Timeout;
    
    (async () => {
      try {
        // Add timeout to prevent infinite waiting
        const hydrationPromise = awaitZustandHydration();
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Hydration timeout')), 5000);
        });
        
        await Promise.race([hydrationPromise, timeoutPromise]);
        
        if (cancelled) return;
        
        if (analyticsEnabled) {
          posthog.init("phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce", {
            api_host: "https://eu.i.posthog.com",
            person_profiles: "identified_only",
            capture_pageview: false,
          });
        } else {
          posthog.opt_out_capturing();
        }
        setInitialized(true);
      } catch (error) {
        console.error('Failed to wait for settings hydration in analytics setup:', error);
        // Still set initialized to prevent hanging
        setInitialized(true);
      }
    })();
    
    return () => { 
      cancelled = true; 
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [analyticsEnabled, initialized]);

  // Handle analytics preference changes after initialization
  useEffect(() => {
    if (!initialized) return;
    
    if (analyticsEnabled) {
      posthog.opt_in_capturing();
    } else {
      posthog.opt_out_capturing();
    }
  }, [analyticsEnabled, initialized]);
};

// Memoized inner provider to prevent unnecessary re-renders
const ProviderInner = React.memo(({ children }: { children: React.ReactNode }) => {
  // Use Zustand with selective subscription for analytics
  const analyticsEnabled = useSettingsZustand((state) => state.settings.analyticsEnabled);
  
  // Initialize analytics with the hook
  useAnalyticsInitialization(analyticsEnabled);

  return (
    <ChangelogDialogProvider>
      <PostHogProvider client={posthog}>{children}</PostHogProvider>
    </ChangelogDialogProvider>
  );
});

ProviderInner.displayName = 'ProviderInner';

export const Providers = ({ children }: { children: React.ReactNode }) => {
  // Zustand doesn't need provider wrappers - stores are global
  return <ProviderInner>{children}</ProviderInner>;
};
