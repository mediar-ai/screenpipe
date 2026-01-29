import React from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import ShortcutRow from "./shortcut-row";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { invoke } from "@tauri-apps/api/core";

const ShortcutSection = () => {
  const { settings, updateSettings } = useSettings();


  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Shortcuts
        </h1>
        <p className="text-muted-foreground text-lg">
          Keyboard shortcuts and hotkeys
        </p>
      </div>

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
          shortcut="showChatShortcut"
          title="toggle ai chat"
          description="global shortcut to show/hide the ai chat window"
          value={settings.showChatShortcut}
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

        <ShortcutRow
          type="global"
          shortcut="startAudioShortcut"
          title="start audio recording"
          description="global shortcut to start audio recording"
          value={settings.startAudioShortcut}
        />

        <ShortcutRow
          type="global"
          shortcut="stopAudioShortcut"
          title="stop audio recording"
          description="global shortcut to stop audio recording"
          value={settings.stopAudioShortcut}
        />

        <div className="flex items-center justify-between py-4 border-t">
          <div className="space-y-1">
            <Label htmlFor="shortcut-overlay" className="text-base font-medium">
              show shortcut reminder
            </Label>
            <p className="text-sm text-muted-foreground">
              display a small overlay showing the screenpipe shortcut on screen
            </p>
          </div>
          <Switch
            id="shortcut-overlay"
            checked={settings.showShortcutOverlay}
            onCheckedChange={async (checked) => {
              updateSettings({ showShortcutOverlay: checked });
              try {
                if (checked) {
                  // Show the overlay when enabled
                  await invoke("show_shortcut_reminder", { shortcut: settings.showScreenpipeShortcut });
                } else {
                  // Hide the overlay when disabled
                  await invoke("hide_shortcut_reminder");
                }
              } catch (e) {
                // Window may not exist
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default ShortcutSection;
