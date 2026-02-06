"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Monitor, Mic, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { commands } from "@/lib/utils/tauri";
import { usePlatform } from "@/lib/hooks/use-platform";
import { listen } from "@tauri-apps/api/event";

interface PermissionState {
  screenOk: boolean;
  micOk: boolean;
}

/**
 * Persistent inline banner shown at the top of the main UI when permissions are missing.
 * Cannot be permanently dismissed — only goes away when permissions are granted.
 */
export function PermissionBanner() {
  const [permissions, setPermissions] = useState<PermissionState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { isMac } = usePlatform();

  const checkPermissions = useCallback(async () => {
    if (!isMac) return;
    try {
      const perms = await commands.doPermissionsCheck(false);
      const screenOk = perms.screenRecording === "granted" || perms.screenRecording === "notNeeded";
      const micOk = perms.microphone === "granted" || perms.microphone === "notNeeded";
      setPermissions({ screenOk, micOk });
      // Auto-undismiss when permissions change (user might have fixed one but not both)
      if (!screenOk || !micOk) {
        setDismissed(false);
      }
    } catch {
      // ignore errors
    }
  }, [isMac]);

  // Check on mount and poll every 5 seconds
  useEffect(() => {
    checkPermissions();
    const interval = setInterval(checkPermissions, 5000);
    return () => clearInterval(interval);
  }, [checkPermissions]);

  // Also listen for permission-lost events for instant response
  useEffect(() => {
    const unlisten = listen("permission-lost", () => {
      setDismissed(false);
      checkPermissions();
    });
    return () => { unlisten.then(fn => fn()); };
  }, [checkPermissions]);

  // Don't render on non-Mac or while loading
  if (!isMac || !permissions) return null;

  // Don't render if all permissions are granted
  if (permissions.screenOk && permissions.micOk) return null;

  // Allow temporary dismiss (5 minutes), then show again
  if (dismissed) return null;

  const missingPerms: string[] = [];
  if (!permissions.screenOk) missingPerms.push("screen recording");
  if (!permissions.micOk) missingPerms.push("microphone");

  return (
    <div className="w-full bg-destructive/10 border-b border-destructive/20 px-4 py-2.5 flex items-center justify-between gap-3 z-50">
      <div className="flex items-center gap-3 min-w-0">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="font-medium text-destructive">
            {missingPerms.join(" & ")} disabled
          </span>
          <span className="text-destructive/70 hidden sm:inline">
            — recording is paused
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs border-destructive/30 hover:bg-destructive/10"
          onClick={async () => {
            try {
              await commands.showWindow("PermissionRecovery");
            } catch {
              // fallback: try requesting directly
              if (!permissions.screenOk) await commands.requestPermission("screenRecording");
              else if (!permissions.micOk) await commands.requestPermission("microphone");
            }
          }}
        >
          fix permissions
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded hover:bg-destructive/10 transition-colors"
          title="Dismiss for now (will reappear)"
        >
          <X className="h-3.5 w-3.5 text-destructive/50" />
        </button>
      </div>
    </div>
  );
}
