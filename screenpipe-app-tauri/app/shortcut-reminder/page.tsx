"use client";

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import posthog from "posthog-js";

export default function ShortcutReminderPage() {
  const [shortcut, setShortcut] = useState("⌘ ⌃ S");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Listen for shortcut info from main process
    const unlistenShortcut = listen<string>("shortcut-reminder-update", (event) => {
      setShortcut(formatShortcut(event.payload));
    });

    // Listen for hide event
    const unlistenHide = listen("shortcut-reminder-hide", () => {
      setVisible(false);
      setTimeout(async () => {
        const window = getCurrentWindow();
        await window.hide();
      }, 300);
    });

    // Track that reminder was shown
    posthog.capture("shortcut_reminder_shown", { type: "native_window" });

    return () => {
      unlistenShortcut.then((fn) => fn());
      unlistenHide.then((fn) => fn());
    };
  }, []);

  const handleClick = async () => {
    posthog.capture("shortcut_reminder_dismissed", { type: "native_window" });
    setVisible(false);
    setTimeout(async () => {
      const window = getCurrentWindow();
      await window.hide();
    }, 300);
  };

  return (
    <div
      className={`w-full h-full flex items-center justify-center transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ background: "transparent" }}
    >
      <div
        onClick={handleClick}
        className="bg-black/90 text-white px-5 py-3 rounded-full flex items-center gap-2 cursor-pointer hover:bg-black/80 transition-colors shadow-2xl backdrop-blur-sm border border-white/10"
      >
        <span className="text-sm text-white/70">Press</span>
        <span className="font-mono text-sm font-semibold text-pink-400">
          {shortcut}
        </span>
        <span className="text-sm text-white/70">to open screenpipe</span>
      </div>
    </div>
  );
}

function formatShortcut(shortcut: string): string {
  if (!shortcut) return "⌘ ⌃ S";
  return shortcut
    .replace(/Super|Command|Cmd/gi, "⌘")
    .replace(/Ctrl|Control/gi, "⌃")
    .replace(/Alt|Option/gi, "⌥")
    .replace(/Shift/gi, "⇧")
    .replace(/\+/g, " ");
}
