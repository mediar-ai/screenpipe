import { invoke } from "@tauri-apps/api/core";

export async function registerShortcuts({
  showScreenpipeShortcut,
  toggleRecordingShortcut,
}: {
  showScreenpipeShortcut: string;
  toggleRecordingShortcut: string;
}) {
  await invoke("update_show_screenpipe_shortcut", {
    new_shortcut: showScreenpipeShortcut,
  });
  await invoke("update_recording_shortcut", {
    new_shortcut: toggleRecordingShortcut,
  });
}
