import { check } from "@tauri-apps/plugin-updater";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import { platform, arch } from "@tauri-apps/plugin-os";
import type { UpdateChannel } from "@/lib/hooks/use-settings";

// Primary: proxy through screenpi.pe (we control it, can add auth later)
// Fallback: direct CN (safety net if proxy is down)
const UPDATE_ENDPOINTS = {
  stable: [
    "https://screenpi.pe/api/app-update/stable",
    "https://cdn.crabnebula.app/update/mediar/screenpipe",
  ],
  beta: [
    "https://screenpi.pe/api/app-update/beta",
    "https://cdn.crabnebula.app/update/mediar/screenpipe-beta",
  ],
} as const;

export async function checkForAppUpdates({
  toast,
  channel = "stable"
}: {
  toast: any;
  channel?: UpdateChannel;
}) {
  const os = platform();
  const cpuArch = arch();

  // Show immediate feedback — user clicked "check for updates"
  const checkingToastId = toast({
    title: "checking for updates...",
    description: `checking ${channel} channel`,
    duration: Infinity,
  });

  // Build endpoint URLs for the selected channel (proxy primary, CN fallback)
  const baseEndpoints = UPDATE_ENDPOINTS[channel];
  const target = os === "macos" ? "darwin" : os;
  const endpoints = baseEndpoints.map(
    (base) => `${base}/${target}-${cpuArch}/{{current_version}}`
  );

  let update;
  try {
    // @ts-ignore - endpoints option may not be in type definitions but is supported
    update = await check({
      endpoints,
    } as any);
  } catch (error) {
    toast({
      id: checkingToastId,
      title: "update check failed",
      description: String(error),
      variant: "destructive",
      duration: 5000,
    });
    return null;
  }

  if (!update?.available) {
    toast({
      id: checkingToastId,
      title: "you're up to date",
      description: "no new updates available",
      duration: 3000,
    });
    return update;
  }

  // Dismiss checking toast
  toast({
    id: checkingToastId,
    title: `update v${update.version} found`,
    description: "preparing to download...",
    duration: 2000,
  });

  const channelLabel = channel === "beta" ? " (Beta)" : "";
  const yes = await ask(
    `
Update to ${update.version}${channelLabel} is available!
Release notes: ${update.body}
    `,
    {
      title: "Update Now!",
      kind: "info",
      okLabel: "Update",
      cancelLabel: "Cancel",
    }
  );

  if (yes) {
    // on windows only - TODO shouldnt be necessary
    if (os === "windows") {
      await invoke("stop_screenpipe");
    }

    const toastId = toast({
      title: "downloading update...",
      description: `downloading v${update.version}`,
      duration: Infinity,
    });

    try {
      // Back up current app bundle before replacing it (for rollback)
      try {
        await invoke("backup_current_app");
      } catch (_) {
        // Non-fatal — proceed with update even if backup fails
        console.warn("rollback backup failed, continuing with update");
      }
      await update.downloadAndInstall((event: any) => {
        if (event?.event === "progress") {
          const pct = event.data?.contentLength
            ? Math.round((event.data.chunkLength / event.data.contentLength) * 100)
            : 0;
          toast({
            id: toastId,
            title: "downloading update...",
            description: `${pct}% downloaded`,
            duration: Infinity,
          });
        }
      });
      toast({
        id: toastId,
        title: "update complete",
        description: "relaunching application",
        duration: 3000,
      });
      await relaunch();
    } catch (error) {
      toast({
        id: toastId,
        title: "update failed",
        description: "an error occurred during the update",
        variant: "destructive",
        duration: 5000,
      });
    }
  }

  return update;
}
