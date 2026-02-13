"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettings } from "@/lib/hooks/use-settings";
import { usePlatform } from "@/lib/hooks/use-platform";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { listen } from "@tauri-apps/api/event";
import { scheduleFirstRunNotification } from "@/lib/notifications";
import { commands } from "@/lib/utils/tauri";
import posthog from "posthog-js";

function parseShortcutKeys(shortcut: string, isMac: boolean): string[] {
  if (!shortcut) return isMac ? ["⌃", "⌘", "S"] : ["Ctrl", "Win", "S"];

  const parts = shortcut.split("+").map((p) => p.trim().toLowerCase());
  const keys: string[] = [];

  for (const part of parts) {
    if (isMac) {
      switch (part) {
        case "super": case "command": case "cmd": keys.push("⌘"); break;
        case "control": case "ctrl": keys.push("⌃"); break;
        case "alt": case "option": keys.push("⌥"); break;
        case "shift": keys.push("⇧"); break;
        default: keys.push(part.toUpperCase());
      }
    } else {
      switch (part) {
        case "super": keys.push("Win"); break;
        case "command": case "cmd": case "control": case "ctrl": keys.push("Ctrl"); break;
        case "alt": case "option": keys.push("Alt"); break;
        case "shift": keys.push("Shift"); break;
        default: keys.push(part.toUpperCase());
      }
    }
  }

  return keys;
}

function KeyCap({ label, index }: { label: string; index: number }) {
  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + index * 0.12, type: "spring", stiffness: 300, damping: 20 }}
    >
      {/* Pulsing glow */}
      <motion.div
        className="absolute -inset-3 bg-primary/20 rounded-2xl blur-xl"
        animate={{ opacity: [0.2, 0.5, 0.2], scale: [0.9, 1.1, 0.9] }}
        transition={{ duration: 2.5, repeat: Infinity, delay: index * 0.3 }}
      />
      {/* Key surface */}
      <div className="relative min-w-[3.5rem] h-14 flex items-center justify-center bg-background border-2 border-foreground/20 rounded-xl shadow-lg shadow-primary/5 px-5">
        <span className="text-2xl font-mono font-bold text-foreground select-none">
          {label}
        </span>
      </div>
    </motion.div>
  );
}

export default function ShortcutGate() {
  const { settings } = useSettings();
  const { isMac } = usePlatform();
  const { completeOnboarding } = useOnboarding();
  const [seconds, setSeconds] = useState(0);
  const [showSkip, setShowSkip] = useState(false);
  const isCompletingRef = useRef(false);

  const keys = parseShortcutKeys(settings.showScreenpipeShortcut, isMac);

  // Count-up timer
  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Show skip after 30s
  useEffect(() => {
    const timer = setTimeout(() => setShowSkip(true), 30000);
    return () => clearTimeout(timer);
  }, []);

  const handleComplete = useCallback(async () => {
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;

    posthog.capture("onboarding_shortcut_pressed");
    posthog.capture("onboarding_completed");

    try {
      await completeOnboarding();
    } catch (e) {
      console.error("failed to complete onboarding:", e);
    }
    try {
      scheduleFirstRunNotification();
    } catch (e) {
      console.error("failed to schedule notification:", e);
    }

    // The shortcut handler already showed the main window (it was hidden/nonexistent
    // during onboarding, so the toggle creates & shows it). Just close onboarding.
    try {
      window.close();
    } catch {
      /* ignore */
    }
  }, [completeOnboarding]);

  const handleSkip = async () => {
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;

    posthog.capture("onboarding_shortcut_skipped");
    posthog.capture("onboarding_completed");

    try {
      await completeOnboarding();
    } catch (e) {
      console.error("failed to complete onboarding:", e);
    }
    try {
      scheduleFirstRunNotification();
    } catch (e) {
      console.error("failed to schedule notification:", e);
    }
    try {
      await commands.showWindow("Main");
      window.close();
    } catch {
      /* ignore */
    }
  };

  // Listen for the global shortcut event
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("shortcut-show", () => {
      handleComplete();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [handleComplete]);

  return (
    <div className="flex flex-col items-center justify-center space-y-10 py-4">
      {/* Recording indicator with timer */}
      <motion.div
        className="flex items-center space-x-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <motion.div
          className="w-2 h-2 rounded-full bg-red-500"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <span className="font-mono text-sm text-muted-foreground">
          recording · {seconds}s
        </span>
      </motion.div>

      {/* The gate */}
      <motion.div
        className="flex flex-col items-center space-y-7"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <div className="text-center space-y-1">
          <p className="font-mono text-sm text-muted-foreground">
            press to see your timeline
          </p>
          <p className="font-mono text-xs text-muted-foreground/60">
            then press {isMac ? "⌘⌃K" : "Alt+K"} and search &quot;entanglement&quot;
          </p>
        </div>

        <div className="flex items-center gap-3">
          {keys.map((key, i) => (
            <KeyCap key={`${key}-${i}`} label={key} index={i} />
          ))}
        </div>
      </motion.div>

      {/* Skip escape hatch — appears after 30s */}
      <div className="h-6">
        <AnimatePresence>
          {showSkip && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleSkip}
              className="font-mono text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              skip →
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
