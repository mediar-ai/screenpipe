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
import { PipeApi } from "@/lib/api";

interface ShortcutRowProps {
  shortcut: string;
  title: string;
  description: string;
}

const ShortcutSection = () => {
  const { settings, updateSettings } = useSettings();
  const {
    profiles,
    shortcuts,
    updateShortcut: updateProfileShortcut,
  } = useProfiles();

  const [pipes, setPipes] = useState<{ id: string; source: string }[]>([]);
  const pipeApi = new PipeApi();

  const [recordingShortcut, setRecordingShortcut] = useState<string | null>(
    null
  );

  useEffect(() => {
    const loadPipes = async () => {
      try {
        const pipeList = await pipeApi.listPipes();
        setPipes(pipeList.map((p) => ({ id: p.id, source: p.source })));
      } catch (error) {
        console.error("failed to load pipes:", error);
      }
    };
    loadPipes();
  }, []);

  const updateShortcut = async (shortcutId: string, keys: string) => {
    try {
      // Handle profile shortcuts
      if (shortcutId.startsWith("profile_")) {
        const profileName = shortcutId.replace("profile_", "");
        updateProfileShortcut({ profile: profileName, shortcut: keys });
        return await syncShortcuts();
      }

      // Handle pipe shortcuts
      if (shortcutId.startsWith("pipe_")) {
        const pipeId = shortcutId.replace("pipe_", "");
        console.log("new PipeShortcut", {
          ...settings.pipeShortcuts,
          [pipeId]: keys,
        });

        updateSettings({
          pipeShortcuts: {
            ...settings.pipeShortcuts,
            [pipeId]: keys,
          },
        });
        return await syncShortcuts();
      }

      // Handle global shortcuts
      updateSettings({ [shortcutId]: keys });
      return await syncShortcuts();
    } catch (error) {
      console.error("failed to update shortcut:", error);
      return false;
    }
  };

  // Helper to sync shortcuts with the backend
  const syncShortcuts = async () => {
    // Wait for store to sync
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await invoke("update_global_shortcuts", {
      showShortcut: settings.showScreenpipeShortcut,
      startShortcut: settings.startRecordingShortcut,
      stopShortcut: settings.stopRecordingShortcut,
      profileShortcuts: shortcuts,
      pipeShortcuts: settings.pipeShortcuts,
    });

    return true;
  };

  useEffect(() => {
    if (!recordingShortcut) return;

    const handleKeyDown = (event: KeyboardEvent) => {
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

      if (normalKeys.length > 0) {
        handleShortcutUpdate(recordingShortcut, finalKeys.join("+"));
        setRecordingShortcut(null);
      }
    };

    hotkeys.filter = () => true;
    hotkeys("*", handleKeyDown);

    return () => hotkeys.unbind("*");
  }, [recordingShortcut]);

  const ShortcutRow = ({ shortcut, title, description }: ShortcutRowProps) => {
    const currentValue = getShortcutValue(shortcut, settings, shortcuts);
    const currentKeys = currentValue
      ? parseKeyboardShortcut(currentValue).split("+")
      : ["Unassigned"];

    const isRecording = recordingShortcut === shortcut;

    return (
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h4 className="font-medium">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setRecordingShortcut(shortcut)}
            className={cn(
              "relative min-w-[140px] rounded-md border px-3 py-2 text-sm",
              "bg-muted/50 hover:bg-muted/70 transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring",
              isRecording && "border-primary",
              !currentValue && "text-muted-foreground"
            )}
          >
            {isRecording ? (
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
    if (shortcut.startsWith("pipe_")) {
      const pipeId = shortcut.replace("pipe_", "");
      return settings.pipeShortcuts[pipeId];
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

        {pipes.length > 0 && (
          <>
            <div className="mt-8 mb-4">
              <h2 className="text-lg font-semibold">pipe shortcuts</h2>
              <p className="text-sm text-muted-foreground">
                assign shortcuts to quickly trigger installed pipes
              </p>
            </div>

            {pipes.map((pipe) => (
              <ShortcutRow
                key={pipe.id}
                shortcut={`pipe_${pipe.id}`}
                title={`trigger ${pipe.id} pipe`}
                description={`run pipe ${pipe.id}`}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default ShortcutSection;
