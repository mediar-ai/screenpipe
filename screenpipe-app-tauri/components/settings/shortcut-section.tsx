import React, { useEffect, useState } from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { PipeApi } from "@/lib/api";
import ShortcutRow from "./shortcut-row";

const ShortcutSection = () => {
  const [pipes, setPipes] = useState<
    { id: string; source: string; enabled: boolean }[]
  >([]);
  const { settings } = useSettings();
  const { profiles, profileShortcuts } = useProfiles();

  useEffect(() => {
    const loadPipes = async () => {
      try {
        const pipeApi = new PipeApi();
        const pipeList = await pipeApi.listPipes();
        setPipes(
          pipeList.map((p) => ({
            id: p.id,
            source: p.source,
            enabled: p.enabled,
          }))
        );
      } catch (error) {
        console.error("failed to load pipes:", error);
      }
    };
    loadPipes();
  }, []);

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

        {pipes.filter((p) => p.enabled).length > 0 && (
          <>
            <div className="mt-8 mb-4">
              <h2 className="text-lg font-semibold">pipe shortcuts</h2>
              <p className="text-sm text-muted-foreground">
                assign shortcuts to quickly trigger installed pipes
              </p>
            </div>

            {pipes
              .filter((p) => p.enabled)
              .map((pipe) => (
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
