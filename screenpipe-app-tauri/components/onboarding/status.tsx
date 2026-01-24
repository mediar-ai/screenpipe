import React, { useState, useEffect, useRef } from "react";
import { Check, Monitor, Mic, AlertTriangle, MessageSquare } from "lucide-react";
import { Button } from "../ui/button";
import { invoke } from "@tauri-apps/api/core";
import posthog from "posthog-js";
import { usePlatform } from "@/lib/hooks/use-platform";
import { commands, type OSPermissionsCheck } from "@/lib/utils/tauri";
import { motion } from "framer-motion";
import { useSettings, DEFAULT_PROMPT } from "@/lib/hooks/use-settings";
import { open as openPath } from "@tauri-apps/plugin-shell";
import { homeDir, join } from "@tauri-apps/api/path";
import { scheduleFirstRunNotification } from "@/lib/notifications";

// Format shortcut for display (platform-aware)
function formatShortcut(shortcut: string, isMac: boolean): string {
  if (!shortcut) return "";
  if (isMac) {
    return shortcut
      .replace(/Super|Command|Cmd/gi, "⌘")
      .replace(/Ctrl|Control/gi, "⌃")
      .replace(/Alt|Option/gi, "⌥")
      .replace(/Shift/gi, "⇧")
      .replace(/\+/g, " ");
  }
  // Windows/Linux: use readable text
  return shortcut
    .replace(/Super/gi, "Win")
    .replace(/Command|Cmd/gi, "Ctrl")
    .replace(/Option/gi, "Alt");
}

