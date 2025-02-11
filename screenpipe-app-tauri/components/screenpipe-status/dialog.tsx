import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { LogFileButton } from "../log-file-button";
import { Button } from "../ui/button";
import { Check, Folder, Lock, X } from "lucide-react";
import { useSettings } from "@/lib/hooks/use-settings";
import { useScreenpipeStatus } from "./context";
import { useStatusDialog } from "@/lib/hooks/use-status-dialog";
import { PermissionDevices } from "./types";
import { Separator } from "../ui/separator";
import { DevModeSettings } from "../dev-mode-settings";
import { toast } from "../ui/use-toast";
import { open as openUrl } from "@tauri-apps/plugin-shell";

export function ScreenpipeStatusDialog() {
    const { isOpen, close } = useStatusDialog();
    const { permissions, isMacOS, handlePermissionButton, health } = useScreenpipeStatus();
    const { settings, localDataDir } = useSettings();

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

    const statusMessage = getStatusMessage(
        health?.status ?? "",
        health?.frame_status ?? "",
        health?.audio_status ?? "",
        health?.ui_status ?? "",
        settings.disableAudio ?? "",
        settings.enableUiMonitoring
    );


    const formatTimestamp = (timestamp: string | null) => {
        return timestamp ? new Date(timestamp).toLocaleString() : "n/a";
    };

    const handleOpenDataDir = async () => {
        try {
          await openUrl(localDataDir);
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

    return (
        <Dialog open={isOpen} onOpenChange={close}>
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
                            {isMacOS && (
                            <div className="flex items-center gap-2">
                                {permissions && (
                                <span>
                                    {permissions.screenRecording.toLowerCase() === "granted" ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                    ) : (
                                    <X className="h-4 w-4 text-red-500" />
                                    )}
                                </span>
                                )}
                                <Button
                                variant="outline"
                                className="w-[260px] text-sm justify-start"
                                onClick={() => handlePermissionButton(PermissionDevices.SCREEN_RECORDING)}
                                >
                                    <Lock className="h-4 w-4 mr-2" />
                                    grant screen permission
                                </Button>
                            </div>
                            )}
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
                            {isMacOS && (
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
                                <Button
                                variant="outline"
                                className="w-[260px] text-sm justify-start"
                                onClick={() => handlePermissionButton(PermissionDevices.MICROPHONE)}
                                disabled={settings.disableAudio}
                                >
                                <Lock className="h-4 w-4 mr-2" />
                                grant audio permission
                                </Button>
                            </div>
                            )}
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
                            {isMacOS && (
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
                                <Button
                                    variant="outline"
                                    className="w-[260px] text-sm justify-start"
                                    onClick={() => handlePermissionButton(PermissionDevices.ACCESSIBILITY)}
                                >
                                    <Lock className="h-4 w-4 mr-2" />
                                    grant accessibility permission
                                </Button>
                                </div>
                            )}
                            </div>
                        )}
                    </div>

                    <Separator className="my-12" />
                    <DevModeSettings localDataDir={localDataDir} />
                </div>
            </DialogContent>
        </Dialog>
    )
}