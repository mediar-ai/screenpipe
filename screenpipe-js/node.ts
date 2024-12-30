// node.ts
import fs from "fs/promises";
import path from "path";
import os from "os";
import type { Settings, PipeConfig, ParsedConfig, InboxMessage } from "./types";
import { AddressInfo, createServer } from "net";
import type { BrowserPipe } from "./browser";

// Environment detection
const isNode =
  typeof process !== "undefined" &&
  process.versions != null &&
  process.versions.node != null;

function assertNode(functionName: string) {
  if (!isNode) {
    throw new Error(`${functionName} is only available in Node.js environment`);
  }
}

// Helper functions to flatten/unflatten objects
const flattenObject = (obj: any, prefix = ""): Record<string, any> => {
  return Object.keys(obj).reduce((acc: Record<string, any>, k: string) => {
    const pre = prefix.length ? prefix + "." : "";
    if (
      typeof obj[k] === "object" &&
      obj[k] !== null &&
      !Array.isArray(obj[k])
    ) {
      Object.assign(acc, flattenObject(obj[k], pre + k));
    } else {
      acc[pre + k] = obj[k];
    }
    return acc;
  }, {});
};

const unflattenObject = (obj: Record<string, any>): any => {
  const result: any = {};
  for (const key in obj) {
    const keys = key.split(".");
    let current = result;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (i === keys.length - 1) {
        current[k] = obj[key];
      } else {
        current[k] = current[k] || {};
        current = current[k];
      }
    }
  }
  return result;
};

// Helper for dynamic imports
async function requireNodeModule(moduleName: string) {
  if (!isNode) return null;
  try {
    return await import(moduleName);
  } catch (e) {
    console.error(`failed to import ${moduleName}:`, e);
    return null;
  }
}

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
  aiMaxContextChars: 128000,
  user: {},
};

class SettingsManager {
  private settings: Settings;
  private storePath: string;
  private initialized: boolean = false;

  constructor() {
    assertNode("SettingsManager");
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
        baseDir = path.join(home, "Library", "Application Support", "screenpipe");
        break;
      case "linux":
        const xdgData = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
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

class Task {
  private _name: string;
  private _interval: string | number;
  private _time: string | null = null;
  private _handler: (() => Promise<void>) | null = null;
  private _cronTask: any | null = null;

  constructor(name: string) {
    assertNode("Task");
    this._name = name;
    this._interval = 0;
  }

  every(interval: string | number): Task {
    this._interval = interval;
    return this;
  }

  at(time: string): Task {
    this._time = time;
    return this;
  }

  do(handler: () => Promise<void>): Task {
    this._handler = handler;
    return this;
  }

  async schedule(): Promise<void> {
    if (!this._handler) {
      throw new Error(`No handler defined for task: ${this._name}`);
    }

    assertNode("Task.schedule");
    const cron = await requireNodeModule("node-cron");
    const cronExpression = this.toCronExpression();

    this._cronTask = cron.schedule(cronExpression, this._handler, {
      name: this._name,
    });
  }

  stop(): void {
    assertNode("Task.stop");
    return this._cronTask?.stop();
  }

  private toCronExpression(): string {
    if (typeof this._interval === "number") {
      const minutes = Math.floor(this._interval / 60000);
      return `*/${minutes} * * * *`;
    }

    const [value, unit] = this._interval.split(" ");
    switch (unit) {
      case "second":
      case "seconds":
        return `*/${value} * * * * *`;
      case "minute":
      case "minutes":
        return `*/${value} * * * *`;
      case "hour":
      case "hours":
        return `0 */${value} * * *`;
      case "day":
      case "days":
        return `0 0 */${value} * *`;
      default:
        throw new Error(`Unsupported interval unit: ${unit}`);
    }
  }
}

class Scheduler {
  private tasks: Task[] = [];

  constructor() {
    assertNode("Scheduler");
  }

  task(name: string): Task {
    const task = new Task(name);
    this.tasks.push(task);
    return task;
  }

  start() {
    this.tasks.forEach((task) => task.schedule());
  }

  async stop(): Promise<void> {
    assertNode("Scheduler.stop");
    if (isNode) {
      const cron = await requireNodeModule("node-cron");
      cron.getTasks().forEach((task: any) => task.stop());
    }
    this.tasks = [];
  }
}

class InboxManager {
  private actionServerPort?: number;
  private actionServerProcess?: any;

  async send(message: InboxMessage): Promise<boolean> {
    if (!this.actionServerPort) {
      this.actionServerPort = await getAvailablePort();
      if (isNode) {
        const { fork } = await requireNodeModule("child_process");
        this.actionServerProcess = fork("./inbox-server.js", [
          this.actionServerPort.toString(),
        ]);
      }
    }

    if (message.actions) {
      if (!isNode) {
        console.warn("inbox actions are currently not supported in browser");
        return false;
      }
      message.actions = message.actions.map((action) => {
        const actionId = crypto.randomUUID();
        return {
          label: action.label,
          action: actionId,
          port: this.actionServerPort,
          callback: action.callback,
        };
      });
    }

    try {
      const response = await fetch("http://localhost:11435/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...message,
          type: "inbox",
          actionServerPort: this.actionServerPort,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error("failed to send inbox message:", error);
      return false;
    }
  }
}

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

// Re-export browser functionality
export * from "./browser";

// Node-specific pipe implementation
interface NodePipe extends BrowserPipe {
  settings: SettingsManager;
  scheduler: Scheduler;
  inbox: InboxManager;
  loadPipeConfig(): Promise<PipeConfig>;
}

export const pipe: NodePipe = {
  ...require("./browser").pipe,
  settings: new SettingsManager(),
  scheduler: new Scheduler(),
  inbox: new InboxManager(),
  async loadPipeConfig(): Promise<PipeConfig> {
    try {
      const baseDir = process.env.SCREENPIPE_DIR || process.cwd();
      const pipeId = process.env.PIPE_ID || path.basename(process.cwd());
      const configPath = `${baseDir}/pipes/${pipeId}/pipe.json`;

      const configContent = await fs.readFile(configPath, "utf8");
      const parsedConfig: ParsedConfig = JSON.parse(configContent);
      const config: PipeConfig = {};
      parsedConfig.fields.forEach((field) => {
        config[field.name] =
          field.value !== undefined ? field.value : field.default;
      });
      return config;
    } catch (error) {
      console.error("error loading pipe.json:", error);
      return {};
    }
  },
};
