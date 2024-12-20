import React, { useEffect, useState } from "react";
import { Shortcut, useSettings } from "@/lib/hooks/use-settings";
import { parseKeyboardShortcut } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { registerShortcuts } from "@/lib/shortcuts";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";

const ShortcutSection = () => {
  const { settings, updateSettings } = useSettings();
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [nonModifierKey, setNonModifierKey] = useState<string>("");
  const [currentShortcut, setCurrentShortcut] = useState<string>(
    settings.showScreenpipeShortcut
  );

  const [disabledShortcuts, setDisabledShortcuts] = useState<Shortcut[]>(
    settings.disabledShortcuts
  );

  const [isRecording, setIsRecording] = useState(false);
  const [pressedKeys, setPressedKeys] = useState<string[]>([]);

  useEffect(() => {
    setCurrentShortcut(settings.showScreenpipeShortcut);

    const parts = settings.showScreenpipeShortcut.split("+");
    const modifiers = parts.slice(0, -1);
    const key = parts.slice(-1)[0];

    setSelectedModifiers(modifiers);
    setNonModifierKey(key);
  }, [settings.showScreenpipeShortcut]);

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();

      // Get modifiers
      const modifiers: string[] = [];
      if (e.metaKey) modifiers.push("super");
      if (e.ctrlKey) modifiers.push("ctrl");
      if (e.altKey) modifiers.push("alt");
      if (e.shiftKey) modifiers.push("shift");

      // Get the main key
      const key = e.key.toUpperCase();

      // Update pressed keys in real-time
      setPressedKeys([...new Set([...modifiers, key])]);

      const isModifierKey = [
        "CONTROL",
        "ALT",
        "SHIFT",
        "META",
        "COMMAND",
      ].includes(key);

      if (!isModifierKey) {
        setSelectedModifiers(modifiers);
        setNonModifierKey(key);

        // Auto save after successful recording
        const newShortcut = [...modifiers, key].join("+");
        updateSettings({
          showScreenpipeShortcut: newShortcut,
        });
        updateSettings({ showScreenpipeShortcut: newShortcut });
        setCurrentShortcut(newShortcut);
        setIsRecording(false);

        registerShortcuts({
          showScreenpipeShortcut: newShortcut,
          disabledShortcuts,
        });

        toast({
          title: "shortcut updated",
          description: `new shortcut set to: ${parseKeyboardShortcut(
            newShortcut
          )}`,
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      // Clear pressed keys when all keys are released
      setPressedKeys([]);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    isRecording,
    settings,
    updateSettings,
    disabledShortcuts,
  ]);

  const handleShortcutToggle = (checked: boolean) => {
    console.log("handleShortcutToggle", checked);
    let newDisabledShortcuts = [...settings.disabledShortcuts];
    if (!checked) {
      newDisabledShortcuts.push(Shortcut.SHOW_SCREENPIPE);
    } else {
      newDisabledShortcuts = newDisabledShortcuts.filter(
        (shortcut) => shortcut !== Shortcut.SHOW_SCREENPIPE
      );
    }

    updateSettings({
      disabledShortcuts: newDisabledShortcuts,
    });

    registerShortcuts({
      showScreenpipeShortcut: settings.showScreenpipeShortcut,
      disabledShortcuts: newDisabledShortcuts,
    });
  };

  return (
    <div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold">shortcuts</h1>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h4 className="font-medium">toggle screenpipe overlay</h4>
          <p className="text-sm text-muted-foreground">
            global shortcut to show/hide the main interface
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsRecording(true)}
            className={cn(
              "relative min-w-[140px] rounded-md border px-3 py-2 text-sm",
              "bg-muted/50 hover:bg-muted/70 transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring",
              isRecording && "border-primary"
            )}
          >
            {isRecording ? (
              <span className="animate-pulse">recording...</span>
            ) : (
              <span className="flex items-center justify-between gap-2">
                {currentShortcut
                  ? parseKeyboardShortcut(currentShortcut)
                  : "click to record"}
                <Pencil className="h-3 w-3 opacity-50" />
              </span>
            )}
          </button>

          <Switch
            id="shortcutEnabled"
            checked={
              !settings.disabledShortcuts.includes(Shortcut.SHOW_SCREENPIPE)
            }
            onCheckedChange={handleShortcutToggle}
          />
        </div>
      </div>

      {isRecording && (
        <div className="rounded-lg border bg-muted/50 p-4">
          <p className="text-xs text-center text-muted-foreground mb-3">
            press your desired key combination
          </p>
          <div className="flex justify-center gap-1">
            {pressedKeys.length > 0 ? (
              pressedKeys.map((key) => (
                <kbd
                  key={key}
                  className="px-2 py-1 text-xs rounded bg-background"
                >
                  {parseKeyboardShortcut(key)}
                </kbd>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">
                waiting for input...
              </span>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => {
                setIsRecording(false);
                setPressedKeys([]);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShortcutSection;
