"use client";
import React from "react";
import { Badge } from "./ui/badge";
import { toast } from "./ui/use-toast";
import { Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/hooks/use-settings";
import { useStatusDialog } from "@/lib/hooks/use-status-dialog";
import { useScreenpipeStatus } from "./screenpipe-status/context";

const HealthStatus = ({ className }: { className?: string }) => {
  const { health } = useScreenpipeStatus();
  const { open } = useStatusDialog();
  const { settings } = useSettings();

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
    open();
  };

  return (
    <>
      <Badge
        variant="default"
        className={cn(
          "cursor-pointer bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
          className
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
