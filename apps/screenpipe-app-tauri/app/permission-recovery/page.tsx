"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Monitor, Mic, Keyboard, Check, AlertTriangle, RefreshCw, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { commands, type OSPermission } from "@/lib/utils/tauri";
import { motion, AnimatePresence } from "framer-motion";
import { usePlatform } from "@/lib/hooks/use-platform";
import posthog from "posthog-js";


interface PermissionRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  status: "granted" | "denied" | "checking";
  onFix: () => void;
  isAnyFixing: boolean;
}

function PermissionRow({ icon, label, description, status, onFix, isAnyFixing }: Omit<PermissionRowProps, 'onReset' | 'isFixing'>) {
  return (
    <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-card">
      <div className="flex items-center space-x-3">
        <div className="text-muted-foreground">{icon}</div>
        <div>
          <span className="font-mono text-sm block">{label}</span>
          <span className="font-mono text-xs text-muted-foreground">{description}</span>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {status === "checking" ? (
          <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : status === "granted" ? (
          <div className="flex items-center space-x-1 text-green-500">
            <Check className="w-4 h-4" strokeWidth={2} />
            <span className="font-mono text-xs">ok</span>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onFix}
            disabled={isAnyFixing}
            className="font-mono text-xs"
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            open settings
          </Button>
        )}
      </div>
    </div>
  );
}

export default function PermissionRecoveryPage() {
  const [permissions, setPermissions] = useState<Record<string, string> | null>(null);

  const { isMac: isMacOS } = usePlatform();

  // Check permissions
  const checkPermissions = useCallback(async () => {
    try {
      const perms = await commands.doPermissionsCheck(false);
      setPermissions(perms);
      return perms;
    } catch (error) {
      console.error("Failed to check permissions:", error);
      return null;
    }
  }, []);

  // Initial check and polling
  useEffect(() => {
    checkPermissions();

    // Poll every 500ms while window is open
    const interval = setInterval(checkPermissions, 500);
    return () => clearInterval(interval);
  }, [checkPermissions]);

  // Track when permission is fixed
  useEffect(() => {
    if (!permissions) return;

    const screenOk = permissions.screenRecording === "granted" || permissions.screenRecording === "notNeeded";
    const micOk = permissions.microphone === "granted" || permissions.microphone === "notNeeded";
    const accessibilityOk = permissions.accessibility === "granted" || permissions.accessibility === "notNeeded";

    // Close window and restart screenpipe if all critical permissions are granted
    if (screenOk && micOk) {
      // Wait a moment to show success state, then restart screenpipe
      setTimeout(async () => {
        try {
          // Restart screenpipe to resume recording
          console.log("Permissions fixed, restarting screenpipe...");
          await commands.stopScreenpipe();
          await commands.spawnScreenpipe(null);
          console.log("Screenpipe restarted successfully");

          // Close the modal
          await commands.closeWindow("PermissionRecovery");
        } catch (error) {
          console.error("Failed to restart screenpipe:", error);
          // Still close the modal even if restart fails
          try {
            await commands.closeWindow("PermissionRecovery");
          } catch (e) {
            console.error("Failed to close window:", e);
          }
        }
      }, 1500);
    }
  }, [permissions]);

  // Open system settings for a permission
  const openSettings = async (permission: OSPermission) => {
    posthog.capture("permission_recovery_manual_fix", { permission });
    try {
      await commands.openPermissionSettings(permission);
    } catch (error) {
      console.error("Failed to open settings:", error);
    }
  };

  // Close the window
  const closeWindow = async () => {
    try {
      await commands.closeWindow("PermissionRecovery");
    } catch (error) {
      console.error("Failed to close window:", error);
    }
  };

  const screenStatus = permissions?.screenRecording === "granted" || permissions?.screenRecording === "notNeeded"
    ? "granted"
    : permissions === null ? "checking" : "denied";
  const micStatus = permissions?.microphone === "granted" || permissions?.microphone === "notNeeded"
    ? "granted"
    : permissions === null ? "checking" : "denied";
  const accessibilityStatus = permissions?.accessibility === "granted" || permissions?.accessibility === "notNeeded"
    ? "granted"
    : permissions === null ? "checking" : "denied";

  const allCriticalOk = screenStatus === "granted" && micStatus === "granted";

  return (
    <div className="flex flex-col w-full h-screen overflow-hidden bg-background">
      {/* Header with drag region and close button */}
      <div className="w-full bg-background p-4 flex items-center justify-between" data-tauri-drag-region>
        <div className="w-8" /> {/* Spacer */}
        <div className="flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500" />
          <span className="font-mono text-sm">fix permissions</span>
        </div>
        <button
          onClick={closeWindow}
          className="p-1 rounded hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
        <AnimatePresence mode="wait">
          {allCriticalOk ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <Check className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h2 className="font-mono text-lg">all fixed!</h2>
                <p className="font-mono text-xs text-muted-foreground">
                  recording will resume automatically
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="fix"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-md space-y-6"
            >
              <div className="text-center space-y-2">
                <h2 className="font-mono text-lg">recording paused</h2>
                <p className="font-mono text-xs text-muted-foreground">
                  some permissions were revoked. this can happen after macos updates.
                </p>
              </div>

              <div className="space-y-3">
                <PermissionRow
                  icon={<Monitor className="w-5 h-5" strokeWidth={1.5} />}
                  label="screen recording"
                  description="capture what's on screen"
                  status={screenStatus}
                  onFix={() => openSettings("screenRecording")}
                  isAnyFixing={false}
                />

                <PermissionRow
                  icon={<Mic className="w-5 h-5" strokeWidth={1.5} />}
                  label="microphone"
                  description="transcribe speech"
                  status={micStatus}
                  onFix={() => openSettings("microphone")}
                  isAnyFixing={false}
                />

                {isMacOS && (
                  <PermissionRow
                    icon={<Keyboard className="w-5 h-5" strokeWidth={1.5} />}
                    label="accessibility"
                    description="keyboard shortcuts"
                    status={accessibilityStatus}
                    onFix={() => openSettings("accessibility")}
                    isAnyFixing={false}
                  />
                )}
              </div>

              <div className="text-center space-y-3">
                <p className="font-mono text-xs text-muted-foreground">
                  click &quot;open settings&quot; to toggle the permission on in system settings.
                  <br />
                  this window will close automatically once permissions are fixed.
                </p>

                <button
                  onClick={closeWindow}
                  className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  remind me later
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
