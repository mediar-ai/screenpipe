"use client";

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import posthog from "posthog-js";

export default function ShortcutReminderPage() {
  const [shortcut, setShortcut] = useState("⌘⌃S");
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const unlistenShortcut = listen<string>("shortcut-reminder-update", (event) => {
      setShortcut(formatShortcut(event.payload));
    });

    posthog.capture("shortcut_reminder_shown");

    return () => {
      unlistenShortcut.then((fn) => fn());
    };
  }, []);

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: "transparent" }}
    >
      <div
        data-tauri-drag-region
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="select-none"
        style={{ cursor: "grab" }}
      >
        <div className="relative" data-tauri-drag-region>
          {/* Subtle glow */}
          <div
            data-tauri-drag-region
            className={`absolute inset-0 bg-pink-500/20 rounded-full blur-md transition-opacity duration-300 ${hovered ? 'opacity-100' : 'opacity-40'}`}
          />

          {/* Main pill */}
          <div
            data-tauri-drag-region
            className="relative flex items-center gap-1.5 py-1 px-2.5 bg-black/80 backdrop-blur-xl rounded-full border border-white/10 shadow-xl"
          >
            {/* Pulsing dot */}
            <span className="relative flex h-1 w-1 flex-shrink-0" data-tauri-drag-region>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1 w-1 bg-pink-500" />
            </span>

            {/* Shortcut */}
            <span
              data-tauri-drag-region
              className="font-mono text-[10px] font-semibold text-white/90 tracking-wide"
            >
              {shortcut}
            </span>

            {/* Expanded text on hover */}
            <span
              data-tauri-drag-region
              className={`
                text-[9px] text-white/50 whitespace-nowrap overflow-hidden
                transition-all duration-300 ease-out
                ${hovered ? 'max-w-[100px] opacity-100' : 'max-w-0 opacity-0'}
              `}
            >
              open screenpipe
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatShortcut(shortcut: string): string {
  if (!shortcut) return "⌘⌃S";
  return shortcut
    .replace(/Super|Command|Cmd/gi, "⌘")
    .replace(/Ctrl|Control/gi, "⌃")
    .replace(/Alt|Option/gi, "⌥")
    .replace(/Shift/gi, "⇧")
    .replace(/\+/g, "");
}
