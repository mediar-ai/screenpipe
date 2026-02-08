"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Monitor, Mic, Keyboard, Check, AlertTriangle, RefreshCw, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { commands, type OSPermission, type OSPermissionsCheck } from "@/lib/utils/tauri";
import { motion, AnimatePresence } from "framer-motion";
import { usePlatform } from "@/lib/hooks/use-platform";
import posthog from "posthog-js";


interface PermissionRowFullProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  status: "granted" | "denied" | "checking";
  onResetAndFix: () => void;
  onOpenSettings: () => void;
  isFixing: boolean;
}

function PermissionRow({ icon, label, description, status, onResetAndFix, onOpenSettings, isFixing }: PermissionRowFullProps) {
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
          <>
            <Button
              variant="default"
              size="sm"
              onClick={onResetAndFix}
              disabled={isFixing}
              className="font-mono text-xs"
            >
              {isFixing ? (
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              reset & fix
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
              disabled={isFixing}
              className="font-mono text-xs"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              open settings
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function PermissionRecoveryPage() {
  const [permissions, setPermissions] = useState<Record<string, string> | null>(null);
  const [fixingPermission, setFixingPermission] = useState<string | null>(null);

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

  // Reset TCC entry and re-request permission (shows native dialog if possible)
  const resetAndFix = async (permission: OSPermission) => {
    posthog.capture("permission_recovery_reset_and_fix", { permission });
    setFixingPermission(permission);
    try {
      const result = await commands.resetAndRequestPermission(permission);
      if (result.status === "error") {
        console.error("Reset and request failed:", result.error);
        // Fallback: open settings directly
        await commands.openPermissionSettings(permission);
      }
    } catch (error) {
      console.error("Failed to reset and request permission:", error);
      // Fallback: open settings directly
      await commands.openPermissionSettings(permission);
    } finally {
      // Clear fixing state after a short delay to let the dialog appear
      setTimeout(() => setFixingPermission(null), 2000);
    }
  };

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
                  onResetAndFix={() => resetAndFix("screenRecording")}
                  onOpenSettings={() => openSettings("screenRecording")}
                  isFixing={fixingPermission === "screenRecording"}
                />

                <PermissionRow
                  icon={<Mic className="w-5 h-5" strokeWidth={1.5} />}
                  label="microphone"
                  description="transcribe speech"
                  status={micStatus}
                  onResetAndFix={() => resetAndFix("microphone")}
                  onOpenSettings={() => openSettings("microphone")}
                  isFixing={fixingPermission === "microphone"}
                />

                {isMacOS && (
                  <PermissionRow
                    icon={<Keyboard className="w-5 h-5" strokeWidth={1.5} />}
                    label="accessibility"
                    description="keyboard shortcuts"
                    status={accessibilityStatus}
                    onResetAndFix={() => resetAndFix("accessibility")}
                    onOpenSettings={() => openSettings("accessibility")}
                    isFixing={fixingPermission === "accessibility"}
                  />
                )}
              </div>

              <div className="text-center space-y-3">
                <p className="font-mono text-xs text-muted-foreground">
                  click &quot;reset &amp; fix&quot; to trigger the permission dialog.
                  <br />
                  if that doesn&apos;t work, use &quot;open settings&quot; to toggle it manually.
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
