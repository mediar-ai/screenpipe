"use client";

import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { commands } from "@/lib/utils/tauri";
import posthog from "posthog-js";

interface PermissionLostPayload {
  screen_recording: boolean;
  microphone: boolean;
  accessibility: boolean;
}

/**
 * Hook that listens for permission-lost events from the Rust backend
 * and automatically shows the permission recovery window
 */
export function usePermissionMonitor() {
  const hasShownRef = useRef(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") return;

    const unlisten = listen<PermissionLostPayload>("permission-lost", async (event) => {
      const { screen_recording, microphone, accessibility } = event.payload;

      // Don't show multiple times in quick succession
      if (hasShownRef.current) return;

      console.log("Permission lost event received:", { screen_recording, microphone, accessibility });

      // Double-check permissions before showing modal to avoid false positives
      // The backend already requires 3 consecutive failures, but let's verify once more
      try {
        const currentPerms = await commands.doPermissionsCheck(false);
        const screenOk = currentPerms.screenRecording === "granted" || currentPerms.screenRecording === "notNeeded";
        const micOk = currentPerms.microphone === "granted" || currentPerms.microphone === "notNeeded";
        const accessibilityOk = currentPerms.accessibility === "granted" || currentPerms.accessibility === "notNeeded";

        // Show modal if ANY permission is lost (screen, mic, OR accessibility)
        if (screenOk && micOk && accessibilityOk) {
          console.log("Permission check passed on frontend verification, skipping modal");
          return;
        }

        console.log("Permission loss confirmed:", { screenOk, micOk, accessibilityOk });
      } catch (error) {
        console.error("Failed to verify permissions:", error);
        // Continue to show modal if we can't verify
      }

      hasShownRef.current = true;

      // Track the event
      posthog.capture("permission_lost", {
        screen_recording_lost: screen_recording,
        microphone_lost: microphone,
        accessibility_lost: accessibility,
      });

      // Show the permission recovery window
      try {
        await commands.showPermissionRecoveryWindow();
      } catch (error) {
        console.error("Failed to show permission recovery window:", error);
      }

      // Reset after a delay to allow showing again later
      setTimeout(() => {
        hasShownRef.current = false;
      }, 60000); // 1 minute cooldown
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}

/**
 * Provider component that sets up the permission monitor
 */
export function PermissionMonitorProvider({ children }: { children: React.ReactNode }) {
  usePermissionMonitor();
  return <>{children}</>;
}
