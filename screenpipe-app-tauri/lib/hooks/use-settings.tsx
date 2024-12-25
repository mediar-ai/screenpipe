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
import { invoke } from "@tauri-apps/api/core";

declare global {
  interface Window {
    __TAURI_ENV__: {
      LOCAL_DATA: string;
      HOME: string;
      PLATFORM: string;
    };
  }
}

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
  START_RECORDING = "start_recording",
  STOP_RECORDING = "stop_recording",
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
  isFirstTimeUser: boolean;
  enableFrameCache: boolean; // Add this line
  enableUiMonitoring: boolean; // Add this line
  platform: string; // Add this line
  disabledShortcuts: Shortcut[];
  user: User;
  showScreenpipeShortcut: string;
  startRecordingShortcut: string;
  stopRecordingShortcut: string;
  activeProfile: string;
  profiles?: { [key: string]: Settings };
};

const DEFAULT_SETTINGS_BASE: Settings = {
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
  isFirstTimeUser: true,
  enableFrameCache: true, // Add this line
  enableUiMonitoring: false, // Change from true to false
  platform: "unknown", // Add this line
  disabledShortcuts: [],
  user: {},
  showScreenpipeShortcut: "Super+Alt+S",
  startRecordingShortcut: "Super+Alt+R",
  stopRecordingShortcut: "Super+Alt+X",
  activeProfile: "default",
};

const DEFAULT_SETTINGS: Settings & { profiles: { default: Settings } } = {
  ...DEFAULT_SETTINGS_BASE,
  profiles: {
    default: DEFAULT_SETTINGS_BASE,
  },
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

function createDefaultSettingsObject(): Settings & {
  profiles: { default: Settings };
} {
  let defaultSettings = { ...DEFAULT_SETTINGS };
  try {
    const currentPlatform = platform();

    const ocrModel =
      currentPlatform === "macos"
        ? "apple-native"
        : currentPlatform === "windows"
        ? "windows-native"
        : "tesseract";

    defaultSettings.ocrEngine = ocrModel;
    defaultSettings.fps = currentPlatform === "macos" ? 0.5 : 1;
    defaultSettings.platform = currentPlatform;

    defaultSettings.ignoredWindows = [
      ...DEFAULT_IGNORED_WINDOWS_IN_ALL_OS,
      ...(DEFAULT_IGNORED_WINDOWS_PER_OS[currentPlatform] ?? []),
    ];

    return defaultSettings;
  } catch (e) {
    console.error("failed to get platform", e);
    return DEFAULT_SETTINGS;
  }
}

// Replace async stores with sync versions
let profilesStore: LazyStore | null = null;
let stores: Record<string, LazyStore> = {};

const getProfilesStore = () => {
  if (!profilesStore) {
    profilesStore = new TauriStore(
      `${window.__TAURI_ENV__.LOCAL_DATA}/screenpipe/profiles.bin`
    );
  }
  return profilesStore;
};

const getStore = (profileName: string = "default") => {
  if (!stores[profileName]) {
    const fileName =
      profileName === "default" ? "store.bin" : `store-${profileName}.bin`;
    stores[profileName] = new TauriStore(
      `${window.__TAURI_ENV__.LOCAL_DATA}/screenpipe/${fileName}`
    );
  }
  return stores[profileName];
};

const tauriStorage: PersistStorage = {
  getItem: async (_key: string) => {
    // Get active profile from profiles store
    const profilesStore = getProfilesStore();

    const activeProfile =
      (profilesStore.get("activeProfile") as unknown as string) || "default";
    const availableProfiles = (profilesStore.get(
      "profiles"
    ) as unknown as string[]) || ["default"];

    // Get settings from active profile's store
    const tauriStore = getStore(activeProfile);
    const values: Record<string, any> = {};

    const keys = await tauriStore.keys();
    for (const k of keys) {
      values[k] = tauriStore.get(k);
    }

    return {
      settings: {
        ...unflattenObject(values),
        activeProfile,
        profiles: Object.fromEntries(availableProfiles.map((p) => [p, {}])),
      },
    };
  },

  setItem: async (_key: string, value: any) => {
    const { settings } = value;

    // Update profiles metadata
    const profilesStore = getProfilesStore();
    profilesStore.set("activeProfile", settings.activeProfile);
    profilesStore.set("profiles", Object.keys(settings.profiles || {}));
    profilesStore.save();

    // Update active profile's settings
    const tauriStore = getStore(settings.activeProfile);
    const flattenedValue = flattenObject({
      ...settings,
      profiles: undefined,
      activeProfile: undefined,
    });

    for (const [key, val] of Object.entries(flattenedValue)) {
      tauriStore.set(key, val);
    }

    tauriStore.save();
  },

  removeItem: async (_key: string) => {
    const tauriStore = getStore();
    const keys = await tauriStore.keys();
    for (const key of keys) {
      tauriStore.delete(key);
    }
    tauriStore.save();
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

  const switchProfile = async (profileName: string) => {
    // If profile doesn't exist, create it
    if (!settings.profiles?.[profileName]) {
      // Create new profile based on current settings
      const newProfileData = { ...settings } as Partial<Settings>;
      // Now TypeScript knows all properties are optional
      delete newProfileData.profiles;
      delete newProfileData.activeProfile;

      setSettings({
        ...settings,
        activeProfile: profileName,
        profiles: {
          ...settings.profiles,
          [profileName]: newProfileData as Settings,
        },
      });
      return;
    }

    // Switch to existing profile
    setSettings({
      // Load the profile's settings
      ...settings.profiles[profileName],
      // Keep the profiles data
      profiles: settings.profiles,
      // Update active profile
      activeProfile: profileName,
    });

    // Clear store cache to force fresh read from new profile's file
    stores = {};

    // Force reload of settings from the new store file
    const newStore = getStore(profileName);
    const allKeys = await newStore.keys();
    const values: Record<string, any> = {};

    for (const k of allKeys) {
      values[k] = await newStore.get(k);
    }

    setSettings({
      ...unflattenObject(values),
      activeProfile: profileName,
      profiles: settings.profiles,
    });
  };

  const deleteProfile = (profileName: string) => {
    if (profileName === "default") {
      console.warn("Cannot delete default profile");
      return;
    }

    const newProfiles = { ...settings.profiles };
    delete newProfiles[profileName];

    // If we're deleting the active profile, switch back to default
    if (settings.activeProfile === profileName) {
      setSettings({
        ...settings.profiles?.default,
        profiles: newProfiles,
        activeProfile: "default",
      });
    } else {
      // Otherwise just update the profiles list
      setSettings({
        ...settings,
        profiles: newProfiles,
      });
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

    let p = "macos";
    try {
      p = platform();
    } catch (e) {
      console.error("failed to get platform", e);
    }

    return p === "macos" || p === "linux"
      ? `${homeDirPath}/.screenpipe`
      : `${homeDirPath}\\.screenpipe`;
  };

  return {
    settings,
    updateSettings: setSettings,
    resetSettings,
    resetSetting,
    getDataDir,
    switchProfile,
    deleteProfile,
  };
}
