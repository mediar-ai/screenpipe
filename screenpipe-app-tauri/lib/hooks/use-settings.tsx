import { useState, useEffect } from "react";
import { createStore, Store } from "@tauri-apps/plugin-store";
import { localDataDir, join, homeDir } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { Pipe } from "./use-pipes";
import posthog from "posthog-js";
import { Language } from "@/lib/language";

export type VadSensitivity = "low" | "medium" | "high";

export type AIProviderType =
  | "native-ollama"
  | "openai"
  | "custom"
  | "embedded"
  | "screenpipe-cloud";

export type EmbeddedLLMConfig = {
  enabled: boolean;
  model: string;
  port: number;
};

export enum Shortcut {
  SHOW_SCREENPIPE = "show_screenpipe",
}

export type Settings = {
  openaiApiKey: string;
  deepgramApiKey: string;
  isLoading: boolean;
  aiModel: string;
  installedPipes: Pipe[];
  userId: string;
  customPrompt: string;
  devMode: boolean;
  audioTranscriptionEngine: string;
  ocrEngine: string;
  monitorIds: string[];
  audioDevices: string[];
  usePiiRemoval: boolean;
  restartInterval: number;
  port: number;
  dataDir: string;
  disableAudio: boolean;
  ignoredWindows: string[];
  includedWindows: string[];
  aiProviderType: AIProviderType;
  aiUrl: string;
  aiMaxContextChars: number;
  fps: number;
  vadSensitivity: VadSensitivity;
  analyticsEnabled: boolean;
  audioChunkDuration: number; // new field
  useChineseMirror: boolean; // Add this line
  embeddedLLM: EmbeddedLLMConfig;
  languages: Language[];
  enableBeta: boolean;
  showScreenpipeShortcut: string;
  isFirstTimeUser: boolean;
  enableFrameCache: boolean; // Add this line
  enableUiMonitoring: boolean; // Add this line
  platform: string; // Add this line
  disabledShortcuts: Shortcut[];
};

const DEFAULT_SETTINGS: Settings = {
  openaiApiKey: "",
  deepgramApiKey: "", // for now we hardcode our key (dw about using it, we have bunch of credits)
  isLoading: true,
  aiModel: "gpt-4o",
  installedPipes: [],
  userId: "",
  customPrompt: `Rules:
- You can analyze/view/show/access videos to the user by putting .mp4 files in a code block (we'll render it) like this: \`/users/video.mp4\`, use the exact, absolute, file path from file_path property
- Do not try to embed video in links (e.g. [](.mp4) or https://.mp4) instead put the file_path in a code block using backticks
- Do not put video in multiline code block it will not render the video (e.g. \`\`\`bash\n.mp4\`\`\` IS WRONG) instead using inline code block with single backtick
- Always answer my question/intent, do not make up things

`,
  devMode: false,
  audioTranscriptionEngine: "deepgram",
  ocrEngine: "default",
  monitorIds: ["default"],
  audioDevices: ["default"],
  usePiiRemoval: false,
  restartInterval: 0,
  port: 3030,
  dataDir: "default",
  disableAudio: false,
  ignoredWindows: [],
  includedWindows: [],
  aiProviderType: "openai",
  aiUrl: "https://api.openai.com/v1",
  aiMaxContextChars: 30000,
  fps: 0.5,
  vadSensitivity: "high",
  analyticsEnabled: true,
  audioChunkDuration: 30, // default to 10 seconds
  useChineseMirror: false, // Add this line
  languages: [],
  embeddedLLM: {
    enabled: false,
    model: "llama3.2:1b-instruct-q4_K_M",
    port: 11438,
  },
  enableBeta: false,
  showScreenpipeShortcut: "Super+Alt+S",
  isFirstTimeUser: true,
  enableFrameCache: true, // Add this line
  enableUiMonitoring: false, // Change from true to false
  platform: "unknown", // Add this line
  disabledShortcuts: [],
};

const DEFAULT_IGNORED_WINDOWS_IN_ALL_OS = [
  "bit",
  "VPN",
  "Trash",
  "Private",
  "Incognito",
  "Wallpaper",
  "Settings",
  "Keepass",
  "Recorder",
  "Vaults",
  "OBS Studio",
];

