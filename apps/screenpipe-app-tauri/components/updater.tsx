import { check } from "@tauri-apps/plugin-updater";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import { platform, arch } from "@tauri-apps/plugin-os";
import type { UpdateChannel } from "@/lib/hooks/use-settings";

const UPDATE_ENDPOINTS = {
  stable: "https://cdn.crabnebula.app/update/mediar/screenpipe",
  beta: "https://cdn.crabnebula.app/update/mediar/screenpipe-beta",
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

  // Build the endpoint URL for the selected channel
  const baseEndpoint = UPDATE_ENDPOINTS[channel];
  const target = os === "macos" ? "darwin" : os;
  const endpoint = `${baseEndpoint}/${target}-${cpuArch}/{{current_version}}`;

  // @ts-ignore - endpoints option may not be in type definitions but is supported
  const update = await check({
    endpoints: [endpoint],
  } as any);

  if (update?.available) {
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
        title: "Updating...",
        description: `Downloading and installing ${channel} update`,
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
        await update.downloadAndInstall();
        toast({
          id: toastId,
          title: "Update complete",
          description: "Relaunching application",
          duration: 3000,
        });
        await relaunch();
      } catch (error) {
        toast({
          id: toastId,
          title: "Update failed",
          description: "An error occurred during the update",
          variant: "destructive",
          duration: 5000,
        });
      }
    }
  }

  return update;
}
