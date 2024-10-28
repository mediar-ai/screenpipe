import { invoke } from "@tauri-apps/api/core";

interface ShortcutConfig {
  show_screenpipe_shortcut: string;
  toggle_recording_shortcut: string;
}

let isRegistering = false;

export async function registerShortcuts(config: ShortcutConfig) {
  if (isRegistering) {
    console.log("Shortcut registration already in progress, skipping...");
    return;
  }

  try {
    isRegistering = true;
    console.log("Attempting to register shortcuts with config:", config);
    
    try {
      console.log("Unregistering existing shortcuts...");
      await invoke("unregister_all_shortcuts");
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'toString' in error) {
        if (!error.toString().includes("not found")) {
          console.warn("Failed to unregister shortcuts:", error);
        }
      }
    }
    
    console.log("Registering new shortcuts...");
    await invoke("register_shortcuts", {
      show_screenpipe_shortcut: config.show_screenpipe_shortcut,
      toggle_recording_shortcut: config.toggle_recording_shortcut,
    });
    
    console.log("Successfully registered shortcuts");
  } catch (error) {
    console.error("Failed to register shortcuts. Full error:", error);
    throw error;
  } finally {
    isRegistering = false;
  }
}
