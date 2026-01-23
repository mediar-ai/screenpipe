"use client";

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import posthog from "posthog-js";

export default function ShortcutReminderPage() {
  const [shortcut, setShortcut] = useState("⌘⌃S");
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);

  const hideWindow = async () => {
    posthog.capture("shortcut_reminder_dismissed");
    setVisible(false);
    setTimeout(async () => {
      const window = getCurrentWindow();
      await window.hide();
    }, 200);
  };

  useEffect(() => {
    const unlistenShortcut = listen<string>("shortcut-reminder-update", (event) => {
      setShortcut(formatShortcut(event.payload));
    });

    const unlistenHide = listen("shortcut-reminder-hide", hideWindow);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hideWindow();
    };
    window.addEventListener("keydown", handleKeyDown);

    posthog.capture("shortcut_reminder_shown");

    return () => {
      unlistenShortcut.then((fn) => fn());
      unlistenHide.then((fn) => fn());
      window.removeEventListener("keydown", handleKeyDown);
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
        className={`
          select-none
          transition-all duration-300 ease-out
          ${visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}
        `}
        style={{ cursor: "grab" }}
      >
        <div className="relative" data-tauri-drag-region>
          {/* Subtle glow */}
          <div
            data-tauri-drag-region
            className={`absolute inset-0 bg-pink-500/30 rounded-full blur-md transition-opacity duration-300 ${hovered ? 'opacity-100' : 'opacity-50'}`}
          />

          {/* Main pill */}
          <div
            data-tauri-drag-region
            className={`
              relative flex items-center gap-2 py-1.5 px-3
              bg-black/85 backdrop-blur-xl rounded-full
              border border-white/10 shadow-2xl
              transition-all duration-300 ease-out
            `}
          >
            {/* Pulsing dot */}
            <span className="relative flex h-1.5 w-1.5 flex-shrink-0" data-tauri-drag-region>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-pink-500" />
            </span>

            {/* Shortcut */}
            <span
              data-tauri-drag-region
              className="font-mono text-[11px] font-semibold text-white/90 tracking-wide"
            >
              {shortcut}
            </span>

            {/* Expanded text on hover */}
            <span
              data-tauri-drag-region
              className={`
                text-[10px] text-white/60 whitespace-nowrap overflow-hidden
                transition-all duration-300 ease-out
                ${hovered ? 'max-w-[150px] opacity-100 ml-0.5' : 'max-w-0 opacity-0'}
              `}
            >
              open screenpipe
            </span>

            {/* Close button on hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                hideWindow();
              }}
              className={`
                ml-1 text-white/40 hover:text-white/80
                transition-all duration-200
                ${hovered ? 'opacity-100 w-4' : 'opacity-0 w-0'}
              `}
            >
              ×
            </button>
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
