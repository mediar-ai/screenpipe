import React, { useState, useEffect } from "react";
import { Check, HelpCircle, Lock, Video, X } from "lucide-react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OnboardingNavigation from "@/components/onboarding/navigation";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../ui/tooltip";
import { useSettings } from "@/lib/hooks/use-settings";
import { Label } from "../ui/label";
import { platform } from "@tauri-apps/plugin-os";
import { LogFileButton } from "../log-file-button";
import { Separator } from "../ui/separator";
import { invoke } from "@tauri-apps/api/core";
import posthog from "posthog-js";
import { toast } from "@/components/ui/use-toast";
import localforage from "localforage";

interface OnboardingStatusProps {
  className?: string;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

// Add PermissionsStatus type
type PermissionsStatus = {
  screenRecording: string;
  microphone: string;
  accessibility: string;
};

const setRestartPending = async () => {
  await localforage.setItem("screenPermissionRestartPending", true);
};

const OnboardingStatus: React.FC<OnboardingStatusProps> = ({
  className = "",
  handlePrevSlide,
  handleNextSlide,
}) => {
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useChineseMirror, setUseChineseMirror] = useState(false);
  const { updateSettings } = useSettings();
  const [permissions, setPermissions] = useState<PermissionsStatus | null>(
    null
  );
  const [isRestartNeeded, setIsRestartNeeded] = useState(false);
  const [stats, setStats] = useState<{
    screenshots: number;
    audioSeconds: number;
  } | null>(null);
  const [isMacOS, setIsMacOS] = useState(false);

