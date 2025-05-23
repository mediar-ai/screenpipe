import { invoke } from "@tauri-apps/api/core";
import { Shortcut } from "./hooks/use-settings";

export async function registerShortcuts({
  showScreenpipeShortcut,
  disabledShortcuts,
}: {
  showScreenpipeShortcut: string;
  disabledShortcuts: Shortcut[];
}) {
  invoke("update_show_screenpipe_shortcut", {
    new_shortcut: showScreenpipeShortcut,
    enabled: !disabledShortcuts.includes(Shortcut.SHOW_SCREENPIPE),
  });
}
