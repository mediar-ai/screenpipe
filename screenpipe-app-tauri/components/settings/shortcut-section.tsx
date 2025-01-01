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
  type: "global" | "profile" | "pipe";
  onUpdate: (keys: string) => Promise<void>;
  value?: string;
}

const ShortcutSection = () => {
  const [pipes, setPipes] = useState<{ id: string; source: string }[]>([]);
  const { settings } = useSettings();
  const {
    profiles,
    shortcuts: profileShortcuts,
    updateShortcut: updateProfileShortcut,
  } = useProfiles();

  const syncShortcuts = async () => {
    // Wait for store to sync
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await invoke("update_global_shortcuts", {
      showShortcut: settings.showScreenpipeShortcut,
      startShortcut: settings.startRecordingShortcut,
      stopShortcut: settings.stopRecordingShortcut,
      profileShortcuts: profileShortcuts,
      pipeShortcuts: settings.pipeShortcuts,
    });

    return true;
  };

  useEffect(() => {
    const loadPipes = async () => {
      try {
        const pipeApi = new PipeApi();
        const pipeList = await pipeApi.listPipes();
        setPipes(pipeList.map((p) => ({ id: p.id, source: p.source })));
      } catch (error) {
        console.error("failed to load pipes:", error);
      }
    };
    loadPipes();
  }, []);

  const ShortcutRow = ({
    shortcut,
    title,
    description,
    type,
    value,
  }: Omit<ShortcutRowProps, "onUpdate">) => {
    const [isRecording, setIsRecording] = useState(false);
    const { settings, updateSettings } = useSettings();

    useEffect(() => {
      if (!isRecording) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        event.preventDefault();

        const MODIFIER_KEYS = ["SUPER", "CTRL", "ALT", "SHIFT"] as const;
        const KEY_CODE_MAP: Record<number, string> = {
          91: "SUPER",
          93: "SUPER",
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
          handleEnableShortcut(finalKeys.join("+"));
          setIsRecording(false);
        }
      };

      hotkeys.filter = () => true;
      hotkeys("*", handleKeyDown);

      return () => hotkeys.unbind("*");
    }, [isRecording]);

    const handleEnableShortcut = async (keys: string) => {
      try {
        switch (type) {
          case "global":
            updateSettings({ [shortcut]: keys });
            break;
          case "profile":
            updateProfileShortcut({
              profile: shortcut.replace("profile_", ""),
              shortcut: keys,
            });
            break;
          case "pipe":
            updateSettings({
              pipeShortcuts: {
                ...settings.pipeShortcuts,
                [shortcut.replace("pipe_", "")]: keys,
              },
            });
            break;
        }

        // Remove from disabled shortcuts if it exists
        updateSettings({
          disabledShortcuts: settings.disabledShortcuts.filter(
            (s) => s !== shortcut
          ),
        });

        await syncShortcuts();
      } catch (error) {
        toast({
          title: "error updating shortcut",
          description:
            "failed to register shortcut. please try a different combination.",
          variant: "destructive",
        });
      }
    };

    const handleDisableShortcut = async () => {
      updateSettings({
        disabledShortcuts: Array.from(
          new Set([...settings.disabledShortcuts, shortcut as Shortcut])
        ),
      });

      await syncShortcuts();

      toast({
        title: "shortcut disabled",
        description: `${shortcut.replace(/_/g, " ")} disabled`,
      });
    };

    const currentKeys =
      value === "" || typeof value === "undefined"
        ? ["Unassigned"]
        : parseKeyboardShortcut(value).split("+");

    const isDisabled = settings.disabledShortcuts.includes(
      shortcut as Shortcut
    );

    return (
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h4 className="font-medium">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsRecording(true)}
            className={cn(
              "relative min-w-[140px] rounded-md border px-3 py-2 text-sm",
              "bg-muted/50 hover:bg-muted/70 transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring",
              isRecording && "border-primary",
              !value && "text-muted-foreground"
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
                      value ? "bg-background/50" : "bg-transparent"
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
            checked={!isDisabled}
            onCheckedChange={async (checked) => {
              if (checked && value) {
                console.log("re-enabling shortcut", value);
                await handleEnableShortcut(value);
              } else {
                console.log("disabling shortcut", shortcut);
                await handleDisableShortcut();
              }
            }}
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
          type="global"
          shortcut="showScreenpipeShortcut"
          title="toggle screenpipe overlay"
          description="global shortcut to show/hide the main interface"
          value={settings.showScreenpipeShortcut}
        />

        <ShortcutRow
          type="global"
          shortcut="startRecordingShortcut"
          title="start recording"
          description="global shortcut to start screen recording"
          value={settings.startRecordingShortcut}
        />

        <ShortcutRow
          type="global"
          shortcut="stopRecordingShortcut"
          title="stop recording"
          description="global shortcut to stop screen recording"
          value={settings.stopRecordingShortcut}
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
                type="profile"
                shortcut={`profile_${profile}`}
                title={`switch to ${profile}`}
                description={`activate ${profile} profile`}
                value={profileShortcuts[profile]}
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
                type="pipe"
                shortcut={`pipe_${pipe.id}`}
                title={`trigger ${pipe.id} pipe`}
                description={`run pipe ${pipe.id}`}
                value={settings.pipeShortcuts[pipe.id]}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default ShortcutSection;
