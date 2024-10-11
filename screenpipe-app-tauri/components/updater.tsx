import { check } from "@tauri-apps/plugin-updater";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { Notification } from "@tauri-apps/plugin-notification"; 

export async function checkForAppUpdates({ toast }: { toast: any }) {
  const update = await check();

  if (update?.available) {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        new Notification("Update Available", {
          body: `Update to version ${update.version} is available!`,
        }).show();
      }
    });
    
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
      // on windows only - TODO shouldnt be necessary
      const os = platform();
      if (os === "windows") {
        await invoke("kill_all_sreenpipes");
      }

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
