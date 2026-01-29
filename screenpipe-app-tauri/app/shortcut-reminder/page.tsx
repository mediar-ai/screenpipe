"use client";

import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import posthog from "posthog-js";
import { usePlatform } from "@/lib/hooks/use-platform";
import { getStore } from "@/lib/hooks/use-settings";

export default function ShortcutReminderPage() {
  const { isMac, isLoading } = usePlatform();
  const [overlayShortcut, setOverlayShortcut] = useState<string | null>(null);
  const [chatShortcut, setChatShortcut] = useState<string | null>(null);

  // Load shortcuts from store on mount
  useEffect(() => {
    const loadShortcutsFromStore = async () => {
      try {
        const store = await getStore();
        const settings = await store.get<{
          showScreenpipeShortcut?: string;
          showChatShortcut?: string;
        }>("settings");
        if (settings?.showScreenpipeShortcut) {
          setOverlayShortcut(formatShortcut(settings.showScreenpipeShortcut, isMac));
        }
        if (settings?.showChatShortcut) {
          setChatShortcut(formatShortcut(settings.showChatShortcut, isMac));
        }
      } catch (e) {
        console.error("Failed to load shortcuts from store:", e);
      }
    };
    if (!isLoading) {
      loadShortcutsFromStore();
    }
  }, [isLoading, isMac]);

  // Set default shortcuts once platform is detected (fallback if store fails)
  useEffect(() => {
    if (!isLoading && overlayShortcut === null) {
      setOverlayShortcut(isMac ? "⌘⌃S" : "Alt+S");
    }
    if (!isLoading && chatShortcut === null) {
      setChatShortcut(isMac ? "⌘⌃L" : "Alt+L");
    }
  }, [isMac, isLoading, overlayShortcut, chatShortcut]);

  useEffect(() => {
    // Listen for shortcut updates and reload both from store
    const unlistenShortcut = listen<string>("shortcut-reminder-update", async () => {
      if (!isLoading) {
        try {
          const store = await getStore();
          const settings = await store.get<{
            showScreenpipeShortcut?: string;
            showChatShortcut?: string;
          }>("settings");
          if (settings?.showScreenpipeShortcut) {
            setOverlayShortcut(formatShortcut(settings.showScreenpipeShortcut, isMac));
          }
          if (settings?.showChatShortcut) {
            setChatShortcut(formatShortcut(settings.showChatShortcut, isMac));
          }
        } catch (e) {
          console.error("Failed to reload shortcuts:", e);
        }
      }
    });

    posthog.capture("shortcut_reminder_shown");

    return () => {
      unlistenShortcut.then((fn) => fn());
    };
  }, [isMac, isLoading]);

  // Use Tauri's native startDragging for window movement
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
        {/* Brand-aligned: black bg, white text, sharp corners, no shadows */}
        <div
          className="flex items-center gap-0 border border-white/20"
          style={{ background: "#000" }}
        >
          {/* Pipe logo - subtle branding */}
          <div className="flex items-center px-1.5 py-1 border-r border-white/20">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              className="text-white/40"
            >
              {/* Simplified S-pipe shape */}
              <path
                d="M7 4h6a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4h-2a4 4 0 0 0-4 4v0a4 4 0 0 0 4 4h6"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>

          {/* Overlay shortcut */}
          <div className="flex items-center gap-1.5 px-2 py-1 border-r border-white/20">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-white/60"
            >
              <rect x="3" y="3" width="18" height="18" />
              <line x1="3" y1="9" x2="21" y2="9" />
            </svg>
            <span className="font-mono text-[10px] font-medium text-white tracking-wider">
              {overlayShortcut ?? "..."}
            </span>
          </div>

          {/* Chat shortcut */}
          <div className="flex items-center gap-1.5 px-2 py-1">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-white/60"
            >
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            <span className="font-mono text-[10px] font-medium text-white tracking-wider">
              {chatShortcut ?? "..."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Format a shortcut string for display with consistent modifier ordering.
 * On macOS: Command (⌘) → Control (⌃) → Option (⌥) → Shift (⇧) → Key
 * On Windows/Linux: Ctrl → Alt → Shift → Key
 */
function formatShortcut(shortcut: string, isMac: boolean): string {
  if (!shortcut) return isMac ? "⌘⌃S" : "Alt+S";

  // Parse the shortcut into parts
  const parts = shortcut.split("+").map(p => p.trim().toLowerCase());

  // Define modifier priorities (lower = comes first)
  // Command/Super comes first, then Control, then Alt/Option, then Shift
  const modifierPriority: Record<string, number> = {
    "super": 0, "command": 0, "cmd": 0,
    "ctrl": 1, "control": 1,
    "alt": 2, "option": 2,
    "shift": 3,
  };

  // Separate modifiers from the key
  const modifiers: string[] = [];
  let key = "";

  for (const part of parts) {
    if (modifierPriority[part] !== undefined) {
      modifiers.push(part);
    } else {
      key = part;
    }
  }

  // Sort modifiers by priority (Command first)
  modifiers.sort((a, b) => (modifierPriority[a] ?? 99) - (modifierPriority[b] ?? 99));

  if (isMac) {
    // Convert to Mac symbols in sorted order
    const macSymbols: Record<string, string> = {
      "super": "⌘", "command": "⌘", "cmd": "⌘",
      "ctrl": "⌃", "control": "⌃",
      "alt": "⌥", "option": "⌥",
      "shift": "⇧",
    };
    const formattedMods = modifiers.map(m => macSymbols[m] || m).join("");
    return formattedMods + key.toUpperCase();
  } else {
    // Windows/Linux: readable format
    const winNames: Record<string, string> = {
      "super": "Win", "command": "Ctrl", "cmd": "Ctrl",
      "ctrl": "Ctrl", "control": "Ctrl",
      "alt": "Alt", "option": "Alt",
      "shift": "Shift",
    };
    const formattedMods = modifiers.map(m => winNames[m] || m);
    return [...formattedMods, key.toUpperCase()].join("+");
  }
}
