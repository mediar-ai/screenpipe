"use client";

import { Settings } from "@/components/settings";
import { getStore, useSettings } from "@/lib/hooks/use-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import React, { useEffect } from "react";
import NotificationHandler from "@/components/notification-handler";
import Header from "@/components/header";
import { usePostHog } from "posthog-js/react";
import { useToast } from "@/components/ui/use-toast";
import Onboarding from "@/components/onboarding";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { registerShortcuts } from "@/lib/shortcuts";
import { ChangelogDialog } from "@/components/changelog-dialog";
import { BreakingChangesInstructionsDialog } from "@/components/breaking-changes-instructions-dialog";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { platform } from "@tauri-apps/plugin-os";
import PipeStore from "@/components/pipe-store";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { relaunch } from "@tauri-apps/plugin-process";
import { PipeApi } from "@/lib/api";

export default function Home() {
  const { settings } = useSettings();
  const { setActiveProfile } = useProfiles();
  const posthog = usePostHog();
  const { toast } = useToast();
  const { showOnboarding, setShowOnboarding } = useOnboarding();
  const isProcessingRef = React.useRef(false);

  useEffect(() => {
    const getAudioDevices = async () => {
      const store = await getStore();
      const devices = (await store.get("audioDevices")) as string[];
      return devices;
    };

    const unlisten = Promise.all([
      listen("shortcut-start-recording", async () => {
        await invoke("spawn_screenpipe");

        toast({
          title: "recording started",
          description: "screen recording has been initiated",
        });
      }),

      listen("shortcut-stop-recording", async () => {
        await invoke("kill_all_sreenpipes");

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

        await invoke("kill_all_sreenpipes");

        await new Promise((resolve) => setTimeout(resolve, 1000));

        await invoke("spawn_screenpipe");

        await new Promise((resolve) => setTimeout(resolve, 1000));
        relaunch();
      }),

      listen<string>("open-pipe", async (event) => {
        const pipeId = event.payload;

        const pipeApi = new PipeApi();
        const pipeList = await pipeApi.listPipes();
        const pipe = pipeList.find((p) => p.id === pipeId);
        if (pipe) {
          await invoke("open_pipe_window", {
            port: pipe.port,
            title: pipe.id,
          });
        }
      }),

      listen("shortcut-start-audio", async () => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;
        try {
          const devices = await getAudioDevices();
          const pipeApi = new PipeApi();
          console.log("audio-devices", devices);
          await Promise.all(devices.map(device => pipeApi.startAudio(device)));
          toast({
            title: "audio started",
            description: "audio has been started",
          });
        } catch (error) {
          console.error("error starting audio:", error);
          toast({
            title: "error starting audio",
            description: error instanceof Error ? error.message : "unknown error occurred",
            variant: "destructive",
          });
        } finally {
          isProcessingRef.current = false;
        }
      }),

      listen("shortcut-stop-audio", async (event) => {
        try {
          const devices = await getAudioDevices();
          const pipeApi = new PipeApi();
          devices.forEach((device) => {
            pipeApi.stopAudio(device);
          });
          toast({
            title: "audio stopped",
            description: "audio has been stopped",
          });
        } catch (error) {
          console.error("error stopping audio:", error);
          toast({
            title: "error stopping audio", 
            description: error instanceof Error ? error.message : "unknown error occurred",
            variant: "destructive",
          });
        }
      }),
    ]);

    return () => {
      unlisten.then((listeners) => {
        listeners.forEach((unlistenFn) => unlistenFn());
      });
    };
  }, []);

  useEffect(() => {
    if (settings.userId) {
      posthog?.identify(settings.userId, {
        os: platform(),
      });
    }
  }, [settings.userId, posthog]);

  return (
    <div className="flex flex-col items-center flex-1">
      <NotificationHandler />
      {showOnboarding && <Onboarding />}
      <ChangelogDialog />
      <BreakingChangesInstructionsDialog />
      <Header />
      <div className="h-[32px]" />
      <div className=" w-[90%]">
        <PipeStore />
      </div>
    </div>
  );
}
