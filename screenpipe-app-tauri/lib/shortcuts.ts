import { invoke } from "@tauri-apps/api/core";
import { Shortcut } from "./hooks/use-settings";

export async function registerShortcuts({
  showScreenpipeShortcut,
  startRecordingShortcut,
  disabledShortcuts,
}: {
  showScreenpipeShortcut: string;
  startRecordingShortcut: string;
  disabledShortcuts: Shortcut[];
}) {
  console.log("registerShortcuts params: ", {
    showScreenpipeShortcut,
    startRecordingShortcut,
    disabledShortcuts,
    enabledShowScreenpipe: !disabledShortcuts.includes(Shortcut.SHOW_SCREENPIPE),
    enabledStartRecording: !disabledShortcuts.includes(Shortcut.START_RECORDING),
  });
  invoke("update_show_screenpipe_shortcut", {
    new_shortcut: showScreenpipeShortcut,
    enabled: !disabledShortcuts.includes(Shortcut.SHOW_SCREENPIPE),
  });

  invoke("update_start_recording_shortcut", {
    new_shortcut: startRecordingShortcut,
    enabled: !disabledShortcuts.includes(Shortcut.START_RECORDING),
  });
}
