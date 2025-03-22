import { useState, useEffect } from "react";
import { settingsStore, PipeSettings } from "@/lib/store/settings-store";

export function usePipeSettings(pipeName: string) {
  const [settings, setSettings] = useState<Partial<PipeSettings> | null>(
    settingsStore.getStore().pipeSettings[pipeName] || null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      await settingsStore.loadPipeSettings(pipeName);
      setLoading(false);
    };

    loadSettings();

    const unsubscribe = settingsStore.subscribe(() => {
      setSettings(settingsStore.getStore().pipeSettings[pipeName] || null);
    });

    return () => {
      unsubscribe();
    };
  }, [pipeName]);

  const updateSettings = async (newSettings: Partial<PipeSettings>) => {
    return settingsStore.updatePipeSettings(pipeName, newSettings);
  };

  const getPreset = (key: keyof PipeSettings = "aiPresetId") => {
    return settingsStore.getPreset(pipeName, key);
  };

  return { settings, updateSettings, loading, getPreset };
}
