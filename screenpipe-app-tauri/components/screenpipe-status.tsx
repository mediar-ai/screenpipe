"use client";
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CodeBlock } from "@/components/ui/codeblock";
import { platform } from "@tauri-apps/plugin-os";
import { MarkdownWithExternalLinks } from "./markdown-with-external-links";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { useSettings } from "@/lib/hooks/use-settings";
import { invoke } from "@tauri-apps/api/core";
import { toast, useToast } from "./ui/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Card, CardContent, CardFooter } from "./ui/card";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import {
  Lock,
  Folder,
  FileText,
  Activity,
  Wrench,
  RefreshCw,
  HardDrive,
  HelpCircle,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { homeDir } from "@tauri-apps/api/path";
import LogViewer from "./log-viewer-v2";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Command } from "@tauri-apps/plugin-shell";
import { CliCommandDialog } from "./cli-command-dialog";
import { LogFileButton } from "./log-file-button";
import { DevModeSettings } from "./dev-mode-settings";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";

const HealthStatus = ({ className }: { className?: string }) => {
  const { health } = useHealthCheck();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const { settings } = useSettings();
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isFixingSetup, setIsFixingSetup] = useState(false);
  const [isTroubleshootOpen, setIsTroubleshootOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    setIsMac(platform() === "macos");
  }, []);

  const openScreenPermissions = async () => {
    const toastId = toast({
      title: "opening permissions",
      description: "please wait...",
      duration: Infinity,
    });

    try {
      await invoke("open_screen_capture_preferences");
    } catch (error) {
      console.error("failed to open screen permissions:", error);
      toastId.update({
        id: toastId.id,
        title: "error",
        description: "failed to open screen permissions.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleOpenDataDir = async () => {
    try {
      const homeDirPath = await homeDir();

      const dataDir =
        platform() === "macos" || platform() === "linux"
          ? `${homeDirPath}/.screenpipe`
          : `${homeDirPath}\\.screenpipe`;
      await open(dataDir as string);
    } catch (error) {
      console.error("failed to open data directory:", error);
      toast({
        title: "error",
        description: "failed to open data directory.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const getStatusColor = (
    status: string,
    frameStatus: string,
    audioStatus: string,
    uiStatus: string,
    audioDisabled: boolean,
    uiMonitoringEnabled: boolean
  ) => {
    if (status === "loading") return "bg-yellow-500";
    const isVisionOk = frameStatus === "ok" || frameStatus === "disabled";
    const isAudioOk = audioStatus === "ok" || audioStatus === "disabled" || audioDisabled;
    const isUiOk = uiStatus === "ok" || uiStatus === "disabled" || !uiMonitoringEnabled;
    return isVisionOk && isAudioOk && isUiOk ? "bg-green-500" : "bg-red-500";
  };

  const getStatusMessage = (
    status: string,
    frameStatus: string,
    audioStatus: string,
    uiStatus: string,
    audioDisabled: boolean,
    uiMonitoringEnabled: boolean
  ) => {
    if (status === "loading")
      return "screenpipe is starting up. this may take a few minutes...";

    let issues = [];
    if (frameStatus !== "ok" && frameStatus !== "disabled")
      issues.push("screen recording");
    if (!audioDisabled && audioStatus !== "ok" && audioStatus !== "disabled")
      issues.push("audio recording");
    if (uiMonitoringEnabled && uiStatus !== "ok" && uiStatus !== "disabled")
      issues.push("ui monitoring");

    if (issues.length === 0) return "screenpipe is running smoothly";
    return `there might be an issue with ${issues.join(" and ")}`;
  };

  const handleFixSetup = async () => {
    setIsFixingSetup(true);
    const toastId = toast({
      title: "fixing setup permissions",
      description: "this may take a few minutes...",
      duration: Infinity,
    });

    try {
      const args = ["setup"];
      if (settings.enableBeta) {
        args.push("--enable-beta");
      }
      console.log("args", args);
      const command = Command.sidecar("screenpipe", args);
      const child = await command.spawn();

      const outputPromise = new Promise<string>((resolve, reject) => {
        command.on("close", (data) => {
          if (data.code !== 0) {
            reject(new Error(`Command failed with code ${data.code}`));
          }
        });
        command.on("error", (error) => reject(new Error(error)));
        command.stdout.on("data", (line) => {
          console.log(line);
          if (line.includes("screenpipe setup complete")) {
            resolve("ok");
          }
        });
      });

      const timeoutPromise = new Promise(
        (_, reject) =>
          setTimeout(() => reject(new Error("Setup timed out")), 900000) // 15 minutes
      );

      const result = await Promise.race([outputPromise, timeoutPromise]);

      if (result === "ok") {
        toastId.update({
          id: toastId.id,
          title: "setup fixed",
          description: "screenpipe setup permissions have been fixed.",
          duration: 5000,
        });
      } else {
        throw new Error("setup failed or timed out");
      }
    } catch (error) {
      console.error("error fixing setup:", error);
      toastId.update({
        id: toastId.id,
        title: "error",
        description: "please try again or check the logs for more info.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsFixingSetup(false);
      toastId.dismiss();
    }
  };

  const troubleshootingSteps = [
    {
      title: "try fixing setup",
      description: "attempt to automatically fix common setup issues",
      action: (
        <div className="flex flex-col items-center">
          <Button
            variant="outline"
            onClick={handleFixSetup}
            disabled={isFixingSetup}
          >
            <Wrench className="mr-2 h-4 w-4" />
            {isFixingSetup ? "fixing..." : "fix setup"}
          </Button>
          <p className="text-xs mt-2 text-gray-500">
            this will download AI models, check permissions, and dependencies
          </p>
        </div>
      ),
    },
    {
      title: "restart screenpipe recording",
      description: "click stop and start again",
      action: (
        <div className="flex flex-col items-center">
          <Button
            variant="outline"
            onClick={async () => {
              const toastId = toast({
                title: "restarting screenpipe",
                description: "please wait...",
                duration: Infinity,
              });
              try {
                await invoke("kill_all_sreenpipes");
                await new Promise((resolve) => setTimeout(resolve, 2000));
                toastId.dismiss();
                toastId.update({
                  id: toastId.id,
                  title: "screenpipe stopped",
                  description: "screenpipe is now stopped.",
                  duration: 3000,
                });
                await invoke("spawn_screenpipe");

                toastId.dismiss();
                toastId.update({
                  id: toastId.id,
                  title: "screenpipe started",
                  description: "screenpipe is now started.",
                  duration: 3000,
                });
              } catch (error) {
                console.error("failed to stop screenpipe:", error);
                toastId.update({
                  id: toastId.id,
                  title: "error",
                  description: "failed to stop screenpipe.",
                  variant: "destructive",
                  duration: 3000,
                });
              } finally {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                toastId.dismiss();
              }
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            restart recording
          </Button>
          <p className="text-xs mt-2 text-gray-500">
            this will stop and start the recording process
          </p>
        </div>
      ),
    },
    {
      title: "check permissions",
      description: "ensure screen and audio recording permissions are granted",
      action: isMac ? (
        <div className="flex flex-col items-center">
          <Button variant="outline" onClick={openScreenPermissions}>
            <Lock className="mr-2 h-4 w-4" />
            open screen permissions
          </Button>
          <p className="text-xs mt-2 text-gray-500">
            opens system preferences for screen recording
          </p>
        </div>
      ) : null,
    },
    {
      title: "contact support",
      description: "if the issue persists, reach out to our support team",
      action: (
        <div className="flex flex-col space-y-2 items-center">
          <div className="flex items-center space-x-2 justify-center">
            <p className="text-sm">please share your logs with support:</p>
            <LogFileButton />
          </div>
          <div className="flex flex-col items-center">
            <Button
              variant="outline"
              onClick={() => open("mailto:louis@screenpi.pe")}
            >
              <FileText className="mr-2 h-4 w-4" />
              email founders
            </Button>
            <p className="text-xs mt-2 text-gray-500">
              we&apos;ll respond within 24 hours
            </p>
          </div>
          <div className="flex flex-col items-center">
            <Button
              variant="outline"
              onClick={() => open("https://cal.com/louis030195/screenpipe")}
            >
              <Activity className="mr-2 h-4 w-4" />
              book a call w founders
            </Button>
            <p className="text-xs mt-2 text-gray-500">
              schedule a 15-minute troubleshooting call
            </p>
          </div>
          <div className="flex flex-col items-center">
            <Button
              variant="outline"
              onClick={() => open("https://discord.gg/dU9EBuw7Uq")}
            >
              <HelpCircle className="mr-2 h-4 w-4" />
              join our discord
            </Button>
            <p className="text-xs mt-2 text-gray-500">
              we&apos;re more responsive on discord (or the community)
            </p>
          </div>
        </div>
      ),
    },
  ];

  if (!health) {
    return (
      <Badge
        variant="outline"
        className="cursor-pointer bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <Activity className="mr-2 h-4 w-4" />
        status{" "}
        <span className="ml-1 w-2 h-2 rounded-full bg-yellow-500 inline-block animate-pulse" />
      </Badge>
    );
  }

  const formatTimestamp = (timestamp: string | null) => {
    return timestamp ? new Date(timestamp).toLocaleString() : "n/a";
  };

  const statusColor = getStatusColor(
    health.status,
    health.frame_status,
    health.audio_status,
    health.ui_status,
    settings.disableAudio,
    settings.enableUiMonitoring
  );
  const statusMessage = getStatusMessage(
    health.status,
    health.frame_status,
    health.audio_status,
    health.ui_status,
    settings.disableAudio,
    settings.enableUiMonitoring
  );

  return (
    <>
      <Badge
        variant="outline"
        className="cursor-pointer bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground"
        onClick={() => setIsDialogOpen(true)}
      >
        <Activity className="mr-2 h-4 w-4" />
        status{" "}
        <span
          className={`ml-1 w-2 h-2 rounded-full ${statusColor} inline-block ${
            statusColor === "bg-red-500" ? "animate-pulse" : ""
          }`}
        />
      </Badge>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          className="max-w-4xl max-h-[90vh] flex flex-col p-8"
          aria-describedby="status-dialog-description"
        >
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>screenpipe status</DialogTitle>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={handleOpenDataDir}
                className="flex-shrink-0"
              >
                <Folder className="h-4 w-4 mr-2" />
                view saved data
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsTroubleshootOpen(true)}
              >
                <Wrench className="h-4 w-4 mr-2" />
                troubleshoot
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-grow overflow-auto">
            <p className="text-sm mb-4 font-semibold">{statusMessage}</p>
            <div className="space-y-2 text-xs mb-4">
              {/* Screen Recording Status */}
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full ${health.frame_status === "ok" ? "bg-green-500" : "bg-red-500"} mr-2`} />
                <span>screen recording</span>
                <span className="text-muted-foreground ml-2">status: {health.frame_status},</span>
                <span className="text-muted-foreground ml-2">last update: {formatTimestamp(health.last_frame_timestamp)}</span>
              </div>

              {/* Audio Recording Status */}
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full ${settings.disableAudio ? "bg-gray-400" : health.audio_status === "ok" ? "bg-green-500" : "bg-red-500"} mr-2`} />
                <span>audio recording</span>
                <span className="text-muted-foreground ml-2">status: {settings.disableAudio ? "turned off" : health.audio_status},</span>
                <span className="text-muted-foreground ml-2">last update: {settings.disableAudio ? "n/a" : formatTimestamp(health.last_audio_timestamp)}</span>
              </div>

              {/* UI Monitoring Status - Only show if enabled */}
              {settings.enableUiMonitoring && (
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full ${health.ui_status === "ok" ? "bg-green-500" : "bg-red-500"} mr-2`} />
                  <span>ui monitoring</span>
                  <span className="text-muted-foreground ml-2">status: {health.ui_status},</span>
                  <span className="text-muted-foreground ml-2">last update: {formatTimestamp(health.last_ui_timestamp)}</span>
                </div>
              )}
            </div>

            <Separator className="my-12" />
            <DevModeSettings />

            <Collapsible
              open={isLogOpen}
              onOpenChange={setIsLogOpen}
              className="w-full mt-4"
            >
              <div className="flex items-center justify-between w-full">
                <CollapsibleTrigger className="flex items-center justify-between p-2 flex-grow border-b border-gray-200">
                  recorder logs
                  <span>{isLogOpen ? "▲" : "▼"}</span>
                </CollapsibleTrigger>
                <LogFileButton />
              </div>
              <CollapsibleContent>
                <LogViewer className="mt-2" />
              </CollapsibleContent>
            </Collapsible>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isTroubleshootOpen} onOpenChange={setIsTroubleshootOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-center">
              troubleshooting guide
            </DialogTitle>
          </DialogHeader>
          <div className="mt-6">
            <div className="mb-16">
              <h3 className="text-2xl font-bold mb-4 text-center">
                {troubleshootingSteps[currentStep].title}
              </h3>
              <p className="text-xl text-center mb-4">
                {troubleshootingSteps[currentStep].description}
              </p>
              {troubleshootingSteps[currentStep].action && (
                <div className="flex justify-center">
                  {troubleshootingSteps[currentStep].action}
                </div>
              )}
            </div>
            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
                disabled={currentStep === 0}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                previous
              </Button>
              <span className="text-sm text-gray-500">
                {currentStep + 1} / {troubleshootingSteps.length}
              </span>
              <Button
                onClick={() =>
                  setCurrentStep((prev) =>
                    Math.min(troubleshootingSteps.length - 1, prev + 1)
                  )
                }
                disabled={currentStep === troubleshootingSteps.length - 1}
              >
                next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HealthStatus;
