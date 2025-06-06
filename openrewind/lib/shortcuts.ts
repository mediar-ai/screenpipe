import { commands } from "./utils/tauri";
import { Shortcut } from "./hooks/use-settings";

export async function registerShortcuts({
  showScreenpipeShortcut,
  disabledShortcuts,
}: {
  showScreenpipeShortcut: string;
  disabledShortcuts: Shortcut[];
}) {
  commands.updateShowScreenpipeShortcut(
    showScreenpipeShortcut,
    !disabledShortcuts.includes(Shortcut.SHOW_SCREENPIPE)
  );
}
