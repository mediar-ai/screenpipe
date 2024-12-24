import React, { useEffect, useState } from "react";
import { Shortcut, useSettings } from "@/lib/hooks/use-settings";
import { parseKeyboardShortcut } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import hotkeys from "hotkeys-js";

interface ShortcutState {
  isRecording: boolean;
  pressedKeys: string[];
}

const ShortcutSection = () => {
  const { settings, updateSettings } = useSettings();
  const [shortcutStates, setShortcutStates] = useState<
    Record<Shortcut, ShortcutState>
  >({
    [Shortcut.SHOW_SCREENPIPE]: { isRecording: false, pressedKeys: [] },
    [Shortcut.START_RECORDING]: { isRecording: false, pressedKeys: [] },
    [Shortcut.STOP_RECORDING]: { isRecording: false, pressedKeys: [] },
  });

  const updateShortcut = async (shortcut: Shortcut, keys: string) => {
    try {
      // Update the appropriate flat key
      const updates = {
        [Shortcut.SHOW_SCREENPIPE]: { showScreenpipeShortcut: keys },
        [Shortcut.START_RECORDING]: { startRecordingShortcut: keys },
        [Shortcut.STOP_RECORDING]: { stopRecordingShortcut: keys },
      }[shortcut];

      // Update settings first
      updateSettings(updates);

      // Then update Rust backend
      await invoke("update_global_shortcuts", {
        showShortcut: settings.showScreenpipeShortcut,
        startShortcut: settings.startRecordingShortcut,
        stopShortcut: settings.stopRecordingShortcut,
      });

      return true;
    } catch (error) {
      console.error("failed to update shortcut:", error);
      return false;
    }
  };

  const toggleShortcut = async (shortcut: Shortcut, enabled: boolean) => {
    const newDisabled = enabled
      ? settings.disabledShortcuts.filter((s) => s !== shortcut)
      : [...settings.disabledShortcuts, shortcut];

    updateSettings({
      disabledShortcuts: newDisabled,
    });

    // Update Rust backend with current shortcuts
    await invoke("update_global_shortcuts", {
      showShortcut: settings.showScreenpipeShortcut,
      startShortcut: settings.startRecordingShortcut,
      stopShortcut: settings.stopRecordingShortcut,
    });
  };

  const getShortcut = (shortcut: Shortcut): string => {
    switch (shortcut) {
      case Shortcut.SHOW_SCREENPIPE:
        return settings.showScreenpipeShortcut;
      case Shortcut.START_RECORDING:
        return settings.startRecordingShortcut;
      case Shortcut.STOP_RECORDING:
        return settings.stopRecordingShortcut;
    }
  };

  const isShortcutEnabled = (shortcut: Shortcut): boolean => {
    return !settings.disabledShortcuts.includes(shortcut);
  };

  // Handle keyboard events for shortcut recording
  useEffect(() => {
    const activeShortcut = Object.entries(shortcutStates).find(
      ([_, state]) => state.isRecording
    );
    if (!activeShortcut) return;

    const [shortcutKey] = activeShortcut;

    const handleKeyPress = (event: KeyboardEvent) => {
      event.preventDefault();

      // Get pressed keys in a consistent format
      const keys = hotkeys
        .getPressedKeyCodes()
        .map((code) => {
          // Map key codes to consistent names
          switch (code) {
            case 91:
            case 93:
              return "SUPER"; // Command/Windows key
            case 16:
              return "SHIFT";
            case 17:
              return "CTRL";
            case 18:
              return "ALT";
            default:
              return String.fromCharCode(code);
          }
        })
        .filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates

      // Sort modifiers to ensure consistent order
      const modifiers = keys.filter((k) =>
        ["SUPER", "CTRL", "ALT", "SHIFT"].includes(k)
      );
      const normalKeys = keys.filter(
        (k) => !["SUPER", "CTRL", "ALT", "SHIFT"].includes(k)
      );

      const finalKeys = [...modifiers, ...normalKeys];

      // Update pressed keys display
      setShortcutStates((prev) => ({
        ...prev,
        [shortcutKey]: {
          ...prev[shortcutKey as Shortcut],
          pressedKeys: finalKeys,
        },
      }));

      // Only update if we have a non-modifier key
      if (normalKeys.length > 0) {
        handleShortcutUpdate(shortcutKey as Shortcut, finalKeys.join("+"));
      }
    };

    // Enable all keys, including special ones
    hotkeys.filter = () => true;
    hotkeys("*", handleKeyPress);

    return () => {
      hotkeys.unbind("*");
    };
  }, [shortcutStates]);

  const handleShortcutUpdate = async (shortcut: Shortcut, keys: string) => {
    const success = await updateShortcut(shortcut, keys);

    if (success) {
      toast({
        title: "shortcut updated",
        description: `${shortcut} set to: ${parseKeyboardShortcut(keys)}`,
      });
    } else {
      toast({
        title: "error updating shortcut",
        description:
          "failed to register shortcut. please try a different combination.",
        variant: "destructive",
      });
    }

    // Reset recording state
    setShortcutStates((prev) => ({
      ...prev,
      [shortcut]: { isRecording: false, pressedKeys: [] },
    }));
  };

  const ShortcutRow = ({
    shortcut,
    title,
    description,
  }: {
    shortcut: Shortcut;
    title: string;
    description: string;
  }) => {
    const state = shortcutStates[shortcut];
    const currentKeys = state.isRecording
      ? state.pressedKeys
      : parseKeyboardShortcut(getShortcut(shortcut)).split("+");

    return (
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h4 className="font-medium">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() =>
              setShortcutStates((prev) => ({
                ...prev,
                [shortcut]: { ...prev[shortcut], isRecording: true },
              }))
            }
            className={cn(
              "relative min-w-[140px] rounded-md border px-3 py-2 text-sm",
              "bg-muted/50 hover:bg-muted/70 transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring",
              state.isRecording && "border-primary"
            )}
          >
            {state.isRecording ? (
              <span className="animate-pulse">recording...</span>
            ) : (
              <span className="flex items-center justify-between gap-2">
                {currentKeys.map((key, i) => (
                  <kbd key={i} className="px-1 bg-background/50 rounded">
                    {key}
                  </kbd>
                ))}
                <Pencil className="h-3 w-3 opacity-50" />
              </span>
            )}
          </button>

          <Switch
            checked={isShortcutEnabled(shortcut)}
            onCheckedChange={(checked) => toggleShortcut(shortcut, checked)}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold">shortcuts</h1>

      <div className="space-y-6">
        <ShortcutRow
          shortcut={Shortcut.SHOW_SCREENPIPE}
          title="toggle screenpipe overlay"
          description="global shortcut to show/hide the main interface"
        />

        <ShortcutRow
          shortcut={Shortcut.START_RECORDING}
          title="start recording"
          description="global shortcut to start screen recording"
        />

        <ShortcutRow
          shortcut={Shortcut.STOP_RECORDING}
          title="stop recording"
          description="global shortcut to stop screen recording"
        />
      </div>
    </div>
  );
};

export default ShortcutSection;
