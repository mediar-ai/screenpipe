import { platform } from "@tauri-apps/plugin-os";
import { SettingsType } from "../types/settings";

const DEFAULT_SETTINGS: SettingsType = {
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
  withAi: false,
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
  aiMaxContextChars: 512000,
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

const OCR_MODEL_PER_OS: Record<string, string> = {
    macos: 'apple-native',
    windows: 'windows-native',
}

export function getDefaultSettings(platform: string): SettingsType {
    let defaultSettings = { ...DEFAULT_SETTINGS };
    try {
      const ocrModel =
        OCR_MODEL_PER_OS[platform]
          ? OCR_MODEL_PER_OS[platform]
          : "tesseract";
  
      defaultSettings.ocrEngine = ocrModel;
      defaultSettings.fps = platform === "macos" ? 0.5 : 1;
      defaultSettings.platform = platform;
  
      defaultSettings.ignoredWindows = [
        ...DEFAULT_IGNORED_WINDOWS_IN_ALL_OS,
        ...(DEFAULT_IGNORED_WINDOWS_PER_OS[platform] ?? []),
      ];
  
      return defaultSettings;
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
}

export function tauriGetDefaultSettings() {
    const currentPlatform = platform()
    return getDefaultSettings(currentPlatform)
}