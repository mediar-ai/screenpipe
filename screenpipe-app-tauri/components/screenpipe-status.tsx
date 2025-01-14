"use client";
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { platform } from "@tauri-apps/plugin-os";
import { Badge } from "./ui/badge";
import { invoke } from "@tauri-apps/api/core";
import { toast, useToast } from "./ui/use-toast";

import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { Lock, Folder, Activity } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import LogViewer from "./log-viewer-v2";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { LogFileButton } from "./log-file-button";
import { DevModeSettings } from "./dev-mode-settings";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";
import { useSettings } from "@/lib/hooks/use-settings";

type PermissionsStatus = {
  screenRecording: string;
  microphone: string;
  accessibility: string;
};

const HealthStatus = ({ className }: { className?: string }) => {
  const { health, debouncedFetchHealth } = useHealthCheck();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const { settings, getDataDir } = useSettings();
  const [localDataDir, setLocalDataDir] = useState("");
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isDialogLoading, setIsDialogLoading] = useState(false);
  const [permissions, setPermissions] = useState<PermissionsStatus | null>(
    null
  );

  useEffect(() => {
    setIsMac(platform() === "macos");
  }, []);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const perms = await invoke<PermissionsStatus>("do_permissions_check", {
          initialCheck: true,
        });

        setPermissions({
          screenRecording: perms.screenRecording,
          microphone: perms.microphone,
          accessibility: perms.accessibility,
        });
      } catch (error) {
        console.error("Failed to check permissions:", error);
      }
    };
    checkPermissions();
  }, []);

  const handleOpenDataDir = async () => {
    try {
      const dataDir = await getDataDir();
      await open(dataDir);
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
    const isAudioOk =
      audioStatus === "ok" || audioStatus === "disabled" || audioDisabled;
    const isUiOk =
      uiStatus === "ok" || uiStatus === "disabled" || !uiMonitoringEnabled;
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

  const formatTimestamp = (timestamp: string | null) => {
    return timestamp ? new Date(timestamp).toLocaleString() : "n/a";
  };

  const statusColor = getStatusColor(
    health?.status ?? "",
    health?.frame_status ?? "",
    health?.audio_status ?? "",
    health?.ui_status ?? "",
    settings.disableAudio,
    settings.enableUiMonitoring
  );
  const statusMessage = getStatusMessage(
    health?.status ?? "",
    health?.frame_status ?? "",
    health?.audio_status ?? "",
    health?.ui_status ?? "",
    settings.disableAudio ?? "",
    settings.enableUiMonitoring
  );

  const handleOpenStatusDialog = async () => {
    try {
      setIsDialogLoading(true);
      const dir = await getDataDir();
      setLocalDataDir(dir);
      setIsDialogOpen(true);
    } catch (error) {
      console.error("failed to open status dialog:", error);
      toast({
        title: "error",
        description: "failed to open status dialog. please try again.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsDialogLoading(false);
    }
  };

  const handlePermissionButton = async (
    type: "screen" | "audio" | "accessibility"
  ) => {
    const toastId = toast({
      title: `checking ${type} permissions`,
      description: "please wait...",
      duration: Infinity,
    });

    try {
      const permissionType =
        type === "screen"
          ? "screenRecording"
          : type === "audio"
          ? "microphone"
          : "accessibility";

      await invoke("request_permission", {
        permission: permissionType,
      });

      const perms = await invoke<PermissionsStatus>("do_permissions_check", {
        initialCheck: false,
      });

      setPermissions({
        screenRecording: perms.screenRecording,
        microphone: perms.microphone,
        accessibility: perms.accessibility,
      });

      const granted =
        type === "screen"
          ? perms.screenRecording === "Granted"
          : type === "audio"
          ? perms.microphone === "Granted"
          : perms.accessibility === "Granted";

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

  return (
    <>
      <Badge
        variant="default"
        className={cn(
          "cursor-pointer bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground"
        )}
        onClick={handleOpenStatusDialog}
      >
        <Activity className="mr-2 h-4 w-4" />
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
              <LogFileButton size="10" />

              <Button
                variant="outline"
                onClick={handleOpenDataDir}
                className="flex-shrink-0"
              >
                <Folder className="h-4 w-4 mr-2" />
                view saved data
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-grow overflow-auto">
            <p className="text-sm mb-4 font-semibold">{statusMessage}</p>
            <div className="space-y-2 text-sm">
              {/* Screen Recording Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      health?.frame_status === "ok"
                        ? "bg-green-500"
                        : "bg-red-500"
                    }`}
                  />
                  <span className="text-sm">screen recording</span>
                  <span className="text-sm text-muted-foreground">
                    status: {health ? health.frame_status : "error"}, last
                    update:{" "}
                    {formatTimestamp(health?.last_frame_timestamp ?? null)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {permissions && (
                    <span>
                      {permissions.screenRecording ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <X className="h-4 w-4 text-red-500" />
                      )}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    className="w-[260px] text-sm justify-start"
                    onClick={() => handlePermissionButton("screen")}
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    grant screen permission
                  </Button>
                </div>
              </div>

              {/* Audio Recording Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      settings.disableAudio
                        ? "bg-gray-400"
                        : health?.audio_status === "ok"
                        ? "bg-green-500"
                        : "bg-red-500"
                    }`}
                  />
                  <span className="text-sm">audio recording</span>
                  <span className="text-sm text-muted-foreground">
                    status:{" "}
                    {settings.disableAudio
                      ? "turned off"
                      : health
                      ? health.audio_status
                      : "error"}
                    , last update:{" "}
                    {settings.disableAudio
                      ? "n/a"
                      : formatTimestamp(health?.last_audio_timestamp ?? null)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {permissions && (
                    <span>
                      {permissions.microphone ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <X className="h-4 w-4 text-red-500" />
                      )}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    className="w-[260px] text-sm justify-start"
                    onClick={() => handlePermissionButton("audio")}
                    disabled={settings.disableAudio}
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    grant audio permission
                  </Button>
                </div>
              </div>

              {/* UI Monitoring Status */}
              {settings.enableUiMonitoring && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        health?.ui_status === "ok"
                          ? "bg-green-500"
                          : "bg-red-500"
                      }`}
                    />
                    <span className="text-sm">ui monitoring</span>
                    <span className="text-sm text-muted-foreground">
                      status: {health?.ui_status}, last update:{" "}
                      {formatTimestamp(
                        health ? health.last_ui_timestamp : "error"
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {permissions && (
                      <span>
                        {permissions.accessibility ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <X className="h-4 w-4 text-red-500" />
                        )}
                      </span>
                    )}
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
            </div>

            <Separator className="my-12" />
            <DevModeSettings localDataDir={localDataDir} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HealthStatus;
