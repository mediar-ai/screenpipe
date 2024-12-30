import React, { useEffect, useState } from "react";
import { Settings, Shortcut, useSettings } from "@/lib/hooks/use-settings";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { parseKeyboardShortcut } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import hotkeys from "hotkeys-js";

interface ShortcutRowProps {
  shortcut: string;
  title: string;
  description: string;
}

interface ShortcutState {
  isRecording: boolean;
  pressedKeys: string[];
}

const ShortcutSection = () => {
  const { settings, updateSettings } = useSettings();
  const {
    profiles,
    shortcuts,
    updateShortcut: updateProfileShortcut,
  } = useProfiles();

  const [shortcutStates, setShortcutStates] = useState<
    Record<string, ShortcutState>
  >(() => ({
    showScreenpipeShortcut: { isRecording: false, pressedKeys: [] },
    startRecordingShortcut: { isRecording: false, pressedKeys: [] },
    stopRecordingShortcut: { isRecording: false, pressedKeys: [] },
    ...Object.fromEntries(
      profiles.map((profile) => [
        `profile_${profile}`,
        { isRecording: false, pressedKeys: [] },
      ])
    ),
  }));

  const updateShortcut = async (shortcutId: string, keys: string) => {
    try {
      let updatedSettings = { ...settings };
      if (shortcutId.startsWith("profile_")) {
        const profileName = shortcutId.replace("profile_", "");
        updateProfileShortcut({ profile: profileName, shortcut: keys });
      } else {
        const updates: Partial<Settings> = {
          [shortcutId]: keys,
        };
        updatedSettings = { ...settings, ...updates };
        updateSettings(updates);
      }

      // wait 2 seconds to make sure store has synced to disk
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await invoke("update_global_shortcuts", {
        showShortcut: updatedSettings.showScreenpipeShortcut,
        startShortcut: updatedSettings.startRecordingShortcut,
        stopShortcut: updatedSettings.stopRecordingShortcut,
        profileShortcuts: shortcuts,
      });

      return true;
    } catch (error) {
      console.error("failed to update shortcut:", error);
      return false;
    }
  };

  const processKeyboardEvent = (event: KeyboardEvent, shortcutKey: string) => {
    event.preventDefault();

    const MODIFIER_KEYS = ["SUPER", "CTRL", "ALT", "SHIFT"] as const;
    const KEY_CODE_MAP: Record<number, string> = {
      91: "SUPER", // Command/Windows key
      93: "SUPER", // Right Command/Windows
      16: "SHIFT",
      17: "CTRL",
      18: "ALT",
    };

    const pressedKeys = hotkeys
      .getPressedKeyCodes()
      .map((code) => KEY_CODE_MAP[code] || String.fromCharCode(code))
      .filter((value, index, self) => self.indexOf(value) === index);

    const modifiers = pressedKeys.filter((k) =>
      MODIFIER_KEYS.includes(k as any)
    );
    const normalKeys = pressedKeys.filter(
      (k) => !MODIFIER_KEYS.includes(k as any)
    );
    const finalKeys = [...modifiers, ...normalKeys];

    setShortcutStates((prev) => ({
      ...prev,
      [shortcutKey]: {
        ...prev[shortcutKey],
        pressedKeys: finalKeys,
      },
    }));

    if (normalKeys.length > 0) {
      handleShortcutUpdate(shortcutKey, finalKeys.join("+"));
    }
  };

  useEffect(() => {
    const activeShortcut = Object.entries(shortcutStates).find(
      ([_, state]) => state.isRecording
    );
    if (!activeShortcut) return;

    hotkeys.filter = () => true;
    hotkeys("*", (event) => processKeyboardEvent(event, activeShortcut[0]));

    return () => hotkeys.unbind("*");
  }, [shortcutStates]);

  const ShortcutRow = ({ shortcut, title, description }: ShortcutRowProps) => {
    const state = shortcutStates[shortcut] || {
      isRecording: false,
      pressedKeys: [],
    };
    const currentValue = getShortcutValue(shortcut, settings, shortcuts);

    const currentKeys = state.isRecording
      ? state.pressedKeys
      : currentValue
      ? parseKeyboardShortcut(currentValue).split("+")
      : ["Unassigned"];

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
              state.isRecording && "border-primary",
              !currentValue && "text-muted-foreground"
            )}
          >
            {state.isRecording ? (
              <span className="animate-pulse">recording...</span>
            ) : (
              <span className="flex items-center justify-between gap-2">
                {currentKeys.map((key, i) => (
                  <kbd
                    key={i}
                    className={cn(
                      "px-1 rounded",
                      currentValue ? "bg-background/50" : "bg-transparent"
                    )}
                  >
                    {key}
                  </kbd>
                ))}
                <Pencil className="h-3 w-3 opacity-50" />
              </span>
            )}
          </button>

          <Switch
            checked={!!currentValue}
            disabled={typeof currentValue === "undefined"}
            onCheckedChange={async (checked) => {
              if (!checked) {
                handleShortcutUpdate(shortcut, "", true);
              }
            }}
          />
        </div>
      </div>
    );
  };

  const handleShortcutUpdate = async (
    shortcut: string,
    keys: string,
    disable?: boolean
  ) => {
    const success = await updateShortcut(shortcut, keys);
    if (!success) {
      toast({
        title: "error updating shortcut",
        description:
          "failed to register shortcut. please try a different combination.",
        variant: "destructive",
      });
      return;
    }

    if (disable) {
      updateSettings({
        disabledShortcuts: [
          ...settings.disabledShortcuts,
          shortcut as Shortcut,
        ],
      });
      toast({
        title: "shortcut disabled",
        description: `${shortcut.replace(/_/g, " ")} disabled`,
      });
      return;
    }

    toast({
      title: "shortcut updated",
      description: `${shortcut.replace(
        /_/g,
        " "
      )} set to: ${parseKeyboardShortcut(keys)}`,
    });

    // Reset recording state
    setShortcutStates((prev) => ({
      ...prev,
      [shortcut]: { isRecording: false, pressedKeys: [] },
    }));
  };

  // Helper to get shortcut value
  const getShortcutValue = (
    shortcut: string,
    settings: Settings,
    profileShortcuts: Record<string, string>
  ): string | undefined => {
    if (shortcut.startsWith("profile_")) {
      const profileName = shortcut.replace("profile_", "");
      return profileShortcuts[profileName];
    }
    return settings[shortcut as keyof Settings] as string;
  };

  return (
    <div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold">shortcuts</h1>

      <div className="space-y-6">
        <ShortcutRow
          shortcut={"showScreenpipeShortcut"}
          title="toggle screenpipe overlay"
          description="global shortcut to show/hide the main interface"
        />

        <ShortcutRow
          shortcut={"startRecordingShortcut"}
          title="start recording"
          description="global shortcut to start screen recording"
        />

        <ShortcutRow
          shortcut={"stopRecordingShortcut"}
          title="stop recording"
          description="global shortcut to stop screen recording"
        />

        {profiles.length > 1 && (
          <>
            <div className="mt-8 mb-4">
              <h2 className="text-lg font-semibold">profile shortcuts</h2>
              <p className="text-sm text-muted-foreground">
                assign shortcuts to quickly switch between profiles
              </p>
            </div>

            {profiles.map((profile) => (
              <ShortcutRow
                key={profile}
                shortcut={`profile_${profile}`}
                title={`switch to ${profile}`}
                description={`activate ${profile} profile`}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default ShortcutSection;
