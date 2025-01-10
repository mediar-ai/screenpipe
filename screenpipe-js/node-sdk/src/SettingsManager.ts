import fs from "fs/promises";
import path from "path";
import os from "os";
import { flattenObject, unflattenObject } from "../../common/utils";
import type { Settings } from "../../common/types";

const DEFAULT_SETTINGS: Settings = {
  openaiApiKey: "",
  deepgramApiKey: "",
  aiModel: "gpt-4",
  aiUrl: "https://api.openai.com/v1",
  customPrompt: `Rules:
  - You can analyze/view/show/access videos to the user by putting .mp4 files in a code block (we'll render it) like this: \`/users/video.mp4\`, use the exact, absolute, file path from file_path property
  - Do not try to embed video in links (e.g. [](.mp4) or https://.mp4) instead put the file_path in a code block using backticks
  - Do not put video in multiline code block it will not render the video (e.g. \`\`\`bash\n.mp4\`\`\` IS WRONG) instead using inline code block with single backtick
  - Always answer my question/intent, do not make up things`,
  port: 3030,
  dataDir: "default",
  disableAudio: false,
  ignoredWindows: [],
  includedWindows: [],
  aiProviderType: "openai",
  embeddedLLM: {
    enabled: false,
    model: "llama3.2:1b-instruct-q4_K_M",
    port: 11438,
  },
  enableFrameCache: true,
  enableUiMonitoring: false,
  aiMaxContextChars: 512000,
  user: {},
  analyticsEnabled: true,
};

export class SettingsManager {
  private settings: Settings;
  private storePath: string;
  private initialized: boolean = false;

  constructor() {
    this.settings = DEFAULT_SETTINGS;
    this.storePath = ""; // will be set in init()
  }

  private async getStorePath(): Promise<string> {
    const platform = process.platform;
    const home = os.homedir();

    // Get base screenpipe data directory path based on platform
    let baseDir: string;
    switch (platform) {
      case "darwin":
        baseDir = path.join(
          home,
          "Library",
          "Application Support",
          "screenpipe"
        );
        break;
      case "linux":
        const xdgData =
          process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
        baseDir = path.join(xdgData, "screenpipe");
        break;
      case "win32":
        baseDir = path.join(
          process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"),
          "screenpipe"
        );
        break;
      default:
        throw new Error(`unsupported platform: ${platform}`);
    }

    // First check profiles.bin to get active profile
    const profilesPath = path.join(baseDir, "profiles.bin");
    let activeProfile = "default";
    try {
      const profilesData = await fs.readFile(profilesPath);
      const profiles = JSON.parse(profilesData.toString());
      if (profiles.activeProfile) {
        activeProfile = profiles.activeProfile;
      }
    } catch (error) {
      // Profiles file doesn't exist yet, use default
    }

    // Return store path for active profile
    return activeProfile === "default"
      ? path.join(baseDir, "store.bin")
      : path.join(baseDir, `store-${activeProfile}.bin`);
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    if (!fs || !path) throw new Error("failed to load required modules");

    this.storePath = await this.getStorePath();

    try {
      await fs.mkdir(path.dirname(this.storePath), { recursive: true });
      const data = await fs.readFile(this.storePath);
      const rawSettings = JSON.parse(data.toString());
      this.settings = { ...DEFAULT_SETTINGS, ...unflattenObject(rawSettings) };
      this.initialized = true;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        await this.save();
        this.initialized = true;
      } else {
        throw error;
      }
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    const flattenedSettings = flattenObject(this.settings);
    await fs.writeFile(
      this.storePath,
      JSON.stringify(flattenedSettings, null, 2)
    );
  }

  async get<K extends keyof Settings>(key: K): Promise<Settings[K]> {
    if (!this.initialized) await this.init();
    return this.settings[key];
  }

  async set<K extends keyof Settings>(
    key: K,
    value: Settings[K]
  ): Promise<void> {
    if (!this.initialized) await this.init();
    this.settings[key] = value;
    await this.save();
  }

  async getAll(): Promise<Settings> {
    await this.init();
    return { ...this.settings };
  }

  async update(newSettings: Partial<Settings>): Promise<void> {
    if (!this.initialized) await this.init();
    this.settings = { ...this.settings, ...newSettings };
    await this.save();
  }

  async reset(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS };
    await this.save();
  }

  async resetKey<K extends keyof Settings>(key: K): Promise<void> {
    if (!this.initialized) await this.init();
    this.settings[key] = DEFAULT_SETTINGS[key];
    await this.save();
  }

  async getCustomSetting(namespace: string, key: string): Promise<any> {
    if (!this.initialized) await this.init();
    return this.settings.customSettings?.[namespace]?.[key];
  }

  async setCustomSetting(
    namespace: string,
    key: string,
    value: any
  ): Promise<void> {
    if (!this.initialized) await this.init();
    this.settings.customSettings = this.settings.customSettings || {};
    this.settings.customSettings[namespace] =
      this.settings.customSettings[namespace] || {};
    this.settings.customSettings[namespace][key] = value;
    await this.save();
  }

  async getNamespaceSettings(
    namespace: string
  ): Promise<Record<string, any> | undefined> {
    if (!this.initialized) await this.init();
    return this.settings.customSettings?.[namespace];
  }

  async updateNamespaceSettings(
    namespace: string,
    settings: Record<string, any>
  ): Promise<void> {
    if (!this.initialized) await this.init();
    this.settings.customSettings = this.settings.customSettings || {};
    this.settings.customSettings[namespace] = settings;
    await this.save();
  }
}
