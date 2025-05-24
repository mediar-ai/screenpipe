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

export default function Home() {
  const { settings, updateSettings, loadUser, reloadStore } = useSettings();
  const { setActiveProfile } = useProfiles();
  const { toast } = useToast();
  const { showOnboarding, setShowOnboarding } = useOnboarding();
  const { setShowChangelogDialog } = useChangelogDialog();
  const { open: openStatusDialog } = useStatusDialog();
  const { setIsOpen: setSettingsOpen } = useSettingsDialog();
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
        setShowOnboarding(true);
      }
    };

    checkScreenPermissionRestart();
  }, [setShowOnboarding]);

  useEffect(() => {
    const unlisten = listen("cli-login", async (event) => {
      console.log("received cli-login event:", event);
      await reloadStore();
    });

    return () => {
      unlisten.then((unlistenFn) => unlistenFn());
    };
  }, []);

  return (
    <div className="flex flex-col items-center flex-1 mx-auto relative scrollbar-hide">
      <LoginDialog />
      <ModelDownloadTracker />
      <NotificationHandler />
      {showOnboarding ? (
        <Onboarding />
      ) : (
        <>
          <ChangelogDialog />
          {/* <BreakingChangesInstructionsDialog /> */}
          <div className="w-full scrollbar-hide">
            <Timeline />
          </div>
        </>
      )}
    </div>
  );
}
