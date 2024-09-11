import { useState, useEffect } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { localDataDir } from "@tauri-apps/api/path";
import { join } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { Pipe } from "./use-pipes";

const defaultSettings: Settings = {
  openaiApiKey: "",
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
- Keep in mind “q” argument is used for full text search, use it only if necessary as a mistake can filter out all the data
- Do not use "q" argument in your queries to screenpipe except if I am asking for specific keyword that would return results
- If the data your receive is empty (e.g. "data": []), ask me to restart a chat with more specific instructions (e.g. narrow time range, topic, etc.)
- If I ask a too general question, ask me to narrow down the time range or topic
- If I ask "show me what i was doing at 10.11 am” make sure to embed a video in the chat at the end using \`/users/video.mp4\`

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
};

export interface Settings {
  openaiApiKey: string;
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
}

let store: Store | null = null;

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

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
        const savedMonitorIds =
          ((await store!.get("monitorIds")) as string[]) || ["default"];
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
        setSettings({
          openaiApiKey: savedKey,
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
