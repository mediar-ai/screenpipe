import React from "react";
import { motion } from "framer-motion";
import { MessageSquare, Sparkles } from "lucide-react";
import { useSettings } from "@/lib/hooks/use-settings";
import { usePlatform } from "@/lib/hooks/use-platform";

/**
 * Format a shortcut string for display with consistent modifier ordering.
 * On macOS: Command (⌘) → Control (⌃) → Option (⌥) → Shift (⇧) → Key
 */
function formatShortcut(shortcut: string, isMac: boolean): string {
  if (!shortcut) return "";

  const parts = shortcut.split("+").map(p => p.trim().toLowerCase());
  const modifierPriority: Record<string, number> = {
    "super": 0, "command": 0, "cmd": 0,
    "ctrl": 1, "control": 1,
    "alt": 2, "option": 2,
    "shift": 3,
  };

  const modifiers: string[] = [];
  let key = "";

  for (const part of parts) {
    if (modifierPriority[part] !== undefined) {
      modifiers.push(part);
    } else {
      key = part;
    }
  }

  modifiers.sort((a, b) => (modifierPriority[a] ?? 99) - (modifierPriority[b] ?? 99));

  if (isMac) {
    const macSymbols: Record<string, string> = {
      "super": "⌘", "command": "⌘", "cmd": "⌘",
      "ctrl": "⌃", "control": "⌃",
      "alt": "⌥", "option": "⌥",
      "shift": "⇧",
    };
    return modifiers.map(m => macSymbols[m] || m).join("") + key.toUpperCase();
  } else {
    const winNames: Record<string, string> = {
      "super": "Win", "command": "Ctrl", "cmd": "Ctrl",
      "ctrl": "Ctrl", "control": "Ctrl",
      "alt": "Alt", "option": "Alt",
      "shift": "Shift",
    };
    return [...modifiers.map(m => winNames[m] || m), key.toUpperCase()].join("+");
  }
}

/**
 * Animated demo showing:
 * 1. Timeline with activity bars
 * 2. Selection being made (drag effect)
 * 3. AI chat appearing
 * 4. Response typing in
 *
 * Loops every 6 seconds
 */
export const TimelineAIDemo: React.FC = () => {
  const { settings } = useSettings();
  const { isMac } = usePlatform();
  const chatShortcut = formatShortcut(settings.showChatShortcut, isMac);
  return (
    <div className="bg-muted/30 border border-border rounded-lg p-4 max-w-sm overflow-hidden">
      <div className="flex items-center space-x-2 mb-3">
        <MessageSquare className="w-4 h-4 text-primary" />
        <span className="font-mono text-xs font-medium text-foreground">
          then chat with your history
        </span>
      </div>

      <div className="bg-background rounded border border-border p-3 space-y-3">
        {/* Timeline visualization */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] text-muted-foreground">timeline</span>
            <span className="font-mono text-[9px] text-muted-foreground">2:00pm</span>
          </div>

          {/* Activity bars */}
          <div className="relative h-6 bg-muted/50 rounded overflow-hidden">
            {/* Static activity indicators */}
            <div className="absolute inset-y-1 left-[5%] w-[15%] bg-blue-500/30 rounded-sm" />
            <div className="absolute inset-y-1 left-[25%] w-[20%] bg-green-500/30 rounded-sm" />
            <div className="absolute inset-y-1 left-[50%] w-[10%] bg-purple-500/30 rounded-sm" />
            <div className="absolute inset-y-1 left-[65%] w-[25%] bg-orange-500/30 rounded-sm" />

            {/* Animated selection highlight */}
            <motion.div
              className="absolute inset-y-0 bg-primary/20 border-x-2 border-primary"
              initial={{ left: "20%", width: "0%" }}
              animate={{
                left: ["20%", "20%", "20%", "20%"],
                width: ["0%", "35%", "35%", "35%"],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                times: [0, 0.2, 0.7, 1],
                ease: "easeInOut",
              }}
            />

            {/* Selection handles */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-primary rounded-full"
              initial={{ left: "20%", opacity: 0 }}
              animate={{
                left: ["20%", "20%", "20%", "20%"],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                times: [0, 0.2, 0.7, 1],
              }}
            />
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-primary rounded-full"
              initial={{ left: "20%", opacity: 0 }}
              animate={{
                left: ["20%", "55%", "55%", "55%"],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                times: [0, 0.2, 0.7, 1],
              }}
            />
          </div>
        </div>

        {/* Keyboard shortcut hint */}
        <motion.div
          className="flex items-center justify-center space-x-1"
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0, 1, 1, 0],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            times: [0, 0.15, 0.25, 0.35, 0.45],
          }}
        >
          <span className="font-mono text-[10px] text-muted-foreground">press</span>
          <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono font-semibold">
            {chatShortcut}
          </kbd>
        </motion.div>

        {/* AI Chat bubble */}
        <motion.div
          className="bg-muted/50 rounded-lg p-2 space-y-2"
          initial={{ opacity: 0, y: 10, height: 0 }}
          animate={{
            opacity: [0, 0, 0, 1, 1, 0],
            y: [10, 10, 10, 0, 0, 0],
            height: ["0px", "0px", "0px", "auto", "auto", "auto"],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            times: [0, 0.3, 0.35, 0.45, 0.9, 1],
          }}
        >
          {/* User question */}
          <motion.div
            className="flex items-start space-x-2"
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 0, 0, 0, 1, 1, 0],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              times: [0, 0.35, 0.4, 0.45, 0.5, 0.9, 1],
            }}
          >
            <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-[8px]">👤</span>
            </div>
            <p className="font-mono text-[10px] text-foreground">
              what was discussed here?
            </p>
          </motion.div>

          {/* AI response */}
          <motion.div
            className="flex items-start space-x-2"
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 0, 0, 0, 0, 1, 1, 0],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              times: [0, 0.45, 0.5, 0.55, 0.6, 0.65, 0.9, 1],
            }}
          >
            <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-2.5 h-2.5 text-primary-foreground" />
            </div>
            <div className="space-y-1">
              <motion.p
                className="font-mono text-[10px] text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: [0, 0, 0, 0, 0, 0, 1, 1, 0],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  times: [0, 0.5, 0.55, 0.6, 0.65, 0.68, 0.72, 0.9, 1],
                }}
              >
                In this meeting you discussed
              </motion.p>
              <motion.p
                className="font-mono text-[10px] text-foreground"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: [0, 0, 0, 0, 0, 0, 0, 1, 1, 0],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  times: [0, 0.55, 0.6, 0.65, 0.7, 0.73, 0.76, 0.8, 0.9, 1],
                }}
              >
                Q1 roadmap priorities...
              </motion.p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default TimelineAIDemo;
