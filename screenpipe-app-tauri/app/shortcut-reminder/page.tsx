"use client";

import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import posthog from "posthog-js";
import { usePlatform } from "@/lib/hooks/use-platform";
import { getStore } from "@/lib/hooks/use-settings";

export default function ShortcutReminderPage() {
  const { isMac, isLoading } = usePlatform();
  const [shortcut, setShortcut] = useState<string | null>(null);
  const [rawShortcut, setRawShortcut] = useState<string | null>(null);

  // Load shortcut from store on mount
  useEffect(() => {
    const loadShortcutFromStore = async () => {
      try {
        const store = await getStore();
        const settings = await store.get<{ showScreenpipeShortcut?: string }>("settings");
        if (settings?.showScreenpipeShortcut) {
          setRawShortcut(settings.showScreenpipeShortcut);
        }
      } catch (e) {
        console.error("Failed to load shortcut from store:", e);
      }
    };
    loadShortcutFromStore();
  }, []);

  // Set default shortcut once platform is detected (fallback if store fails)
  useEffect(() => {
    if (!isLoading && shortcut === null && rawShortcut === null) {
      // Default matches Super+Alt+S from settings
      setShortcut(isMac ? "⌘⌥S" : "Win+Alt+S");
    }
  }, [isMac, isLoading, shortcut, rawShortcut]);

  // Re-format shortcut when platform is detected or rawShortcut changes
  useEffect(() => {
    if (!isLoading && rawShortcut) {
      setShortcut(formatShortcut(rawShortcut, isMac));
    }
  }, [isMac, isLoading, rawShortcut]);

  useEffect(() => {
    const unlistenShortcut = listen<string>("shortcut-reminder-update", (event) => {
      setRawShortcut(event.payload);
      if (!isLoading) {
        setShortcut(formatShortcut(event.payload, isMac));
      }
    });

    posthog.capture("shortcut_reminder_shown");

    return () => {
      unlistenShortcut.then((fn) => fn());
    };
  }, [isMac, isLoading]);

  // Use Tauri's native startDragging for window movement
  // Note: This may cause Space switching on macOS fullscreen - fix needs to be at native level
  const handleMouseDown = useCallback(async (e: React.MouseEvent) => {
    if (e.button === 0) {
      try {
        await getCurrentWindow().startDragging();
      } catch {
        // Ignore drag errors
      }
    }
  }, []);

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: "transparent" }}
    >
      <div
        onMouseDown={handleMouseDown}
        className="select-none"
        style={{ cursor: "grab" }}
      >
        <div className="relative">
          {/* Main pill */}
          <div
            className="relative flex items-center gap-1.5 py-1 px-2.5 bg-neutral-900 rounded-full border border-white/10 shadow-lg"
          >
            {/* Pulsing dot */}
            <span className="relative flex h-1 w-1 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1 w-1 bg-pink-500" />
            </span>

            {/* Shortcut */}
            <span
              className="font-mono text-[10px] font-semibold text-white/90 tracking-wide"
            >
              {shortcut ?? "..."}
            </span>

            <span className="text-[9px] text-white/50 whitespace-nowrap">
              screenpipe
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatShortcut(shortcut: string, isMac: boolean): string {
  // Default matches Super+Alt+S from settings
  if (!shortcut) return isMac ? "⌘⌥S" : "Win+Alt+S";
  if (isMac) {
    return shortcut
      .replace(/Super|Command|Cmd/gi, "⌘")
      .replace(/Ctrl|Control/gi, "⌃")
      .replace(/Alt|Option/gi, "⌥")
      .replace(/Shift/gi, "⇧")
      .replace(/\+/g, "");
  }
  // Windows/Linux: use readable text
  return shortcut
    .replace(/Super/gi, "Win")
    .replace(/Command|Cmd/gi, "Ctrl")
    .replace(/Option/gi, "Alt");
}
