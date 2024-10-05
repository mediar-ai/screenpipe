import { useState, useEffect } from "react";
import { createStore } from "@tauri-apps/plugin-store";
import { localDataDir, join } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { Pipe } from "./use-pipes";
import posthog from "posthog-js";

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
  audioTranscriptionEngine: "whisper-large",
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
  aiUrl: "https://api.openai.com/v1",
  aiMaxContextChars: 30000,
  fps: 0.5,
  vadSensitivity: "high",
  analyticsEnabled: true,
  audioChunkDuration: 30, // default to 10 seconds
};

export type VadSensitivity = "low" | "medium" | "high";
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
  aiUrl: string;
  aiMaxContextChars: number;
  fps: number;
  vadSensitivity: VadSensitivity;
  analyticsEnabled: boolean;
  audioChunkDuration: number; // new field
}

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

      const ocrModel =
        platform() === "macos"
          ? "apple-native"
          : platform() === "windows"
          ? "windows-native"
          : "tesseract";
      try {
        console.log("loading settings", store);
        // no need to call load() as it's done automatically
        const savedKey = (await store!.get<string>("openaiApiKey")) || "";
        const savedDeepgramKey =
          (await store!.get<string>("deepgramApiKey")) ||
          "7ed2a159a094337b01fd8178b914b7ae0e77822d";
        const savedAiModel = (await store!.get<string>("aiModel")) || "gpt-4o";
        const savedInstalledPipes =
          (await store!.get<Pipe[]>("installedPipes")) || [];
        const savedUserId = (await store!.get<string>("userId")) || "";
        const savedCustomPrompt =
          (await store!.get<string>("customPrompt")) || "";
        const savedDevMode = (await store!.get<boolean>("devMode")) || false;
        console.log("savedDevMode", savedDevMode);

        const savedAudioTranscriptionEngine =
          (await store!.get<string>("audioTranscriptionEngine")) ||
          "whisper-large";
        const savedOcrEngine =
          (await store!.get<string>("ocrEngine")) || ocrModel;
        const savedMonitorIds = (await store!.get<string[]>("monitorIds")) || [
          "default",
        ];
        const savedAudioDevices = (await store!.get<string[]>(
          "audioDevices"
        )) || ["default"];
        const savedUsePiiRemoval =
          (await store!.get<boolean>("usePiiRemoval")) || false;
        const savedRestartInterval =
          (await store!.get<number>("restartInterval")) || 0;
        const savedPort = (await store!.get<number>("port")) || 3030;
        const savedDataDir = (await store!.get<string>("dataDir")) || "";
        const savedDisableAudio =
          (await store!.get<boolean>("disableAudio")) || false;
        const savedIgnoredWindows =
          (await store!.get<string[]>("ignoredWindows")) || [];
        const savedIncludedWindows =
          (await store!.get<string[]>("includedWindows")) || [];
        const savedAiUrl =
          (await store!.get<string>("aiUrl")) || "https://api.openai.com/v1";
        const savedAiMaxContextChars =
          (await store!.get<number>("aiMaxContextChars")) || 30000;
        const savedFps =
          (await store!.get<number>("fps")) ||
          (platform() === "macos" ? 0.2 : 1);
        const savedVadSensitivity =
          (await store!.get<VadSensitivity>("vadSensitivity")) || "high";
        const savedAnalyticsEnabled =
          (await store!.get<boolean>("analyticsEnabled")) || true;
        const savedAudioChunkDuration =
          (await store!.get<number>("audioChunkDuration")) || 30;
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
          ignoredWindows: savedIgnoredWindows,
          includedWindows: savedIncludedWindows,
          aiUrl: savedAiUrl,
          aiMaxContextChars: savedAiMaxContextChars,
          fps: savedFps,
          vadSensitivity: savedVadSensitivity,
          analyticsEnabled: savedAnalyticsEnabled,
          audioChunkDuration: savedAudioChunkDuration,
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
      const updatedSettings = { ...settings, ...newSettings };
      setSettings(updatedSettings);

      // update the store for the fields that were changed
      for (const key in newSettings) {
        if (Object.prototype.hasOwnProperty.call(newSettings, key)) {
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
