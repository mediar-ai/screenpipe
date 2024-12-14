'use server';

import type { Settings } from '@screenpipe/js';
const { pipe } = await import('@screenpipe/js');

export async function getSettings(): Promise<Settings> {
  return {} as Settings;
  // try {
  //   const settingsManager = pipe.settings;
  //   const rawSettings = await settingsManager.getAll();
    
  //   // Create a new plain object with the default settings
  //   const defaultSettings: Settings = {
  //     openaiApiKey: "",
  //     deepgramApiKey: "",
  //     aiModel: "gpt-4",
  //     aiUrl: "https://api.openai.com/v1",
  //     customPrompt: "",
  //     port: 3030,
  //     dataDir: "default",
  //     disableAudio: false,
  //     ignoredWindows: [],
  //     includedWindows: [],
  //     aiProviderType: "openai",
  //     embeddedLLM: {
  //       enabled: false,
  //       model: "llama3.2:1b-instruct-q4_K_M",
  //       port: 11438,
  //     },
  //     enableFrameCache: true,
  //     enableUiMonitoring: false,
  //     aiMaxContextChars: 128000,
  //   };

  //   // Deep clone function that ensures plain objects
  //   function deepClone<T>(obj: T): T {
  //     if (obj === null || typeof obj !== 'object') {
  //       return obj;
  //     }

  //     if (Array.isArray(obj)) {
  //       return obj.map(deepClone) as any;
  //     }

  //     const plainObj = Object.create(null);
  //     Object.setPrototypeOf(plainObj, Object.prototype);

  //     for (const [key, value] of Object.entries(obj)) {
  //       plainObj[key] = deepClone(value);
  //     }

  //     return plainObj as T;
  //   }

  //   // Create a completely new plain object
  //   const sanitizedSettings = deepClone({
  //     ...defaultSettings,
  //     ...rawSettings,
  //   });

  //   return sanitizedSettings;
  // } catch (error) {
  //   console.error('failed to get settings:', error);
  //   // Return a new plain object with default settings on error
  //   return { ...defaultSettings };
  // }
}

export async function updateSettingServer<T extends keyof Settings>(
  key: T, 
  value: Settings[T]
): Promise<void> {
  const settingsManager = pipe.settings;
  // Ensure the value is serializable
  const serializedValue = JSON.parse(JSON.stringify(value));
  await settingsManager.set(key, serializedValue);
}

export async function updateSettingsServer(
  newSettings: Partial<Settings>
): Promise<void> {
  const settingsManager = pipe.settings;
  // Ensure the settings are serializable
  const serializedSettings = JSON.parse(JSON.stringify(newSettings));
  await settingsManager.update(serializedSettings);
}

export async function resetSettingsServer(
  settingKey?: keyof Settings
): Promise<void> {
  const settingsManager = pipe.settings;
  if (settingKey) {
    await settingsManager.resetKey(settingKey);
  } else {
    await settingsManager.reset();
  }
}
