"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useChangelogDialog } from "@/lib/hooks/use-changelog-dialog";
import { useStatusDialog } from "@/lib/hooks/use-status-dialog";
import { useSettings } from "@/lib/hooks/use-settings";
import { commands } from "@/lib/utils/tauri";
import { listen } from "@tauri-apps/api/event";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { openSettingsWindow } from "@/lib/utils/window";

export function DeeplinkHandler() {
  const { toast } = useToast();
  const { setShowChangelogDialog } = useChangelogDialog();
  const { open: openStatusDialog } = useStatusDialog();
  const { loadUser, reloadStore } = useSettings();

  useEffect(() => {
    const setupDeepLink = async () => {
      const unsubscribeDeepLink = await onOpenUrl(async (urls) => {
        console.log("received deep link urls:", urls);
        for (const url of urls) {
          const parsedUrl = new URL(url);

          // Handle API key auth
          if (url.includes("api_key=")) {
            const apiKey = parsedUrl.searchParams.get("api_key");
            if (apiKey) {
             try {
              await loadUser(apiKey);
              toast({
                title: "logged in!",
                description: "you have been logged in",
              });

             } catch (error) {
              console.error("failed to load user:", error);
              toast({
                title: "failed to load user",
                description: "failed to load user",
              });
             }
            }
          }

          if (url.includes("settings")) {
            await openSettingsWindow();
          }

          if (url.includes("changelog")) {
            setShowChangelogDialog(true);
          }

          if (url.includes("onboarding")) {
            try {
              await commands.showWindow("Onboarding");
            } catch (error) {
              console.error("Failed to show onboarding window:", error);
            }
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
        await commands.spawnScreenpipe(null);

        toast({
          title: "recording started",
          description: "screen recording has been initiated",
        });
      }),

      listen("shortcut-stop-recording", async () => {
        await commands.stopScreenpipe();

        toast({
          title: "recording stopped",
          description: "screen recording has been stopped",
        });
      }),

      listen("cli-login", async (event) => {
        console.log("received cli-login event:", event);
        await reloadStore();
      }),
    ]);

    return () => {
      if (deepLinkUnsubscribe) {
        deepLinkUnsubscribe();
      }
      unlisten.then((unsubscribes) => {
        unsubscribes.forEach((unsubscribe) => unsubscribe());
      });
    };
  }, [toast, setShowChangelogDialog, openStatusDialog, loadUser, reloadStore]);

  return null; // This component doesn't render anything
} 