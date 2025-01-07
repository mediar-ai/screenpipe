import { Shortcut } from "./hooks/use-settings";
import { commands } from "@/types/tauri";

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
