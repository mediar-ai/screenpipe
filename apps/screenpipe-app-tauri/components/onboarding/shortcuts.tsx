import React, { useState, useEffect } from "react";
import { cn, parseKeyboardShortcut } from "@/lib/utils";
import { CommandShortcut } from "@/components/ui/command";
import { useSettings } from "@/lib/hooks/use-settings";
import { usePlatform } from "@/lib/hooks/use-platform";
import { commands } from "@/lib/utils/tauri";
import { Switch } from "@/components/ui/switch";
import { Pencil } from "lucide-react";
import hotkeys from "hotkeys-js";
import { toast } from "@/components/ui/use-toast";

interface OnboardingShortcutsProps {
  className?: string;
  handleNextSlide: () => void;
  handlePrevSlide: () => void;
}

export default function OnboardingShortcuts({
  className,
  handleNextSlide,
  handlePrevSlide,
}: OnboardingShortcutsProps) {
  const { settings, updateSettings } = useSettings();
  const { isMac, isWindows } = usePlatform();
  const [recordingShortcut, setRecordingShortcut] = useState<string | null>(null);

  // Function to convert internal key names to platform-specific display names
  const getDisplayKey = (key: string): string => {
    if (key === "Super" || key === "SUPER") {
      if (isMac) return "Cmd";
      if (isWindows) return "Win";
      return "Super"; // fallback for Linux or unknown platforms
    }
    return key;
  };

  const shortcuts = [
    {
      id: "showScreenpipeShortcut",
      title: "Show/Hide screenpipe",
      defaultShortcut: isWindows ? "Alt+S" : "Control+Super+S",
      description: "Quickly toggle the screenpipe interface",
      value: settings.showScreenpipeShortcut,
    },
    {
      id: "startRecordingShortcut",
      title: "Start Recording",
      defaultShortcut: isWindows ? "Alt+Shift+U" : "Super+Ctrl+U",
      description: "Begin screen recording",
      value: settings.startRecordingShortcut,
    },
    {
      id: "stopRecordingShortcut",
      title: "Stop Recording",
      defaultShortcut: isWindows ? "Alt+Shift+X" : "Super+Ctrl+X",
      description: "End screen recording",
      value: settings.stopRecordingShortcut,
    },
  ];

  useEffect(() => {
    if (!recordingShortcut) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();

      const MODIFIER_KEYS = ["SUPER", "CTRL", "ALT", "SHIFT"] as const;
      const KEY_CODE_MAP: Record<number, string> = {
        224: "SUPER", // Meta key on macOS
        91: "SUPER",  // Left Windows key
        92: "SUPER",  // Right Windows key
        93: "SUPER",  // Context menu key
        16: "SHIFT",
        17: "CTRL",
        18: "ALT",
      };

      const pressedKeys = hotkeys
        .getPressedKeyCodes()
        .map((code) => {
          // Special handling for Shift key
          if (code === 16) {
            return "SHIFT";
          }
          return KEY_CODE_MAP[code] || String.fromCharCode(code).toUpperCase();
        })
        .filter((value, index, self) => self.indexOf(value) === index);

      const modifiers = pressedKeys.filter((k) =>
        MODIFIER_KEYS.includes(k as any)
      );
      const normalKeys = pressedKeys.filter(
        (k) => !MODIFIER_KEYS.includes(k as any)
      );
      const finalKeys = [...modifiers, ...normalKeys];

      if (normalKeys.length > 0) {
        handleEnableShortcut(recordingShortcut, finalKeys.join("+"));
        setRecordingShortcut(null);
      }
    };

    hotkeys.filter = () => true;
    hotkeys("*", handleKeyDown);

    return () => {
      setRecordingShortcut(null);
      hotkeys.unbind("*");
      hotkeys.filter = (event) => {
        const target = (event.target || event.srcElement) as any;
        return !(
          target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA"
        );
      };
    };
  }, [recordingShortcut]);

  const handleEnableShortcut = async (shortcutId: string, keys: string) => {
    try {
      // Convert keys to display format for toast
      const displayKeys = keys.split("+").map(getDisplayKey).join("+");
      toast({
        title: "Shortcut updated",
        description: `${shortcutId.replace(/_/g, " ")} set to ${displayKeys}`,
      });

      // Update settings
      updateSettings({ [shortcutId]: keys });

      // Sync with backend
      await commands.updateGlobalShortcuts(
        settings.showScreenpipeShortcut,
        settings.startRecordingShortcut,
        settings.stopRecordingShortcut,
        settings.startAudioShortcut,
        settings.stopAudioShortcut,
        {}
      );
    } catch (error) {
      console.error("Error updating shortcut:", error);
      toast({
        title: "Error updating shortcut",
        description: "Failed to register shortcut. Please try a different combination.",
        variant: "destructive",
      });
    }
  };

  const handleDisableShortcut = async (shortcutId: string) => {
    try {
      toast({
        title: "Shortcut disabled",
        description: `${shortcutId.replace(/_/g, " ")} disabled`,
      });

      updateSettings({
        disabledShortcuts: Array.from(
          new Set([...settings.disabledShortcuts, shortcutId])
        ),
      });

      await commands.updateGlobalShortcuts(
        settings.showScreenpipeShortcut,
        settings.startRecordingShortcut,
        settings.stopRecordingShortcut,
        settings.startAudioShortcut,
        settings.stopAudioShortcut,
        {}
      );
    } catch (error) {
      console.error("Error disabling shortcut:", error);
      toast({
        title: "Error disabling shortcut",
        description: "Failed to disable shortcut. Please try again.",
        variant: "destructive",
      });
    }
  };

  const isValueEmpty = (v: string | undefined): boolean =>
    !v || v.trim() === "";

  const getShortcutState = (shortcutId: string): "enabled" | "disabled" | "unassigned" => {
    if (isValueEmpty(settings[shortcutId as keyof typeof settings] as string)) {
      return "unassigned";
    }
    return settings.disabledShortcuts.includes(shortcutId)
      ? "disabled"
      : "enabled";
  };

  return (
    <div className={cn("space-y-8", className)}>
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Keyboard Shortcuts
        </h1>
        <p className="text-muted-foreground text-lg">
          Customize your keyboard shortcuts to boost your productivity
        </p>
      </div>

      <div className="space-y-6">
        {shortcuts.map((shortcut) => {
          const currentKeys = isValueEmpty(shortcut.value)
            ? ["Unassigned"]
            : shortcut.value.split("+");

          return (
            <div key={shortcut.id} className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="font-medium">{shortcut.title}</h4>
                <p className="text-sm text-muted-foreground">
                  {shortcut.description}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setRecordingShortcut(shortcut.id)}
                  className={cn(
                    "relative min-w-[140px] rounded-md border px-3 py-2 text-sm",
                    "bg-muted/50 hover:bg-muted/70 transition-colors",
                    "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring",
                    recordingShortcut === shortcut.id && "border-primary",
                    !shortcut.value && "text-muted-foreground"
                  )}
                >
                  {recordingShortcut === shortcut.id ? (
                    <span className="animate-pulse">recording...</span>
                  ) : (
                    <span className="flex items-center justify-between gap-2">
                        <kbd
                          className={cn(
                            "px-1 rounded",
                            shortcut.value ? "bg-background/50" : "bg-transparent"
                          )}
                        >
                        {parseKeyboardShortcut(shortcut.value || "")} 
                        </kbd>
                      <Pencil className="h-3 w-3 opacity-50" />
                    </span>
                  )}
                </button>

                <Switch
                  checked={getShortcutState(shortcut.id) === "enabled"}
                  disabled={getShortcutState(shortcut.id) === "unassigned"}
                  onCheckedChange={async (checked) => {
                    if (checked && shortcut.value) {
                      await handleEnableShortcut(shortcut.id, shortcut.value);
                    } else {
                      await handleDisableShortcut(shortcut.id);
                    }
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between pt-6">
        <button
          onClick={handlePrevSlide}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleNextSlide}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
} 