import React from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import ShortcutRow from "./shortcut-row";

const ShortcutSection = () => {
  const { settings } = useSettings();


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

       
      </div>
    </div>
  );
};

export default ShortcutSection;
