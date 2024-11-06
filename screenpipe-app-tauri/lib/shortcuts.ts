import { invoke } from "@tauri-apps/api/core";

export async function registerShortcuts({
  showScreenpipeShortcut,
}: {
  showScreenpipeShortcut: string;
}) {
  invoke("update_show_screenpipe_shortcut", {
    new_shortcut: showScreenpipeShortcut,
  });
}
