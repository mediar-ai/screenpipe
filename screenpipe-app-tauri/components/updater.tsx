import { check } from "@tauri-apps/plugin-updater";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

export async function checkForAppUpdates({ toast }: { toast: any }) {
  const update = await check();

  if (update?.available) {
    const yes = await ask(
      `
Update to ${update.version} is available!
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
      const toastId = toast({
        title: "Updating...",
        description: "Downloading and installing update",
        duration: Infinity,
      });

      try {
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
}
