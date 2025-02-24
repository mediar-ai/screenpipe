import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Lock, Settings, X } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";
import { usePlatform } from "@/lib/hooks/use-platform";

// You can add this to a types.ts file in your lib directory
export enum OSPermissionStatus {
  NotNeeded = "notNeeded",
  Empty = "empty",
  Granted = "granted",
  Denied = "denied",
}

export interface OSPermissionsCheck {
  screenRecording: OSPermissionStatus;
  microphone: OSPermissionStatus;
  accessibility: OSPermissionStatus;
}

interface PermissionButtonsProps {
  settings: any;
  type: "screen" | "audio" | "accessibility";
}

export const PermissionButtons: React.FC<PermissionButtonsProps> = ({
  settings,
  type,
}) => {
  const [permissions, setPermissions] = useState<OSPermissionsCheck | null>(
    null
  );
  const { isMac: isMacOS } = usePlatform();

  useEffect(() => {
    const checkPermissions = async () => {
      if (isMacOS) {
        try {
          const perms = await invoke<OSPermissionsCheck>(
            "do_permissions_check",
            {
              initialCheck: true,
            }
          );
          setPermissions(perms);
        } catch (error) {
          console.error("Failed to check permissions:", error);
        }
      }
    };

    // Poll permissions every 1 second
    const intervalId = setInterval(() => {
      checkPermissions();
    }, 1000);

    // Initial check
    checkPermissions();

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [isMacOS]);

  const handlePermissionButton = async () => {
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

      // Refresh permissions after request
      const perms = await invoke<OSPermissionsCheck>("do_permissions_check", {
        initialCheck: false,
      });
      setPermissions(perms);
    } catch (error) {
      console.error(`Failed to request ${type} permission:`, error);
      toast({
        title: "error",
        description: `failed to request ${type} permission`,
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleOpenPermissionSettings = async () => {
    try {
      const permissionType =
        type === "screen"
          ? "screenRecording"
          : type === "audio"
          ? "microphone"
          : "accessibility";

      await invoke("open_permission_settings", {
        permission: permissionType,
      });
    } catch (error) {
      console.error(`failed to open ${type} permission settings:`, error);
      toast({
        title: "error",
        description: `failed to open ${type} permission settings`,
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  if (!isMacOS) return null;

  const isPermitted = (status: OSPermissionStatus) =>
    status === OSPermissionStatus.Granted ||
    status === OSPermissionStatus.NotNeeded;

  const permissionStatus =
    type === "screen"
      ? permissions?.screenRecording
      : type === "audio"
      ? permissions?.microphone
      : permissions?.accessibility;

  const isDisabled = type === "audio" && settings.disableAudio;

  return (
    <div className="flex items-center gap-2">
      {permissions && (
        <span>
          {isPermitted(permissionStatus ?? OSPermissionStatus.Empty) ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <X className="h-4 w-4 text-red-500" />
          )}
        </span>
      )}
      <Button
        variant="outline"
        className="text-sm justify-center w-[220px]"
        onClick={handlePermissionButton}
        disabled={isDisabled}
      >
        allow{" "}
        {type === "screen"
          ? "screen"
          : type === "audio"
          ? "audio"
          : "accessibility"}{" "}
        access
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleOpenPermissionSettings}
        title={`Open ${type} settings`}
        disabled={isDisabled}
      >
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
};
