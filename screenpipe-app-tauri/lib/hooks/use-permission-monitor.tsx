"use client";

import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { commands } from "@/lib/utils/tauri";
import posthog from "posthog-js";

interface PermissionLostPayload {
  screen_recording: boolean;
  microphone: boolean;
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
      const { screen_recording, microphone } = event.payload;

      // Don't show multiple times in quick succession
      if (hasShownRef.current) return;
      hasShownRef.current = true;

      console.log("Permission lost detected:", { screen_recording, microphone });

      // Track the event
      posthog.capture("permission_lost", {
        screen_recording_lost: screen_recording,
        microphone_lost: microphone,
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
