import { useState, useEffect } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { homeDir } from "@tauri-apps/api/path";
import { join } from "@tauri-apps/api/path";

interface Settings {
  openaiApiKey: string;
  useOllama: boolean;
  isLoading: boolean;
  useCloudAudio: boolean;
}

let store: Store | null = null;

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({
    openaiApiKey: "",
    useOllama: false,
    isLoading: true,
    useCloudAudio: true,
  });

  useEffect(() => {
    const initStore = async () => {
      const home = await homeDir();
      const storePath = await join(home, ".screenpipe", "store.bin");
      store = new Store(storePath);
    };

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
          ((await store!.get("useCloudAudio")) as boolean) ?? true;

        setSettings({
          openaiApiKey: savedKey,
          useOllama: savedUseOllama,
          isLoading: false,
          useCloudAudio: savedUseCloudAudio,
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
      await store!.save();
      setSettings(updatedSettings);
    } catch (error) {
      console.error("Failed to update settings:", error);
    }
  };

  return { settings, updateSettings };
}

async function initStore() {
  const home = await homeDir();
  const storePath = await join(home, ".screenpipe", "store.bin");
  store = new Store(storePath);
}
