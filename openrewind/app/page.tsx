"use client";

import { getStore, useSettings } from "@/lib/hooks/use-settings";

import React, { useEffect, useState, useRef } from "react";
import NotificationHandler from "@/components/notification-handler";
import Header from "@/components/header";
import { useToast } from "@/components/ui/use-toast";
import Onboarding from "@/components/onboarding";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { ChangelogDialog } from "@/components/changelog-dialog";
import { BreakingChangesInstructionsDialog } from "@/components/breaking-changes-instructions-dialog";
import { useChangelogDialog } from "@/lib/hooks/use-changelog-dialog";
import { useStatusDialog } from "@/lib/hooks/use-status-dialog";
import { useSettingsDialog } from "@/lib/hooks/use-settings-dialog";
import { useHealthCheck } from "@/lib/hooks/use-health-check";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { relaunch } from "@tauri-apps/plugin-process";
import { PipeApi } from "@/lib/api";
import localforage from "localforage";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { LoginDialog } from "../components/login-dialog";
import { ModelDownloadTracker } from "../components/model-download-tracker";
import Timeline from "@/components/rewind/timeline";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, AlertTriangle, Settings } from "lucide-react";
import { PermissionButtons } from "@/components/status/permission-buttons";
import { usePlatform } from "@/lib/hooks/use-platform";
import SplashScreen from "@/components/splash-screen";

export default function Home() {
  const { settings, updateSettings, loadUser, reloadStore, isSettingsLoaded, loadingError } = useSettings();
  const { setActiveProfile } = useProfiles();
  const { toast } = useToast();
  const { showOnboarding, setShowOnboarding, initialized } = useOnboarding();
  const { setShowChangelogDialog } = useChangelogDialog();
  const { open: openStatusDialog } = useStatusDialog();
  const { setIsOpen: setSettingsOpen } = useSettingsDialog();
  const { isServerDown } = useHealthCheck();
  const { isMac } = usePlatform();
  const [isRestarting, setIsRestarting] = useState(false);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (settings.user?.token) {
      loadUser(settings.user.token);
    }
  }, [settings.user.token]);

  useEffect(() => {
    const getAudioDevices = async () => {
      const store = await getStore();
      const devices = (await store.get("audioDevices")) as string[];
      return devices;
    };

    const setupDeepLink = async () => {
      const unsubscribeDeepLink = await onOpenUrl(async (urls) => {
        console.log("received deep link urls:", urls);
        for (const url of urls) {
          const parsedUrl = new URL(url);

          // Handle API key auth
          if (url.includes("api_key=")) {
            const apiKey = parsedUrl.searchParams.get("api_key");
            if (apiKey) {
              updateSettings({ user: { token: apiKey } });
              toast({
                title: "logged in!",
                description: "you have been logged in",
              });
            }
          }

          if (url.includes("settings")) {
            setSettingsOpen(true);
          }

          if (url.includes("changelog")) {
            setShowChangelogDialog(true);
          }

          if (url.includes("onboarding")) {
            setShowOnboarding(true);
          }

          if (url.includes("status")) {
            openStatusDialog();
          }
        }
      });
      return unsubscribeDeepLink;
    };

    let deepLinkUnsubscribe: (() => void) | undefined;

    setupDeepLink().then((unsubscribe) => {
      deepLinkUnsubscribe = unsubscribe;
    });

    const unlisten = Promise.all([
      listen("shortcut-start-recording", async () => {
        await invoke("spawn_screenpipe");

        toast({
          title: "recording started",
          description: "screen recording has been initiated",
        });
      }),

      listen("shortcut-stop-recording", async () => {
        await invoke("stop_screenpipe");

        toast({
          title: "recording stopped",
          description: "screen recording has been stopped",
        });
      }),

      listen<string>("switch-profile", async (event) => {
        const profile = event.payload;
        setActiveProfile(profile);

        toast({
          title: "profile switched",
          description: `switched to ${profile} profile, restarting screenpipe now`,
        });

        await invoke("stop_screenpipe");

        await new Promise((resolve) => setTimeout(resolve, 1000));

        await invoke("spawn_screenpipe");

        await new Promise((resolve) => setTimeout(resolve, 1000));
        relaunch();
      })
    ]);

    return () => {
      if (deepLinkUnsubscribe) {
        deepLinkUnsubscribe();
      }
      unlisten.then((unsubscribes) => {
        unsubscribes.forEach((unsubscribe) => unsubscribe());
      });
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
        setShowOnboarding(true);
      }
    };

    // Only check after onboarding is initialized
    if (initialized) {
      checkScreenPermissionRestart();
    }
  }, [setShowOnboarding, initialized]);

  useEffect(() => {
    const unlisten = listen("cli-login", async (event) => {
      console.log("received cli-login event:", event);
      await reloadStore();
    });

    return () => {
      unlisten.then((unlistenFn) => unlistenFn());
    };
  }, []);

  const handleRestartServer = async () => {
    setIsRestarting(true);
    try {
      toast({
        title: "restarting server",
        description: "stopping screenpipe server...",
        duration: 3000,
      });

      // Stop the server first
      await invoke("stop_screenpipe");
      
      // Wait for proper cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast({
        title: "restarting server",
        description: "starting screenpipe server...",
        duration: 3000,
      });

      // Start the server
      await invoke("spawn_screenpipe");
      
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
      <LoginDialog />
      <ModelDownloadTracker />
      <NotificationHandler />
      {/* Only render content after both onboarding and settings are initialized */}
      {initialized && isSettingsLoaded ? (
        <>
          {showOnboarding ? (
            <Onboarding />
          ) : (
            <>
              <ChangelogDialog />
              {/* <BreakingChangesInstructionsDialog /> */}
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
          )}
        </>
      ) : (
        <SplashScreen />
      )}
    </div>
  );
}
