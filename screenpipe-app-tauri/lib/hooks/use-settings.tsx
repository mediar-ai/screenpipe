import { homeDir } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { Pipe } from "./use-pipes";
import { Language } from "@/lib/language";
import {
  createStore as createStoreEasyPeasy,
  action,
  Action,
  persist,
  createTypedHooks,
  PersistStorage,
} from "easy-peasy";
import { LazyStore, LazyStore as TauriStore } from "@tauri-apps/plugin-store";
import { localDataDir } from "@tauri-apps/api/path";
import { flattenObject, unflattenObject } from "../utils";

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

export interface User {
  id?: string;
  email?: string;
  name?: string;
  image?: string;
  token?: string;
  clerk_id?: string;
  credits?: {
    amount: number;
  };
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
  user: User;
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
  user: {},
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

// Model definition
export interface StoreModel {
  settings: Settings;
  setSettings: Action<StoreModel, Partial<Settings>>;
  resetSettings: Action<StoreModel>;
  resetSetting: Action<StoreModel, keyof Settings>;
}

function createDefaultSettingsObject(): Settings {
  let defaultSettings = { ...DEFAULT_SETTINGS };
  const currentPlatform = platform();

  const ocrModel =
    currentPlatform === "macos"
      ? "apple-native"
      : currentPlatform === "windows"
      ? "windows-native"
      : "tesseract";

  defaultSettings.ocrEngine = ocrModel;
  defaultSettings.fps = currentPlatform === "macos" ? 0.2 : 1;
  defaultSettings.platform = currentPlatform;

  defaultSettings.ignoredWindows = [
    ...DEFAULT_IGNORED_WINDOWS_IN_ALL_OS,
    ...(DEFAULT_IGNORED_WINDOWS_PER_OS[currentPlatform] ?? []),
  ];

  return defaultSettings;
}

// Create a singleton store instance
let storePromise: Promise<LazyStore> | null = null;

const getStore = async () => {
  if (!storePromise) {
    storePromise = (async () => {
      const dir = await localDataDir();
      return new TauriStore(`${dir}/screenpipe/store.bin`);
    })();
  }
  return storePromise;
};

const tauriStorage: PersistStorage = {
  getItem: async (_key: string) => {
    const tauriStore = await getStore();
    const allKeys = await tauriStore.keys();
    const values: Record<string, any> = {};

    for (const k of allKeys) {
      values[k] = await tauriStore.get(k);
    }

    return { settings: unflattenObject(values) };
  },
  setItem: async (_key: string, value: any) => {
    const tauriStore = await getStore();

    const flattenedValue = flattenObject(value.settings);

    // Delete all existing keys first
    const existingKeys = await tauriStore.keys();
    for (const key of existingKeys) {
      await tauriStore.delete(key);
    }

    // Set new flattened values
    for (const [key, val] of Object.entries(flattenedValue)) {
      await tauriStore.set(key, val);
    }

    await tauriStore.save();
  },
  removeItem: async (_key: string) => {
    const tauriStore = await getStore();
    const keys = await tauriStore.keys();
    for (const key of keys) {
      await tauriStore.delete(key);
    }
    await tauriStore.save();
  },
};

export const store = createStoreEasyPeasy<StoreModel>(
  persist(
    {
      settings: createDefaultSettingsObject(),
      setSettings: action((state, payload) => {
        state.settings = {
          ...state.settings,
          ...payload,
        };
      }),
      resetSettings: action((state) => {
        state.settings = createDefaultSettingsObject();
      }),
      resetSetting: action((state, key) => {
        const defaultValue = createDefaultSettingsObject()[key];
        (state.settings as any)[key] = defaultValue;
      }),
    },
    {
      storage: tauriStorage,
      mergeStrategy: "mergeDeep",
    }
  )
);

const typedHooks = createTypedHooks<StoreModel>();
const useStoreActions = typedHooks.useStoreActions;
const useStoreState = typedHooks.useStoreState;

export function useSettings() {
  const settings = useStoreState((state) => state.settings);
  const setSettings = useStoreActions((actions) => actions.setSettings);
  const resetSettings = useStoreActions((actions) => actions.resetSettings);
  const resetSetting = useStoreActions((actions) => actions.resetSetting);

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
    updateSettings: setSettings,
    resetSettings,
    resetSetting,
    getDataDir,
  };
}
