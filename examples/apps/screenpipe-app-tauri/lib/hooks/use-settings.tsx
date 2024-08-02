import { useState, useEffect } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { dataDir, homeDir, localDataDir } from "@tauri-apps/api/path";
import { join } from "@tauri-apps/api/path";

interface Settings {
  openaiApiKey: string;
  useOllama: boolean;
  isLoading: boolean;
  useCloudAudio: boolean;
  useCloudOcr: boolean;
}

let store: Store | null = null;

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({
    openaiApiKey: "",
    useOllama: false,
    isLoading: true,
    useCloudAudio: false,
    useCloudOcr: false,
  });

  useEffect(() => {
    const loadSettings = async () => {
      if (!store) {
        await initStore();
      }

      try {
        await store!.load();
        const savedKey = ((await store!.get("openaiApiKey")) as string) || "";
        const savedUseOllama =
          ((await store!.get("useOllama")) as boolean) || false;
        const savedUseCloudAudio =
          ((await store!.get("useCloudAudio")) as boolean) ?? false;
        const savedUseCloudOcr =
          ((await store!.get("useCloudOcr")) as boolean) ?? false;

        setSettings({
          openaiApiKey: savedKey,
          useOllama: savedUseOllama,
          isLoading: false,
          useCloudAudio: savedUseCloudAudio,
          useCloudOcr: savedUseCloudOcr,
        });
      } catch (error) {
        console.error("Failed to load settings:", error);
        setSettings((prevSettings) => ({ ...prevSettings, isLoading: false }));
      }
    };
    loadSettings();
  }, []);

  const updateSettings = async (newSettings: Partial<Settings>) => {
    if (!store) {
      await initStore();
    }

    try {
      const updatedSettings = { ...settings, ...newSettings };
      await store!.set("openaiApiKey", updatedSettings.openaiApiKey);
      await store!.set("useOllama", updatedSettings.useOllama);
      await store!.set("useCloudAudio", updatedSettings.useCloudAudio);
      await store!.set("useCloudOcr", updatedSettings.useCloudOcr);
      await store!.save();
      setSettings(updatedSettings);
    } catch (error) {
      console.error("Failed to update settings:", error);
    }
  };

  return { settings, updateSettings };
}

async function initStore() {
  const dataDir = await localDataDir();
  const storePath = await join(dataDir, "screenpipe", "store.bin");
  store = new Store(storePath);
}
