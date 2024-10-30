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
    console.log("Attempting to register shortcuts:", {
      show: config.show_screenpipe_shortcut,
      record: config.toggle_recording_shortcut
    });
    
    // First unregister existing shortcuts
    try {
      await invoke("unregister_all_shortcuts");
      console.log("Successfully unregistered existing shortcuts");
    } catch (error) {
      if (error instanceof Error && !error.message.includes("not found")) {
        console.warn("Failed to unregister shortcuts:", error);
      }
    }
    
    // Validate shortcuts
    if (!config.show_screenpipe_shortcut || !config.toggle_recording_shortcut) {
      console.error("Invalid shortcut configuration:", config);
      throw new Error("Invalid shortcut configuration");
    }

    // Register new shortcuts
    await invoke("register_shortcuts", {
      show_screenpipe_shortcut: config.show_screenpipe_shortcut,
      toggle_recording_shortcut: config.toggle_recording_shortcut,
    });

    console.log("Successfully registered new shortcuts:", {
      show: config.show_screenpipe_shortcut,
      record: config.toggle_recording_shortcut
    });
  } catch (error) {
    console.error("Failed to register shortcuts. Error:", error);
    throw error;
  } finally {
    isRegistering = false;
  }
}
