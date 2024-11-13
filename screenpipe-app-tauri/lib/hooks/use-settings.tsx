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
  isFirstTimeUser: boolean;
  enableFrameCache: boolean; // Add this line
  enableUiMonitoring: boolean; // Add this line
  platform: string; // Add this line
}

const defaultSettings: Settings = {
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
  enableFrameCache: false, // Add this line
  enableUiMonitoring: false, // Change from true to false
  platform: "unknown", // Add this line
};

let store: Awaited<ReturnType<typeof createStore>> | null = null;

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  useEffect(() => {
    posthog.identify(settings.userId);
  }, [settings.userId]);

  // console.log("settings", settings);
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

  useEffect(() => {
    const loadSettings = async () => {
      if (!store) {
        await initStore();
      }

      try {
        const currentPlatform = platform();
        console.log("Current platform:", currentPlatform);

        const ocrModel =
          currentPlatform === "macos"
            ? "apple-native"
            : currentPlatform === "windows"
            ? "windows-native"
            : "tesseract";

        console.log("loading settings", store);
        // no need to call load() as it's done automatically
        const savedKey = (await store!.get<string>("openaiApiKey")) || "";
        const savedDeepgramKey =
          (await store!.get<string>("deepgramApiKey")) || "";
        const savedAiModel = (await store!.get<string>("aiModel")) || "gpt-4o";
        const savedInstalledPipes =
          (await store!.get<Pipe[]>("installedPipes")) || [];
        const savedUserId = (await store!.get<string>("userId")) || "";
        const savedCustomPrompt =
          (await store!.get<string>("customPrompt")) || "";
        let savedDevMode = await store!.get<boolean>("devMode");
        if (savedDevMode === null) {
          savedDevMode = false;
        }
        console.log("savedDevMode", savedDevMode);

        const savedAudioTranscriptionEngine =
          (await store!.get<string>("audioTranscriptionEngine")) || "deepgram";
        const savedOcrEngine =
          (await store!.get<string>("ocrEngine")) || ocrModel;
        const savedMonitorIds = (await store!.get<string[]>("monitorIds")) || [
          "default",
        ];
        const savedAudioDevices = (await store!.get<string[]>(
          "audioDevices"
        )) || ["default"];
        let savedUsePiiRemoval = await store!.get<boolean>("usePiiRemoval");
        if (savedUsePiiRemoval === null) {
          savedUsePiiRemoval = false;
        }
        const savedRestartInterval =
          (await store!.get<number>("restartInterval")) || 0;
        const savedPort = (await store!.get<number>("port")) || 3030;
        const savedDataDir = (await store!.get<string>("dataDir")) || "";
        let savedDisableAudio = await store!.get<boolean>("disableAudio");
        if (savedDisableAudio === null) {
          savedDisableAudio = false;
        }

        const savedIncludedWindows =
          (await store!.get<string[]>("includedWindows")) || [];
        const savedAiUrl =
          (await store!.get<string>("aiUrl")) || "https://api.openai.com/v1";
        const savedAiMaxContextChars =
          (await store!.get<number>("aiMaxContextChars")) || 30000;
        const savedFps =
          (await store!.get<number>("fps")) ||
          (currentPlatform === "macos" ? 0.2 : 1);
        const savedVadSensitivity =
          (await store!.get<VadSensitivity>("vadSensitivity")) || "high";
        let savedAnalyticsEnabled = await store!.get<boolean>(
          "analyticsEnabled"
        );
        if (savedAnalyticsEnabled === null) {
          savedAnalyticsEnabled = true;
        }
        console.log("savedAnalyticsEnabled", savedAnalyticsEnabled);
        const savedAudioChunkDuration =
          (await store!.get<number>("audioChunkDuration")) || 30;
        let savedUseChineseMirror = await store!.get<boolean>(
          "useChineseMirror"
        );
        if (savedUseChineseMirror === null) {
          savedUseChineseMirror = false;
        }
        const savedEmbeddedLLM = (await store!.get<EmbeddedLLMConfig>(
          "embeddedLLM"
        )) || {
          enabled: false,
          model: "llama3.2:1b-instruct-q4_K_M",
          port: 11438,
        };

        const savedLanguages =
          (await store!.get<Language[]>("languages")) || [];

        const ignoredWindowsInAllOS = [
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
        const defaultIgnoredWindows =
          currentPlatform === "macos"
            ? [
                ...ignoredWindowsInAllOS,
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
              ]
            : currentPlatform === "windows"
            ? [
                ...ignoredWindowsInAllOS,
                "Nvidia",
                "Control Panel",
                "System Properties",
              ]
            : currentPlatform === "linux"
            ? [...ignoredWindowsInAllOS, "Info center", "Discover", "Parted"]
            : [];

        const savedIgnoredWindows = await store!.get<string[]>(
          "ignoredWindows"
        );
        const finalIgnoredWindows =
          savedIgnoredWindows && savedIgnoredWindows.length > 0
            ? savedIgnoredWindows
            : defaultIgnoredWindows;

        // TODO: temporary
        let savedEnableBeta = false; // await store!.get<boolean>("enableBeta");
        if (savedEnableBeta === null) {
          savedEnableBeta = false;
        }

        const savedShowScreenpipeShortcut =
          (await store!.get<string>("showScreenpipeShortcut")) || "Super+Alt+S";

        let savedIsFirstTimeUser = await store!.get<boolean>("isFirstTimeUser");
        if (savedIsFirstTimeUser === null) {
          savedIsFirstTimeUser = true;
        }
        const savedAiProviderType =
          (await store!.get<AIProviderType>("aiProviderType")) || "openai";

        const savedEnableFrameCache =
          (await store!.get<boolean>("enableFrameCache")) || false;

        const savedEnableUiMonitoring =
          (await store!.get<boolean>("enableUiMonitoring")) || false;

        setSettings({
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
          showScreenpipeShortcut: savedShowScreenpipeShortcut,
          isFirstTimeUser: savedIsFirstTimeUser,
          enableFrameCache: savedEnableFrameCache,
          enableUiMonitoring: savedEnableUiMonitoring,
          platform: currentPlatform,
        });
      } catch (error) {
        console.error("failed to load settings:", error);
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
      console.log("Updating settings:", newSettings); // Add this line
      const updatedSettings = { ...settings, ...newSettings };
      setSettings(updatedSettings);

      // update the store for the fields that were changed
      for (const key in newSettings) {
        if (Object.prototype.hasOwnProperty.call(newSettings, key)) {
          console.log(
            `Setting ${key}:`,
            updatedSettings[key as keyof Settings]
          ); // Add this line
          await store!.set(key, updatedSettings[key as keyof Settings]);
        }
      }
      await store!.save();
      // no need to call save() as we're using autoSave: true
    } catch (error) {
      console.error("failed to update settings:", error);
      // revert local state if store update fails
      setSettings(settings);
    }
  };

  return { settings, updateSettings, resetSetting };
}

async function initStore() {
  const dataDir = await localDataDir();
  const storePath = await join(dataDir, "screenpipe", "store.bin");
  store = await createStore(storePath);
}