interface OnboardingStatusProps {
  className?: string;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

type SetupState = "checking" | "needs-permissions" | "ready" | "starting" | "recording";

const STUCK_TIMEOUT_MS = 30000; // 30 seconds

const OnboardingStatus: React.FC<OnboardingStatusProps> = ({
  className = "",
  handleNextSlide,
}) => {
  const [setupState, setSetupState] = useState<SetupState>("checking");
  const [permissions, setPermissions] = useState<OSPermissionsCheck | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  const { isMac: isMacOS } = usePlatform();
  const { settings, updateSettings } = useSettings();
  const hasStartedRef = useRef(false);
  const stuckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create default screenpipe-cloud preset if none exists
  const ensureDefaultPreset = async () => {
    if (settings.aiPresets.length === 0) {
      const defaultPreset = {
        id: crypto.randomUUID(),
        provider: "screenpipe-cloud" as const,
        url: "https://ai-proxy.i-f9f.workers.dev/v1",
        model: "claude-haiku-4-5",
        maxContextChars: 512000,
        defaultPreset: true,
        prompt: DEFAULT_PROMPT,
        apiKey: "",
      };
      await updateSettings({ aiPresets: [defaultPreset] });
    }
  };

  const handleComplete = async () => {
    await ensureDefaultPreset();
    // Show native shortcut reminder window
    if (settings.showScreenpipeShortcut) {
      commands.showShortcutReminder(settings.showScreenpipeShortcut);
    }
    // Schedule 2-hour reminder notification (first run only)
    scheduleFirstRunNotification();
    handleNextSlide();
  };

  // Check permissions
  useEffect(() => {
    const checkPermissions = async () => {
      // Don't check if already starting or recording
      if (hasStartedRef.current) return;

      if (!isMacOS) {
        setSetupState("ready");
        return;
      }

      try {
        const perms = await commands.doPermissionsCheck(true);
        setPermissions(perms);

        const screenOk = perms.screenRecording === "granted" || perms.screenRecording === "notNeeded";
        const audioOk = perms.microphone === "granted" || perms.microphone === "notNeeded";

        if (screenOk && audioOk && !hasStartedRef.current) {
          setSetupState("ready");
        } else if (!hasStartedRef.current) {
          setSetupState("needs-permissions");
        }
      } catch (error) {
        console.error("Failed to check permissions:", error);
        if (!hasStartedRef.current) {
          setSetupState("ready");
        }
      }
    };

    checkPermissions();
    const interval = setInterval(checkPermissions, 2000);
    return () => clearInterval(interval);
  }, [isMacOS]);

  // Auto-start when ready (only once)
  useEffect(() => {
    if (setupState === "ready" && !hasStartedRef.current) {
      hasStartedRef.current = true;
      handleStartRecording();
    }
  }, [setupState]);

  // Track stuck state with timeout
  useEffect(() => {
    // Clear any existing timeout
    if (stuckTimeoutRef.current) {
      clearTimeout(stuckTimeoutRef.current);
      stuckTimeoutRef.current = null;
    }

    // Set timeout for "ready" or "starting" states
    if (setupState === "ready" || setupState === "starting") {
      setIsStuck(false);
      stuckTimeoutRef.current = setTimeout(() => {
        setIsStuck(true);
      }, STUCK_TIMEOUT_MS);
    } else {
      setIsStuck(false);
    }

    return () => {
      if (stuckTimeoutRef.current) {
        clearTimeout(stuckTimeoutRef.current);
      }
    };
  }, [setupState]);

  const openLogsFolder = async () => {
    try {
      const home = await homeDir();
      const screenpipeDir = await join(home, ".screenpipe");
      await openPath(screenpipeDir);
    } catch (error) {
      console.error("Failed to open logs folder:", error);
    }
  };

  const handleStartRecording = async () => {
    posthog.capture("screenpipe_setup_start");
    setSetupState("starting");

    try {
      await invoke("stop_screenpipe");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await invoke("spawn_screenpipe");
      await new Promise((resolve) => setTimeout(resolve, 3000));
      setSetupState("recording");
    } catch (error) {
      console.error("Failed to start screenpipe:", error);
      setSetupState("ready");
    }
  };

  const openSystemPreferences = async (type: "screen" | "audio") => {
    try {
      if (type === "screen") {
        await commands.openPermissionSettings("screenRecording");
      } else {
        await commands.openPermissionSettings("microphone");
      }
    } catch (error) {
      console.error("Failed to open preferences:", error);
    }
  };

  const screenGranted = permissions?.screenRecording === "granted" || permissions?.screenRecording === "notNeeded";
  const audioGranted = permissions?.microphone === "granted" || permissions?.microphone === "notNeeded";

  return (
    <div className={`${className} w-full flex flex-col items-center justify-center min-h-[400px]`}>

      {/* Checking state */}
      {setupState === "checking" && (
        <motion.div
          className="flex flex-col items-center space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="w-6 h-6 border border-foreground border-t-transparent animate-spin" />
          <p className="font-mono text-sm text-muted-foreground">checking permissions...</p>
        </motion.div>
      )}

      {/* Needs permissions */}
      {setupState === "needs-permissions" && (
        <motion.div
          className="flex flex-col items-center space-y-8 max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="text-center space-y-2">
            <h2 className="font-mono text-xl text-foreground">grant access</h2>
            <p className="font-mono text-xs text-muted-foreground">
              screenpipe needs permission to capture your screen and audio
            </p>
          </div>

          <div className="space-y-3 w-full">
            <button
              onClick={() => openSystemPreferences("screen")}
              className="w-full flex items-center justify-between p-4 border border-border hover:bg-foreground hover:text-background transition-all group"
            >
              <div className="flex items-center space-x-3">
                <Monitor className="w-5 h-5" strokeWidth={1.5} />
                <span className="font-mono text-sm">screen recording</span>
              </div>
              {screenGranted ? (
                <Check className="w-5 h-5 text-foreground group-hover:text-background" strokeWidth={1.5} />
              ) : (
                <span className="font-mono text-xs text-muted-foreground group-hover:text-background/70">click to enable</span>
              )}
            </button>

            <button
              onClick={() => openSystemPreferences("audio")}
              className="w-full flex items-center justify-between p-4 border border-border hover:bg-foreground hover:text-background transition-all group"
            >
              <div className="flex items-center space-x-3">
                <Mic className="w-5 h-5" strokeWidth={1.5} />
                <span className="font-mono text-sm">microphone</span>
              </div>
              {audioGranted ? (
                <Check className="w-5 h-5 text-foreground group-hover:text-background" strokeWidth={1.5} />
              ) : (
                <span className="font-mono text-xs text-muted-foreground group-hover:text-background/70">click to enable</span>
              )}
            </button>
          </div>

          <p className="font-mono text-xs text-muted-foreground text-center">
            toggle permissions in system settings, then return here
          </p>
        </motion.div>
      )}

      {/* Starting state */}
      {setupState === "starting" && (
        <motion.div
          className="flex flex-col items-center space-y-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="w-6 h-6 border border-foreground border-t-transparent animate-spin" />
          <div className="text-center space-y-2">
            <p className="font-mono text-sm text-foreground">starting screenpipe...</p>
            <p className="font-mono text-xs text-muted-foreground">downloading AI models</p>
          </div>

          {isStuck && (
            <motion.div
              className="flex flex-col items-center space-y-4 mt-4 p-4 border border-yellow-500/30 bg-yellow-500/5 rounded-lg max-w-md"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center space-x-2 text-yellow-600 dark:text-yellow-500">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-mono text-sm">taking longer than expected</span>
              </div>
              <p className="font-mono text-xs text-muted-foreground text-center">
                this might be due to missing permissions or a startup issue.
                {isMacOS && " try granting screen recording & microphone access in system settings."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={openLogsFolder}
                className="font-mono text-xs"
              >
                open logs folder
              </Button>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Recording state */}
      {setupState === "recording" && (
        <motion.div
          className="flex flex-col items-center space-y-8"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-foreground animate-pulse" />
            <span className="font-mono text-lg text-foreground">recording</span>
          </div>

          <div className="text-center space-y-2">
            <p className="font-mono text-sm text-muted-foreground">
              screenpipe is now capturing your screen and audio
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              find it in your menu bar anytime
            </p>
          </div>

          {/* Shortcut reminder */}
          <div className="bg-muted/50 border border-border px-4 py-3 rounded-lg">
            <p className="font-mono text-xs text-center text-muted-foreground">
              press{" "}
              <span className="font-semibold text-foreground">
                {formatShortcut(settings.showScreenpipeShortcut, isMacOS)}
              </span>{" "}
              anytime to open screenpipe
            </p>
          </div>

          {/* Timeline + AI Chat animation placeholder */}
          <motion.div
            className="bg-muted/30 border border-border rounded-lg p-4 max-w-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center space-x-2 mb-3">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="font-mono text-xs font-medium text-foreground">
                then chat with your history
              </span>
            </div>
            {/* TODO: Replace with Lottie animation showing timeline selection + AI chat */}
            <div className="bg-background/50 rounded border border-border p-3 space-y-2">
              <div className="flex items-center space-x-2">
                <div className="h-2 bg-muted-foreground/20 rounded flex-1">
                  <div className="h-2 bg-primary/50 rounded w-1/4 ml-[30%]" />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">select</span>
              </div>
              <p className="font-mono text-[10px] text-muted-foreground text-center">
                press{" "}
                <span className="font-semibold text-foreground">⌘ L</span>{" "}
                to ask AI about any moment
              </p>
            </div>
          </motion.div>

          <div className="flex items-center space-x-4 text-xs font-mono text-muted-foreground">
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4" strokeWidth={1.5} />
              <span>screen</span>
            </div>
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4" strokeWidth={1.5} />
              <span>audio</span>
            </div>
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4" strokeWidth={1.5} />
              <span>local</span>
            </div>
          </div>

          <Button onClick={handleComplete} size="lg">
            continue
          </Button>
        </motion.div>
      )}

      {/* Ready but not auto-started (fallback) */}
      {setupState === "ready" && (
        <motion.div
          className="flex flex-col items-center space-y-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="w-6 h-6 border border-foreground border-t-transparent animate-spin" />
          <p className="font-mono text-sm text-muted-foreground">preparing...</p>

          {isStuck && (
            <motion.div
              className="flex flex-col items-center space-y-4 mt-4 p-4 border border-yellow-500/30 bg-yellow-500/5 rounded-lg max-w-md"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center space-x-2 text-yellow-600 dark:text-yellow-500">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-mono text-sm">taking longer than expected</span>
              </div>
              <p className="font-mono text-xs text-muted-foreground text-center">
                this might be due to missing permissions or a startup issue.
                {isMacOS && " try granting screen recording & microphone access in system settings."}
              </p>
              <div className="flex items-center space-x-2">
                {isMacOS && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openSystemPreferences("screen")}
                    className="font-mono text-xs"
                  >
                    check permissions
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openLogsFolder}
                  className="font-mono text-xs"
                >
                  open logs folder
                </Button>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default OnboardingStatus;
