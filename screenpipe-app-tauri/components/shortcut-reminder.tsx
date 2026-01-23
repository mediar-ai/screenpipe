"use client";

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import posthog from "posthog-js";

// Track shortcut usage with PostHog - invisible component
export function ShortcutTracker() {
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    const shortcuts = [
      { event: "shortcut-show", name: "show_screenpipe" },
      { event: "shortcut-start-recording", name: "start_recording" },
      { event: "shortcut-stop-recording", name: "stop_recording" },
      { event: "shortcut-start-audio", name: "start_audio" },
      { event: "shortcut-stop-audio", name: "stop_audio" },
    ];

    shortcuts.forEach(({ event, name }) => {
      listen(event, () => {
        posthog.capture("shortcut_used", {
          shortcut_name: name,
        });
      }).then((unlisten) => {
        unsubscribers.push(unlisten);
      });
    });

    return () => {
      unsubscribers.forEach((unlisten) => unlisten());
    };
  }, []);

  // This component is invisible - just for tracking
  return null;
}

// Format shortcut for display (e.g., "Super+Alt+S" -> "⌘ ⌥ S")
export function formatShortcut(shortcut: string): string {
  if (!shortcut) return "";

  return shortcut
    .replace(/Super|Command|Cmd/gi, "⌘")
    .replace(/Ctrl|Control/gi, "⌃")
    .replace(/Alt|Option/gi, "⌥")
    .replace(/Shift/gi, "⇧")
    .replace(/\+/g, " ");
}
