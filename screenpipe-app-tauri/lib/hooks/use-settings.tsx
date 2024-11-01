import { useState, useEffect } from "react";
import { createStore } from "@tauri-apps/plugin-store";
import { localDataDir, join } from "@tauri-apps/api/path";
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

export interface Settings {
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
  recordingShortcut: string;
  isFirstTimeUser: boolean;
  enableFrameCache: boolean; // Add this line
}

const defaultSettings: Settings = {
  openaiApiKey: "",
  deepgramApiKey: "7ed2a159a094337b01fd8178b914b7ae0e77822d", // for now we hardcode our key (dw about using it, we have bunch of credits)
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
  showScreenpipeShortcut: "Super+Alt+F",  // Update default
  recordingShortcut: "Super+Alt+E",      // Update default
  isFirstTimeUser: true,
  enableFrameCache: false, // Add this line
};

let store: Awaited<ReturnType<typeof createStore>> | null = null;

// First, add a debug function to help track state changes
const logSettingsDebug = (prefix: string, settings: Partial<Settings>) => {
  console.log(`[${prefix}] Settings state:`, {
    showScreenpipeShortcut: settings.showScreenpipeShortcut,
    recordingShortcut: settings.recordingShortcut,
    // Add other relevant fields you want to track
  });
};

export async function loadSettingsFromStore(setSettings: React.Dispatch<React.SetStateAction<Settings>>) {
  if (!store) {
    await initStore();
  }

  try {
    console.log("loading settings", store);
    const currentPlatform = platform();
    const ocrModel = currentPlatform === "macos" 
      ? "apple-native" 
      : currentPlatform === "windows" 
      ? "windows-native" 
      : "tesseract";

    // Load all settings with proper defaults
    const savedKey = await store!.get<string>("openaiApiKey") || "";
    const savedDeepgramKey = await store!.get<string>("deepgramApiKey") || "7ed2a159a094337b01fd8178b914b7ae0e77822d";
    const savedAiModel = await store!.get<string>("aiModel") || "gpt-4o";
    const savedInstalledPipes = await store!.get<Pipe[]>("installedPipes") || [];
    const savedUserId = await store!.get<string>("userId") || "";
    const savedCustomPrompt = await store!.get<string>("customPrompt") || "";
    
    let savedDevMode = await store!.get<boolean>("devMode");
    if (savedDevMode === null) savedDevMode = false;

    const savedShowScreenpipeShortcut = await store!.get<string>("showScreenpipeShortcut");
    const savedRecordingShortcut = await store!.get<string>("recordingShortcut");
    const savedAudioTranscriptionEngine = await store!.get<string>("audioTranscriptionEngine") || "deepgram";
    const savedOcrEngine = await store!.get<string>("ocrEngine") || ocrModel;
    const savedMonitorIds = await store!.get<string[]>("monitorIds") || ["default"];
    const savedAudioDevices = await store!.get<string[]>("audioDevices") || ["default"];
    const savedIncludedWindows = await store!.get<string[]>("includedWindows") || [];
    
    let savedUsePiiRemoval = await store!.get<boolean>("usePiiRemoval");
    if (savedUsePiiRemoval === null) savedUsePiiRemoval = false;
    
    const savedRestartInterval = await store!.get<number>("restartInterval") || 0;
    const savedPort = await store!.get<number>("port") || 3030;
    const savedDataDir = await store!.get<string>("dataDir") || "";
    
    let savedDisableAudio = await store!.get<boolean>("disableAudio");
    if (savedDisableAudio === null) savedDisableAudio = false;

    const savedAiUrl = await store!.get<string>("aiUrl") || "https://api.openai.com/v1";
    const savedAiMaxContextChars = await store!.get<number>("aiMaxContextChars") || 30000;
    const savedFps = await store!.get<number>("fps") || (currentPlatform === "macos" ? 0.2 : 1);
    
    let savedVadSensitivity = await store!.get<VadSensitivity>("vadSensitivity");
    if (savedVadSensitivity === null) savedVadSensitivity = "high";
    
    let savedAnalyticsEnabled = await store!.get<boolean>("analyticsEnabled");
    if (savedAnalyticsEnabled === null) savedAnalyticsEnabled = true;
    
    const savedAudioChunkDuration = await store!.get<number>("audioChunkDuration") || 30;
    
    let savedUseChineseMirror = await store!.get<boolean>("useChineseMirror");
    if (savedUseChineseMirror === null) savedUseChineseMirror = false;
    
    const savedEmbeddedLLM = await store!.get<EmbeddedLLMConfig>("embeddedLLM") || {
      enabled: false,
      model: "llama3.2:1b-instruct-q4_K_M",
      port: 11438,
    };

    const savedLanguages = await store!.get<Language[]>("languages") || [];
    
    let savedEnableBeta = await store!.get<boolean>("enableBeta");
    if (savedEnableBeta === null) savedEnableBeta = false;

    let savedIsFirstTimeUser = await store!.get<boolean>("isFirstTimeUser");
    if (savedIsFirstTimeUser === null) savedIsFirstTimeUser = true;

    let savedAiProviderType = await store!.get<AIProviderType>("aiProviderType");
    if (savedAiProviderType === null) savedAiProviderType = "openai";

    // Define ignored windows based on platform
    const ignoredWindowsInAllOS = [
      "bit", "VPN", "Trash", "Private", "Incognito", "Wallpaper",
      "Settings", "Keepass", "Recorder", "Vaults", "OBS Studio",
    ];

    const defaultIgnoredWindows = currentPlatform === "macos"
      ? [
          ...ignoredWindowsInAllOS,
          ".env", "Item-0", "App Icon Window", "Battery",
          "Shortcuts", "WiFi", "BentoBox", "Clock", "Dock", "DeepL",
        ]
      : currentPlatform === "windows"
      ? [
          ...ignoredWindowsInAllOS,
          "Nvidia", "Control Panel", "System Properties",
        ]
      : currentPlatform === "linux"
      ? [...ignoredWindowsInAllOS, "Info center", "Discover", "Parted"]
      : [];

    const savedIgnoredWindows = await store!.get<string[]>("ignoredWindows");
    const finalIgnoredWindows = savedIgnoredWindows?.length ? savedIgnoredWindows : defaultIgnoredWindows;
    const savedEnableFrameCache =
          (await store!.get<boolean>("enableFrameCache")) || false;

    // Create merged settings with all values
    const mergedSettings: Settings = {
      openaiApiKey: savedKey,
      deepgramApiKey: savedDeepgramKey,
      isLoading: false,
      aiModel: savedAiModel,
      installedPipes: savedInstalledPipes,
      userId: savedUserId,
      customPrompt: savedCustomPrompt,
      devMode: savedDevMode,
      audioTranscriptionEngine: savedAudioTranscriptionEngine,
      ocrEngine: savedOcrEngine,
      monitorIds: savedMonitorIds,
      audioDevices: savedAudioDevices,
      usePiiRemoval: savedUsePiiRemoval,
      restartInterval: savedRestartInterval,
      port: savedPort,
      dataDir: savedDataDir,
      disableAudio: savedDisableAudio,
      ignoredWindows: finalIgnoredWindows,
      includedWindows: savedIncludedWindows,
      aiProviderType: savedAiProviderType,
      aiUrl: savedAiUrl,
      aiMaxContextChars: savedAiMaxContextChars,
      fps: savedFps,
      vadSensitivity: savedVadSensitivity,
      analyticsEnabled: savedAnalyticsEnabled,
      audioChunkDuration: savedAudioChunkDuration,
      useChineseMirror: savedUseChineseMirror,
      embeddedLLM: savedEmbeddedLLM,
      languages: savedLanguages,
      enableBeta: savedEnableBeta,
      showScreenpipeShortcut: savedShowScreenpipeShortcut || defaultSettings.showScreenpipeShortcut,
      recordingShortcut: savedRecordingShortcut || defaultSettings.recordingShortcut,
      isFirstTimeUser: savedIsFirstTimeUser,
      enableFrameCache: savedEnableFrameCache,
    };

    // Update UI state
    setSettings(mergedSettings);
    
    logSettingsDebug("After SetSettings", mergedSettings);

  } catch (error) {
    console.error("Failed to load settings:", error);
    setSettings(prev => ({ ...prev, isLoading: false }));
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  // Add debug effect to track settings changes
  useEffect(() => {
    logSettingsDebug("Settings Changed", settings);
  }, [settings.showScreenpipeShortcut, settings.recordingShortcut]);

  useEffect(() => {
    loadSettingsFromStore(setSettings);
     
  }, []);

  const updateSettings = async (newSettings: Partial<Settings>) => {
    if (!store) {
      await initStore();
    }

    try {
      // Create updated settings object
      const updatedSettings = { ...settings, ...newSettings };
      
      // Update store for each changed setting
      for (const [key, value] of Object.entries(newSettings)) {
        await store!.set(key, value);
      }
      
      // Explicit save
      await store!.save();
      
      // Update state after successful store update
      setSettings(updatedSettings);
      
      console.log("Settings updated successfully:", updatedSettings);
    } catch (error) {
      console.error("Failed to update settings:", error);
      throw error; // Let the component handle the error
    }
  };

  const resetSetting = async (key: keyof Settings) => {
    if (!store) {
      await initStore();
    }

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

  return { settings, updateSettings, resetSetting, loadSettingsFromStore, setSettings };
}

async function initStore() {
  const dataDir = await localDataDir();
  const storePath = await join(dataDir, "screenpipe", "store.bin");
  store = await createStore(storePath);
}
