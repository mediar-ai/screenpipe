import { useState, useEffect } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { localDataDir } from "@tauri-apps/api/path";
import { join } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { Pipe } from "./use-pipes";
import posthog from "posthog-js";

const defaultSettings: Settings = {
  openaiApiKey: "",
  deepgramApiKey: "7ed2a159a094337b01fd8178b914b7ae0e77822d", // for now we hardcode our key (dw about using it, we have bunch of credits)
  useOllama: false,
  ollamaUrl: "http://localhost:11434",
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
  useOllama: boolean;
  ollamaUrl: string;
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

let store: Store | null = null;

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
      await store!.save();
    } catch (error) {
      console.error(`Failed to reset setting ${key}:`, error);
      // Revert local state if store update fails
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
        await store!.load();
        const savedKey = ((await store!.get("openaiApiKey")) as string) || "";
        const savedDeepgramKey =
          ((await store!.get("deepgramApiKey")) as string) ||
          "7ed2a159a094337b01fd8178b914b7ae0e77822d";
        const savedUseOllama =
          ((await store!.get("useOllama")) as boolean) || false;
        const savedOllamaUrl =
          ((await store!.get("ollamaUrl")) as string) ||
          "http://localhost:11434";
        const savedAiModel =
          ((await store!.get("aiModel")) as string) || "gpt-4o";
        const savedInstalledPipes =
          ((await store!.get("installedPipes")) as Pipe[]) || [];
        const savedUserId = ((await store!.get("userId")) as string) || "";
        const savedCustomPrompt =
          ((await store!.get("customPrompt")) as string) || "";
        let savedDevMode = (await store!.get("devMode")) as boolean;

        savedDevMode = savedDevMode === true;
        const savedAudioTranscriptionEngine =
          ((await store!.get("audioTranscriptionEngine")) as string) ||
          "whisper-large";
        const savedOcrEngine =
          ((await store!.get("ocrEngine")) as string) || ocrModel;
        const savedMonitorIds = ((await store!.get(
          "monitorIds"
        )) as string[]) || ["default"];
        const savedAudioDevices = ((await store!.get(
          "audioDevices"
        )) as string[]) || ["default"];
        const savedUsePiiRemoval =
          ((await store!.get("usePiiRemoval")) as boolean) || false;
        const savedRestartInterval =
          ((await store!.get("restartInterval")) as number) || 0;
        const savedPort = ((await store!.get("port")) as number) || 3030;
        const savedDataDir = ((await store!.get("dataDir")) as string) || "";
        const savedDisableAudio =
          ((await store!.get("disableAudio")) as boolean) || false;
        const savedIgnoredWindows =
          ((await store!.get("ignoredWindows")) as string[]) || [];
        const savedIncludedWindows =
          ((await store!.get("includedWindows")) as string[]) || [];
        const savedAiUrl =
          ((await store!.get("aiUrl")) as string) ||
          "https://api.openai.com/v1";
        const savedAiMaxContextChars =
          ((await store!.get("aiMaxContextChars")) as number) || 30000;
        const savedFps =
          ((await store!.get("fps")) as number) ||
          (platform() === "macos" ? 0.2 : 1);
        const savedVadSensitivity =
          ((await store!.get("vadSensitivity")) as VadSensitivity) || "high";
        const savedAnalyticsEnabled =
          ((await store!.get("analyticsEnabled")) as boolean) || true;
        const savedAudioChunkDuration =
          ((await store!.get("audioChunkDuration")) as number) || 30;
        setSettings({
          openaiApiKey: savedKey,
          deepgramApiKey: savedDeepgramKey,
          useOllama: savedUseOllama,
          isLoading: false,
          ollamaUrl: savedOllamaUrl,
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
      // Only update the fields that are explicitly provided in newSettings
      const updatedSettings = { ...settings };
      for (const key in newSettings) {
        if (Object.prototype.hasOwnProperty.call(newSettings, key)) {
          // @ts-ignore
          updatedSettings[key as keyof Settings] =
            newSettings[key as keyof Settings]!;
        }
      }

      setSettings(updatedSettings);
      // Only update the store for the fields that were changed
      for (const key in newSettings) {
        if (Object.prototype.hasOwnProperty.call(newSettings, key)) {
          await store!.set(key, updatedSettings[key as keyof Settings]);
        }
      }

      await store!.save();
    } catch (error) {
      console.error("Failed to update settings:", error);
      // Revert local state if store update fails
      setSettings(settings);
    }
  };

  return { settings, updateSettings, resetSetting };
}

async function initStore() {
  const dataDir = await localDataDir();
  const storePath = await join(dataDir, "screenpipe", "store.bin");
  store = new Store(storePath);
}
