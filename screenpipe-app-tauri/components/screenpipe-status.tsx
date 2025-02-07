"use client";
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "./ui/badge";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "./ui/use-toast";

import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Lock, Folder, Activity, Power } from "lucide-react";
import { open as openUrl } from "@tauri-apps/plugin-shell";

import { LogFileButton } from "./log-file-button";
import { DevModeSettings } from "./dev-mode-settings";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";
import { useSettings } from "@/lib/hooks/use-settings";
import { useStatusDialog } from "@/lib/hooks/use-status-dialog";
import { platform } from "@tauri-apps/plugin-os";
import { useScreenpipeStatus } from "./screenpipe-status/context";

const HealthStatus = ({ className }: { className?: string }) => {
  const { health } = useScreenpipeStatus();
  const { open } = useStatusDialog();
  const { settings, getDataDir } = useSettings();
  const [localDataDir, setLocalDataDir] = useState("");

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

  const statusColor = getStatusColor(
    health?.status ?? "",
    health?.frame_status ?? "",
    health?.audio_status ?? "",
    health?.ui_status ?? "",
    settings.disableAudio,
    settings.enableUiMonitoring
  );

  const handleOpenStatusDialog = async () => {
    try {
      const dir = await getDataDir();
      setLocalDataDir(dir);
      open();
    } catch (error) {
      console.error("failed to open status dialog:", error);
      toast({
        title: "error",
        description: "failed to open status dialog. please try again.",
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
        {/* <Activity className="mr-2 h-4 w-4" /> */}
        <Power className="mr-2 h-4 w-4" />
        <span
          className={`ml-1 w-2 h-2 rounded-full ${statusColor} inline-block ${
            statusColor === "bg-red-500" ? "animate-pulse" : ""
          }`}
        />
      </Badge>
    </>
  );
};

export default HealthStatus;
