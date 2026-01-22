import React, { useState, useEffect, useRef } from "react";
import { Check, Monitor, Mic } from "lucide-react";
import { Button } from "../ui/button";
import { invoke } from "@tauri-apps/api/core";
import posthog from "posthog-js";
import { usePlatform } from "@/lib/hooks/use-platform";
import { commands, OSPermissionsCheck } from "@/lib/utils/tauri";
import { motion } from "framer-motion";
import { useSettings, DEFAULT_PROMPT } from "@/lib/hooks/use-settings";

interface OnboardingStatusProps {
  className?: string;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

type SetupState = "checking" | "needs-permissions" | "ready" | "starting" | "recording";

const OnboardingStatus: React.FC<OnboardingStatusProps> = ({
  className = "",
  handleNextSlide,
}) => {
  const [setupState, setSetupState] = useState<SetupState>("checking");
  const [permissions, setPermissions] = useState<OSPermissionsCheck | null>(null);
  const { isMac: isMacOS } = usePlatform();
  const { settings, updateSettings } = useSettings();
  const hasStartedRef = useRef(false);

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
        </motion.div>
      )}
    </div>
  );
};

export default OnboardingStatus;
