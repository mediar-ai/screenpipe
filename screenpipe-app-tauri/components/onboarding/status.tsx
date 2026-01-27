import React, { useState, useEffect, useRef } from "react";
import { Check, Monitor, Mic, AlertTriangle, Upload, Loader, Calendar } from "lucide-react";
import { Button } from "../ui/button";
import { invoke } from "@tauri-apps/api/core";
import posthog from "posthog-js";
import { usePlatform } from "@/lib/hooks/use-platform";
import { commands, type OSPermissionsCheck } from "@/lib/utils/tauri";
import { motion } from "framer-motion";
import { useSettings, DEFAULT_PROMPT } from "@/lib/hooks/use-settings";
import { open as openPath, open as openUrl } from "@tauri-apps/plugin-shell";
import { homeDir, join } from "@tauri-apps/api/path";
import { TimelineAIDemo } from "./timeline-ai-demo";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { getVersion } from "@tauri-apps/api/app";
import { version as osVersion, platform as osPlatform } from "@tauri-apps/plugin-os";

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
  const [isSendingLogs, setIsSendingLogs] = useState(false);
  const [logsSent, setLogsSent] = useState(false);
  const [showContinueAnyway, setShowContinueAnyway] = useState(false);
  const { isMac: isMacOS } = usePlatform();
  const { settings, updateSettings } = useSettings();
  const hasStartedRef = useRef(false);
  const stuckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendLogs = async () => {
    setIsSendingLogs(true);
    try {
      const BASE_URL = "https://screenpi.pe";
      const machineId = localStorage.getItem("machineId") || crypto.randomUUID();
      localStorage.setItem("machineId", machineId);

      const identifier = settings.user?.id || machineId;
      const type = settings.user?.id ? "user" : "machine";

      // Get log files
      const logFilesResult = await commands.getLogFiles();
      if (logFilesResult.status !== "ok") throw new Error("Failed to get log files");

      const logFiles = logFilesResult.data.slice(0, 3); // Last 3 log files
      const MAX_LOG_SIZE = 50 * 1024; // 50KB per file for onboarding

      const logContents = await Promise.all(
        logFiles.map(async (file) => {
          try {
            const content = await readTextFile(file.path);
            const truncated = content.length > MAX_LOG_SIZE
              ? `... [truncated] ...\n` + content.slice(-MAX_LOG_SIZE)
              : content;
            return { name: file.name, content: truncated };
          } catch {
            return { name: file.name, content: "[Error reading file]" };
          }
        })
      );

      // Get signed URL
      const signedRes = await fetch(`${BASE_URL}/api/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, type }),
      });
      const { data: { signedUrl, path } } = await signedRes.json();

      // Get browser console logs (same as share-logs-button.tsx)
      const consoleLog = (localStorage.getItem("console_logs") || "").slice(-50000); // Last 50KB

      // Upload logs
      const combinedLogs = logContents
        .map((log) => `\n=== ${log.name} ===\n${log.content}`)
        .join("\n\n") +
        "\n\n=== Browser Console Logs ===\n" + consoleLog +
        "\n\n=== Onboarding Stuck ===\nUser experienced startup issues during onboarding.";

      await fetch(signedUrl, {
        method: "PUT",
        body: combinedLogs,
        headers: { "Content-Type": "text/plain" },
      });

      // Confirm upload
      const os = osPlatform();
      const os_version = osVersion();
      const app_version = await getVersion();

      await fetch(`${BASE_URL}/api/logs/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          identifier,
          type,
          os,
          os_version,
          app_version,
          feedback_text: "Onboarding stuck - automatic log submission",
        }),
      });

      setLogsSent(true);
    } catch (err) {
      console.error("Failed to send logs:", err);
    } finally {
      setIsSendingLogs(false);
    }
  };

  const openBookingLink = () => {
    openUrl("https://cal.com/louis030195/screenpipe-onboarding");
  };

  // Create default screenpipe-cloud preset if none exists
  const ensureDefaultPreset = async () => {
    if (settings.aiPresets.length === 0) {
      const defaultPreset = {
        id: crypto.randomUUID(),
        provider: "screenpipe-cloud" as const,
        url: "https://api.screenpi.pe/v1",
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
    // Note: Shortcut reminder and notification are shown after entire onboarding completes (in page.tsx)
    handleNextSlide();
  };

  // Check screen permission once on mount (no polling - requires app restart)
  const screenPermissionRef = useRef<string | null>(null);

  useEffect(() => {
    const checkScreenPermissionOnce = async () => {
      if (!isMacOS || hasStartedRef.current) return;

      try {
        const perms = await commands.doPermissionsCheck(true);
        screenPermissionRef.current = perms.screenRecording;
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

    if (!isMacOS) {
      setSetupState("ready");
      return;
    }

    checkScreenPermissionOnce();
  }, [isMacOS]);

  // Poll microphone permission only (screen permission requires app restart)
  useEffect(() => {
    if (!isMacOS || screenPermissionRef.current === null) return;

    const checkMicPermission = async () => {
      if (hasStartedRef.current) return;

      try {
        // Use mic-only check to avoid triggering screen capture permission dialogs
        const micStatus = await commands.checkMicrophonePermission();
        setPermissions(prev => prev ? { ...prev, microphone: micStatus } : null);

        const screenOk = screenPermissionRef.current === "granted" || screenPermissionRef.current === "notNeeded";
        const audioOk = micStatus === "granted" || micStatus === "notNeeded";

        if (screenOk && audioOk && !hasStartedRef.current) {
          setSetupState("ready");
        }
      } catch (error) {
        console.error("Failed to check mic permission:", error);
      }
    };

    const interval = setInterval(checkMicPermission, 2000);
    return () => clearInterval(interval);
  }, [isMacOS, screenPermissionRef.current]);

  // Auto-start when ready (only once)
  useEffect(() => {
    if (setupState === "ready" && !hasStartedRef.current) {
      hasStartedRef.current = true;
      handleStartRecording();
    }
  }, [setupState]);

  // Show "continue anyway" button after 5 seconds on permission screen
  const continueAnywayTimerStarted = useRef(false);
  useEffect(() => {
    if (setupState === "needs-permissions" && !continueAnywayTimerStarted.current) {
      continueAnywayTimerStarted.current = true;
      const timer = setTimeout(() => {
        setShowContinueAnyway(true);
      }, 5000);
      return () => clearTimeout(timer);
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

  const requestPermission = async (type: "screen" | "audio") => {
    try {
      if (type === "screen") {
        await commands.requestPermission("screenRecording");
      } else {
        await commands.requestPermission("microphone");
      }
    } catch (error) {
      console.error("Failed to request permission:", error);
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
              onClick={() => requestPermission("screen")}
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
              onClick={() => requestPermission("audio")}
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

          {showContinueAnyway && (
            <button
              onClick={() => {
                posthog.capture("onboarding_permission_skipped");
                hasStartedRef.current = true;
                setSetupState("ready");
              }}
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              continue anyway →
            </button>
          )}
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
              className="flex flex-col items-center space-y-4 mt-4 p-4 border border-border bg-muted/50 rounded-lg max-w-md"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center space-x-2 text-muted-foreground">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-mono text-sm">taking longer than expected</span>
              </div>
              <p className="font-mono text-xs text-muted-foreground text-center">
                this might be due to missing permissions or a startup issue.
                {isMacOS && " try granting screen recording & microphone access in system settings."}
              </p>
              <div className="flex flex-col items-center space-y-2 w-full">
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openLogsFolder}
                    className="font-mono text-xs"
                  >
                    open logs folder
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={sendLogs}
                    disabled={isSendingLogs || logsSent}
                    className="font-mono text-xs"
                  >
                    {isSendingLogs ? (
                      <><Loader className="w-3 h-3 mr-1 animate-spin" /> sending...</>
                    ) : logsSent ? (
                      <><Check className="w-3 h-3 mr-1" /> logs sent</>
                    ) : (
                      <><Upload className="w-3 h-3 mr-1" /> send logs</>
                    )}
                  </Button>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  onClick={openBookingLink}
                  className="font-mono text-xs text-primary"
                >
                  <Calendar className="w-3 h-3 mr-1" />
                  book a call for help
                </Button>
              </div>
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

          {/* Timeline + AI Chat animation */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <TimelineAIDemo />
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
          <p className="font-mono text-sm text-muted-foreground">starting screenpipe...</p>

          {isStuck && (
            <motion.div
              className="flex flex-col items-center space-y-4 mt-4 p-4 border border-border bg-muted/50 rounded-lg max-w-md"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center space-x-2 text-muted-foreground">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-mono text-sm">taking longer than expected</span>
              </div>
              <p className="font-mono text-xs text-muted-foreground text-center">
                this might be due to missing permissions or a startup issue.
                {isMacOS && " try granting screen recording & microphone access in system settings."}
              </p>
              <div className="flex flex-col items-center space-y-2 w-full">
                <div className="flex items-center space-x-2">
                  {isMacOS && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => requestPermission("screen")}
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
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={sendLogs}
                    disabled={isSendingLogs || logsSent}
                    className="font-mono text-xs"
                  >
                    {isSendingLogs ? (
                      <><Loader className="w-3 h-3 mr-1 animate-spin" /> sending...</>
                    ) : logsSent ? (
                      <><Check className="w-3 h-3 mr-1" /> logs sent</>
                    ) : (
                      <><Upload className="w-3 h-3 mr-1" /> send logs</>
                    )}
                  </Button>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  onClick={openBookingLink}
                  className="font-mono text-xs text-primary"
                >
                  <Calendar className="w-3 h-3 mr-1" />
                  book a call for help
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
