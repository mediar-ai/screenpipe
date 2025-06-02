"use client";

import { getStore, useSettings } from "@/lib/hooks/use-settings";

import React, { useEffect, useState, useRef } from "react";
import NotificationHandler from "@/components/notification-handler";
import { useToast } from "@/components/ui/use-toast";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { ChangelogDialog } from "@/components/changelog-dialog";
import { BreakingChangesInstructionsDialog } from "@/components/breaking-changes-instructions-dialog";
import { useHealthCheck } from "@/lib/hooks/use-health-check";

import { commands } from "@/lib/utils/tauri";
import localforage from "localforage";
import { LoginDialog } from "../components/login-dialog";
import { ModelDownloadTracker } from "../components/model-download-tracker";
import Timeline from "@/components/rewind/timeline";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { RefreshCw, AlertTriangle, Settings, Mail } from "lucide-react";
import { PermissionButtons } from "@/components/status/permission-buttons";
import { usePlatform } from "@/lib/hooks/use-platform";
import SplashScreen from "@/components/splash-screen";
import { openSettingsWindow } from "@/lib/utils/window";
import HealthStatus from "@/components/screenpipe-status";
import { ShareLogsButton } from "@/components/share-logs-button";

export default function Home() {
  const { settings, updateSettings, loadUser, reloadStore, isSettingsLoaded, loadingError } = useSettings();
  const { toast } = useToast();
  const { onboardingData } = useOnboarding();
  const { isServerDown } = useHealthCheck();
  const { isMac } = usePlatform();
  const [isRestarting, setIsRestarting] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const isProcessingRef = useRef(false);

  // Load onboarding status on mount
  useEffect(() => {
    const { loadOnboardingStatus } = useOnboarding.getState();
    loadOnboardingStatus();
  }, []);

  useEffect(() => {
    const getAudioDevices = async () => {
      const store = await getStore();
      const devices = (await store.get("audioDevices")) as string[];
      return devices;
    };

    // Cleanup function placeholder if needed
    return () => {
      // Any cleanup logic can go here
    };
  }, []);

  useEffect(() => {
    const checkScreenPermissionRestart = async () => {
      const restartPending = await localforage.getItem(
        "screenPermissionRestartPending"
      );
      if (restartPending) {
        // Clear the restart pending flag
        await localforage.removeItem("screenPermissionRestartPending");
        try {
          await commands.showWindow("Onboarding");
        } catch (error) {
          console.error("Failed to show onboarding window:", error);
        }
      }
    };

    // Always call this effect, but only execute logic when onboarding data is loaded
    if (onboardingData.isCompleted !== undefined) {
      checkScreenPermissionRestart();
    }
  }, [onboardingData.isCompleted]);

  const handleRestartServer = async () => {
    setIsRestarting(true);
    try {
      toast({
        title: "restarting server",
        description: "stopping screenpipe server...",
        duration: 3000,
      });

      // Stop the server first
      await commands.stopScreenpipe();
      
      // Wait for proper cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast({
        title: "restarting server",
        description: "starting screenpipe server...",
        duration: 3000,
      });

      // Start the server
      await commands.spawnScreenpipe(null);
      
      toast({
        title: "server restarted",
        description: "screenpipe server has been restarted successfully.",
        duration: 3000,
      });
    } catch (error) {
      console.error("failed to restart server:", error);
      toast({
        title: "restart failed",
        description: "failed to restart screenpipe server. please check the logs.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsRestarting(false);
    }
  };

  return (
    <div className="flex flex-col items-center flex-1 mx-auto relative scrollbar-hide">
      {/* Transparent titlebar area */}
      <div className="h-8 bg-transparent w-full" data-tauri-drag-region>
          <div className="flex items-center justify-between gap-2">
            <div/>
            <h1 className="text-xs font-bold">OpenRewind</h1>
            <div className="flex items-center gap-2">
              <HealthStatus className="cursor-pointer" />
              <Popover open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Mail className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-100 rounded-2xl">
                  <ShareLogsButton 
                    showShareLink={false} 
                    onComplete={() => setIsFeedbackOpen(false)} 
                  />
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" onClick={() => openSettingsWindow()}>
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
      </div>
      
      <NotificationHandler />
      {/* Only render content after settings are loaded */}
      {isSettingsLoaded ? (
        <>
          <ChangelogDialog />
          <BreakingChangesInstructionsDialog />
          <LoginDialog />
          <ModelDownloadTracker />
          {!isServerDown ? (
            <div className="w-full scrollbar-hide">
              <Timeline />
            </div>
          ) : (
            <div className="flex items-center justify-center h-screen p-4">
              <div className="max-w-lg w-full space-y-6">
                {/* Header */}
                <div className="text-center space-y-4">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                      <AlertTriangle className="w-8 h-8 text-destructive" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">Server Not Active</h2>
                      <p className="text-muted-foreground mt-2">
                        The screenpipe server is not running. Start the server or check permissions to continue.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions Card */}
                <div className="bg-card border rounded-lg p-6 space-y-6">
                  {/* Server Control */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">Server Control</h3>
                        <p className="text-sm text-muted-foreground">
                          Start or restart the screenpipe server
                        </p>
                      </div>
                      <Button
                        onClick={handleRestartServer}
                        disabled={isRestarting}
                        className="flex items-center gap-2"
                      >
                        <RefreshCw className={`h-4 w-4 ${isRestarting ? 'animate-spin' : ''}`} />
                        {isRestarting ? "Starting..." : "Start Server"}
                      </Button>
                    </div>
                  </div>

                  {/* Permissions Section - Only show on Mac */}
                  {isMac && (
                    <>
                      <Separator />
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-semibold">System Permissions</h3>
                          <p className="text-sm text-muted-foreground">
                            Ensure screenpipe has the necessary permissions to function properly
                          </p>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Screen Recording</span>
                            <PermissionButtons type="screen" />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Audio Recording</span>
                            <PermissionButtons type="audio" />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Accessibility</span>
                            <PermissionButtons type="accessibility" />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <SplashScreen />
      )}
    </div>
  );
}
