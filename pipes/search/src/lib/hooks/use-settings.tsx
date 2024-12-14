'use client';

// import { type Settings } from '@screenpipe/js';
import { useState, useEffect } from 'react';

export function useSettings() {
  // Create a plain default settings object
  const defaultSettings: any = {
    openaiApiKey: "",
    deepgramApiKey: "",
    aiModel: "gpt-4",
    aiUrl: "https://api.openai.com/v1",
    customPrompt: "",
    port: 3030,
    dataDir: "default",
    disableAudio: false,
    ignoredWindows: [],
    includedWindows: [],
    aiProviderType: "openai",
    embeddedLLM: {
      enabled: false,
      model: "llama3.2:1b-instruct-q4_K_M",
      port: 11438,
    },
    enableFrameCache: true,
    enableUiMonitoring: false,
    aiMaxContextChars: 128000,
  };

  const [settings, setSettings] = useState<any>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        // when you uncomment the getSettings function, use this:
        // const data = await getSettings();
        // setSettings({ ...defaultSettings, ...data });
        setSettings(JSON.parse(JSON.stringify(defaultSettings)));
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  // const updateSetting = async <T extends keyof Settings>(key: T, value: Settings[T]) => {
  //   try {
  //     // when you uncomment updateSettingServer, use this:
  //     // await updateSettingServer(key, value);
  //     setSettings(prev => ({ ...prev, [key]: value }));
  //   } catch (err) {
  //     setError(err as Error);
  //   }
  // };

  // const updateSettings = async (newSettings: Partial<Settings>) => {
  //   try {
  //     // when you uncomment updateSettingsServer, use this:
  //     // await updateSettingsServer(newSettings);
  //     setSettings(prev => ({ ...prev, ...newSettings }));
  //   } catch (err) {
  //     setError(err as Error);
  //   }
  // };

  // const resetSettings = async (settingKey?: keyof Settings) => {
  //   try {
  //     // when you uncomment resetSettingsServer, use this:
  //     // await resetSettingsServer(settingKey);
  //     if (settingKey) {
  //       setSettings(prev => ({ ...prev, [settingKey]: defaultSettings[settingKey] }));
  //     } else {
  //       setSettings(defaultSettings);
  //     }
  //   } catch (err) {
  //     setError(err as Error);
  //   }
  // };

  return {
    settings,
    loading,
    error,
    // updateSetting,
    // updateSettings,
    // resetSettings,
  };
}