  useEffect(() => {
    const checkRestartStatus = async () => {
      const restartPending = await localforage.getItem(
        "screenPermissionRestartPending"
      );
      if (restartPending) {
        // Clear the flag
        await localforage.removeItem("screenPermissionRestartPending");
        // Recheck permissions
        const perms = await invoke<PermissionsStatus>("do_permissions_check", {
          initialCheck: true,
        });
        setPermissions(perms);
      }
    };
    checkRestartStatus();
  }, []);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const perms = await invoke<PermissionsStatus>("do_permissions_check", {
          initialCheck: true,
        });
        setPermissions(perms);
      } catch (error) {
        console.error("Failed to check permissions:", error);
      }
    };
    checkPermissions();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const screenshotsResponse = await fetch(
          "http://localhost:3030/raw_sql",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: `SELECT COUNT(*) as count FROM frames`,
            }),
          }
        );
        const screenshotsResult = await screenshotsResponse.json();

        const audioResponse = await fetch("http://localhost:3030/raw_sql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `
              SELECT 
                ROUND(SUM((end_time - start_time)), 2) as total_seconds
              FROM audio_transcriptions 
              WHERE start_time IS NOT NULL 
              AND end_time IS NOT NULL
            `,
          }),
        });
        const audioResult = await audioResponse.json();

        setStats({
          screenshots: screenshotsResult[0].count,
          audioSeconds: audioResult[0].total_seconds || 0,
        });
      } catch (error) {
        console.error("failed to fetch stats:", error);
      }
    };

    // initial fetch
    fetchStats();

    // set up interval for periodic updates
    const interval = setInterval(fetchStats, 1000); // refresh every second

    // cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkPlatform = () => {
      const currentPlatform = platform();
      setIsMacOS(currentPlatform === "macos");
    };
    checkPlatform();
  }, []);

  const handlePermissionButton = async (
    type: "screen" | "audio" | "accessibility"
  ) => {
    const toastId = toast({
      title: `checking ${type} permissions`,
      description: "please wait...",
      duration: Infinity,
    });

    try {
      const os = platform();
      const permissionType =
        type === "screen"
          ? "screenRecording"
          : type === "audio"
          ? "microphone"
          : "accessibility";

      await invoke("request_permission", {
        permission: permissionType,
      });

      // Only handle macOS screen recording special case after requesting permission
      if (os === "macos" && type === "screen") {
        setIsRestartNeeded(true);
        await setRestartPending();
        toast({
          title: "restart required",
          description:
            "please restart the app after enabling screen recording permission",
          duration: 10000,
        });
        return;
      }

      // Immediately check permissions after granting
      const perms = await invoke<PermissionsStatus>("do_permissions_check", {
        initialCheck: false,
      });
      setPermissions(perms);

      const granted =
        type === "screen"
          ? perms.screenRecording.toLowerCase() === "granted"
          : type === "audio"
          ? perms.microphone.toLowerCase() === "granted"
          : perms.accessibility.toLowerCase() === "granted";

      toastId.update({
        id: toastId.id,
        title: granted ? "permission granted" : "permission check complete",
        description: granted
          ? `${type} permission was successfully granted`
          : `please try granting ${type} permission again if needed`,
        duration: 3000,
      });
    } catch (error) {
      console.error(`failed to handle ${type} permission:`, error);
      toastId.update({
        id: toastId.id,
        title: "error",
        description: `failed to handle ${type} permission`,
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleStartScreenpipe = async () => {
    posthog.capture("screenpipe_setup_start");
    setIsLoading(true);
    const toastId = toast({
      title: "starting screenpipe",
      description:
        "please wait as we download AI models and start recording\nplease check logs if this is taking longer than expected (30s)",
      duration: Infinity,
    });
    try {
      await invoke("stop_screenpipe");
      await new Promise((resolve) => setTimeout(resolve, 1_000));

      await invoke("spawn_screenpipe");
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      toastId.update({
        id: toastId.id,
        title: "screenpipe started",
        description: "screenpipe is now running.",
        duration: 3000,
      });
      setStatus("ok");
    } catch (error) {
      console.error("failed to start screenpipe:", error);
      toastId.update({
        id: toastId.id,
        title: "error",
        description: "failed to start screenpipe.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      toastId.dismiss();
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    setStatus(null);
    handleNextSlide();
  };

  const handlePrev = () => {
    setStatus(null);
    handlePrevSlide();
  };

  const handleChineseMirrorToggle = async (checked: boolean) => {
    setUseChineseMirror(checked);
    updateSettings({ useChineseMirror: checked });
  };

  return (
    <div
      className={`${className} w-full flex justify-between flex-col items-center`}
    >
      <DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img className="w-24 h-24" src="/128x128.png" alt="screenpipe-logo" />
        <DialogTitle className="text-center text-2xl">
          setting up screenpipe
        </DialogTitle>
        <p className="text-sm text-muted-foreground mt-2">
          100% local-first • your data never leaves your device
        </p>
      </DialogHeader>

      {isMacOS && (
        <div className="w-3/4 space-y-4 mt-4 flex flex-col items-center">
          <div className="flex items-center justify-between mx-auto w-full">
            <div className="flex items-right gap-2">
              {permissions && (
                <span>
                  {permissions.screenRecording.toLowerCase() === "granted" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <X className="h-4 w-4 text-red-500" />
                  )}
                </span>
              )}
              <span className="text-sm">screen recording permission</span>
            </div>
            <Button
              variant="outline"
              className="w-[260px] text-sm justify-start"
              onClick={() => handlePermissionButton("screen")}
            >
              <Lock className="h-4 w-4 mr-2" />
              grant screen permission
            </Button>
          </div>

          <div className="flex items-center justify-between mx-auto w-full">
            <div className="flex items-center gap-2">
              {permissions && (
                <span>
                  {permissions.microphone.toLowerCase() === "granted" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <X className="h-4 w-4 text-red-500" />
                  )}
                </span>
              )}
              <span className="text-sm">audio recording permission</span>
            </div>
            <Button
              variant="outline"
              className="w-[260px] text-sm justify-start"
              onClick={() => handlePermissionButton("audio")}
            >
              <Lock className="h-4 w-4 mr-2" />
              grant audio permission
            </Button>
          </div>

          <div className="flex items-center justify-between mx-auto w-full">
            <div className="flex items-center gap-2">
              {permissions && (
                <span>
                  {permissions.accessibility.toLowerCase() === "granted" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <X className="h-4 w-4 text-red-500" />
                  )}
                </span>
              )}
              <span className="text-sm">accessibility permission</span>
            </div>
            <Button
              variant="outline"
              className="w-[260px] text-sm justify-start"
              onClick={() => handlePermissionButton("accessibility")}
            >
              <Lock className="h-4 w-4 mr-2" />
              grant accessibility permission
            </Button>
          </div>
        </div>
      )}

      <Separator className="w-full my-2" />

      <div className="flex items-center space-x-2 mt-4">
        <Switch
          id="chinese-mirror-toggle"
          checked={useChineseMirror}
          onCheckedChange={handleChineseMirrorToggle}
        />
        <Label
          htmlFor="chinese-mirror-toggle"
          className="flex items-center space-x-2"
        >
          <span>i am currently in mainland china</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 cursor-default" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  enable this option to use a chinese cloud for
                  <br />
                  downloading AI models
                  <br />
                  which are blocked in mainland china.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
      </div>
      <div className="w-full flex flex-col items-center justify-center gap-2 my-1">
        {status === null ? (
          <Button
            onClick={handleStartScreenpipe}
            disabled={isLoading}
            className="mt-4"
          >
            {isLoading ? (
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
                xmlns="http://www.w3.org/2000/svg"
                className="size-5 animate-spin stroke-zinc-400 mr-2"
              >
                <path d="M12 3v3m6.366-.366-2.12 2.12M21 12h-3m.366 6.366-2.12-2.12M12 21v-3m-6.366.366 2.12-2.12M3 12h3m-.366-6.366 2.12 2.12"></path>
              </svg>
            ) : (
              <Video className="h-4 w-4 mr-2" />
            )}
            {isLoading ? "starting..." : "start recording"}
          </Button>
        ) : status === "ok" ? (
          <div className="flex flex-col items-center mt-4">
            <Check className="size-5 stroke-zinc-400" />
            <p className="text-sm text-zinc-600 mt-2 text-center">
              screenpipe setup complete. <br />
              AI models downloaded.
            </p>
          </div>
        ) : (
          <p className="text-center mt-4">{status}</p>
        )}

        <LogFileButton />
      </div>

      <OnboardingNavigation
        handlePrevSlide={handlePrev}
        handleNextSlide={handleNext}
        prevBtnText="previous"
        nextBtnText="next"
      />

      {/* Replace stats display with better styling */}
      {stats && (
        <div className="w-full p-4 space-y-3 rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">screenshots</span>
            </div>
            <span className="font-mono text-sm">
              {stats.screenshots.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">audio</span>
            </div>
            <span className="font-mono text-sm">
              {Math.round(stats.audioSeconds / 60)}m
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingStatus;