const DEFAULT_IGNORED_WINDOWS_PER_OS: Record<string, string[]> = {
  macos: [
    ".env",
    "Item-0",
    "App Icon Window",
    "Battery",
    "Shortcuts",
    "WiFi",
    "BentoBox",
    "Clock",
    "Dock",
    "DeepL",
    "Control Center",
  ],
  windows: ["Nvidia", "Control Panel", "System Properties"],
  linux: ["Info center", "Discover", "Parted"],
};

let store: Awaited<ReturnType<typeof createStore>> | null = null;

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [localSettings, setLocalSettings] = useState<Settings>(settings);

  useEffect(() => {
    posthog.identify(settings.userId);
  }, [settings.userId]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const resetSetting = async (key: keyof Settings) => {
    if (!store) {
      await initStore();
    }

    const defaultSettings = createDefaultSettingsObject(platform());

    try {
      const updatedSettings = { ...settings, [key]: defaultSettings[key] };
      setSettings(updatedSettings);
      await store!.set(key, defaultSettings[key]);
      // No need to call save() as we're using autoSave: true
    } catch (error) {
      console.error(`failed to reset setting ${key}:`, error);
      // revert local state if store update fails
      setSettings(settings);
    }
  };

  const resetSettings = async () => {
    const userSettings = createDefaultSettingsObject(platform());

    updateSettings(userSettings);
  };

  const loadSettings = async () => {
    if (!store) {
      await initStore();
    }

    try {
      const currentPlatform = platform();
      const userSettings = await createUserSettings(store!, currentPlatform);

      setSettings({ ...userSettings, isLoading: false });
    } catch (error) {
      console.error("failed to load settings:", error);
      setSettings((prevSettings) => ({ ...prevSettings, isLoading: false }));
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const updateSettings = async (newSettings: Partial<Settings>) => {
    if (!store) {
      await initStore();
    }

    try {
      // Create complete updated settings object
      const updatedSettings = { ...settings, ...newSettings };

      // Save each setting individually to the store
      for (const [key, value] of Object.entries(updatedSettings)) {
        await store!.set(key, value);
      }

      // Update local state
      setLocalSettings(updatedSettings);
      setSettings(updatedSettings);

      // Force save to disk
      await store!.save();

      console.log("settings saved successfully:", updatedSettings);
    } catch (error) {
      console.error("failed to update settings:", error);
      setSettings(settings);
      throw error;
    }
  };

  const getDataDir = async () => {
    const homeDirPath = await homeDir();

    if (
      settings.dataDir !== "default" &&
      settings.dataDir &&
      settings.dataDir !== ""
    )
      return settings.dataDir;

    return platform() === "macos" || platform() === "linux"
      ? `${homeDirPath}/.screenpipe`
      : `${homeDirPath}\\.screenpipe`;
  };

  return {
    settings,
    updateSettings,
    resetSetting,
    getDataDir,
    resetSettings,
    localSettings,
    setLocalSettings,
  };
}

async function initStore() {
  const dataDir = await localDataDir();
  const storePath = await join(dataDir, "screenpipe", "store.bin");
  store = await createStore(storePath);
}

function createDefaultSettingsObject(currentPlatform: string) {
  let defaultSettings = DEFAULT_SETTINGS;

  const ocrModel =
    currentPlatform === "macos"
      ? "apple-native"
      : currentPlatform === "windows"
      ? "windows-native"
      : "tesseract";

  defaultSettings.ocrEngine = ocrModel;
  defaultSettings.fps = currentPlatform === "macos" ? 0.2 : 1;

  defaultSettings.ignoredWindows = [
    ...DEFAULT_IGNORED_WINDOWS_IN_ALL_OS,
    ...(DEFAULT_IGNORED_WINDOWS_PER_OS[currentPlatform] ?? []),
  ];

  return defaultSettings;
}

async function createUserSettings(
  store: Store,
  currentPlatform: string
): Promise<Settings> {
  let defaultSettingsObject = createDefaultSettingsObject(currentPlatform);
  let userSettingsObject: Record<string, any> = {};

  for (const key of Object.keys(defaultSettingsObject)) {
    const storedValue = await store.get(key);
    userSettingsObject[key] = storedValue === null || storedValue === undefined 
      ? defaultSettingsObject[key as keyof Settings]
      : storedValue;
  }

  return userSettingsObject as Settings;
}
