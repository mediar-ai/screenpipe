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

// Create stores for profiles and settings
let profilesStorePromise: Promise<LazyStore> | null = null;
let storePromises: Record<string, Promise<LazyStore>> = {};

const getProfilesStore = async () => {
  if (!profilesStorePromise) {
    profilesStorePromise = (async () => {
      const dir = await localDataDir();
      return new TauriStore(`${dir}/screenpipe/profiles.bin`);
    })();
  }
  return profilesStorePromise;
};

const getStore = async (profileName: string = "default") => {
  if (!storePromises[profileName]) {
    storePromises[profileName] = (async () => {
      const dir = await localDataDir();
      const fileName =
        profileName === "default" ? "store.bin" : `store-${profileName}.bin`;
      return new TauriStore(`${dir}/screenpipe/${fileName}`);
    })();
  }
  return storePromises[profileName];
};

const tauriStorage: PersistStorage = {
  getItem: async (_key: string) => {
    // Get active profile from profiles store
    const profilesStore = await getProfilesStore();
    const activeProfile =
      ((await profilesStore.get("activeProfile")) as string) || "default";
    const availableProfiles = ((await profilesStore.get(
      "profiles"
    )) as string[]) || ["default"];

    // Get settings from active profile's store
    const tauriStore = await getStore(activeProfile);
    const allKeys = await tauriStore.keys();
    const values: Record<string, any> = {};

    for (const k of allKeys) {
      values[k] = await tauriStore.get(k);
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
    const profilesStore = await getProfilesStore();
    await profilesStore.set("activeProfile", settings.activeProfile);
    await profilesStore.set("profiles", Object.keys(settings.profiles || {}));
    await profilesStore.save();

    // Update active profile's settings
    const tauriStore = await getStore(settings.activeProfile);
    const flattenedValue = flattenObject({
      ...settings,
      profiles: undefined,
      activeProfile: undefined,
    });

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
    storePromises = {};

    // Force reload of settings from the new store file
    const newStore = await getStore(profileName);
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
