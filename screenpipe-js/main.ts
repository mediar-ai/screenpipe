// Environment detection
const isNode = typeof process !== 'undefined' && 
  process.versions != null && 
  process.versions.node != null;


function assertNode(functionName: string) {
  if (!isNode) {
    throw new Error(`${functionName} is only available in Node.js environment`);
  }
}

// create a helper for dynamic imports
async function requireNodeModule(moduleName: string) {
  if (!isNode) return null;
  try {
    return await import(moduleName);
  } catch (e) {
    console.error(`failed to import ${moduleName}:`, e);
    return null;
  }
}

// Type definitions
export interface PipeConfig {
  [key: string]: any;
}

export interface NotificationOptions {
  title: string;
  body: string;
  actions?: NotificationAction[];
  timeout?: number; // in milliseconds
  persistent?: boolean;
}

/**
 * Types of content that can be queried in Screenpipe.
 */
export type ContentType = 
  | "all"
  | "ocr"
  | "audio"
  | "ui"
  | "audio+ui"
  | "ocr+ui"
  | "audio+ocr";

/**
 * Parameters for querying Screenpipe.
 */
export interface ScreenpipeQueryParams {
  q?: string;
  contentType?: ContentType;
  limit?: number;
  offset?: number;
  startTime?: string;
  endTime?: string;
  appName?: string;
  windowName?: string;
  includeFrames?: boolean;
  minLength?: number;
  maxLength?: number;
  speakerIds?: number[];
}

/**
 * Structure of OCR (Optical Character Recognition) content.
 */
export interface OCRContent {
  frameId: number;
  text: string;
  timestamp: string;
  filePath: string;
  offsetIndex: number;
  appName: string;
  windowName: string;
  tags: string[];
  frame?: string;
}

/**
 * Structure of audio content.
 */
export interface AudioContent {
  chunkId: number;
  transcription: string;
  timestamp: string;
  filePath: string;
  offsetIndex: number;
  tags: string[];
  deviceName: string;
  deviceType: string;
  speaker?: Speaker;
}


/**
 * Structure of UI content.
 */
export interface UiContent {
  id: number;
  text: string;
  timestamp: string;
  appName: string;
  windowName: string;
  initialTraversalAt?: string;
  filePath: string;
  offsetIndex: number;
}

/**
 * Speaker information
 */
export interface Speaker {
  id: number;
  name?: string;
  metadata?: string;
}

/**
 * Union type for different types of content items.
 */
export type ContentItem =
  | { type: "OCR"; content: OCRContent }
  | { type: "Audio"; content: AudioContent }
  | { type: "UI"; content: UiContent };

/**
 * Pagination information for search results.
 */
export interface PaginationInfo {
  limit: number;
  offset: number;
  total: number;
}

/**
 * Structure of the response from a Screenpipe query.
 */
export interface ScreenpipeResponse {
  data: ContentItem[];
  pagination: PaginationInfo;
}

/**
 * Parsed config
 */
export interface ParsedConfig<T = unknown> {
  fields: {
    name: string;
    value?: T;
    default?: T;
  }[];
}

// Types from the original settings
export type VadSensitivity = "low" | "medium" | "high";
export type AIProviderType =
  | "native-ollama"
  | "openai"
  | "custom"
  | "embedded"
  | "screenpipe-cloud";

export interface EmbeddedLLMConfig {
  enabled: boolean;
  model: string;
  port: number;
}

export interface Settings {
  openaiApiKey: string;
  deepgramApiKey: string;
  aiModel: string;
  aiUrl: string;
  customPrompt: string;
  port: number;
  dataDir: string;
  disableAudio: boolean;
  ignoredWindows: string[];
  includedWindows: string[];
  aiProviderType: AIProviderType;
  embeddedLLM: EmbeddedLLMConfig;
  enableFrameCache: boolean;
  enableUiMonitoring: boolean;
  aiMaxContextChars: number;
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
};

/**
 * Settings Manager for Screenpipe configuration.
 * Works in: Node.js only
 */
class SettingsManager {
  private settings: Settings;
  private storePath: string;
  private initialized: boolean = false;

  constructor() {
    assertNode('SettingsManager');
    this.settings = DEFAULT_SETTINGS;
    this.storePath = ''; // will be set in init()
  }

  private async getStorePath(): Promise<string> {
    const os = await requireNodeModule('os');
    const path = await requireNodeModule('path');
    if (!os || !path) throw new Error('failed to load required modules');

    const platform = process.platform;
    const home = os.homedir();

    switch (platform) {
      case "darwin":
        return path.join(home, "Library", "Application Support", "screenpipe", "store.bin");
      case "linux":
        const xdgData = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
        return path.join(xdgData, "screenpipe", "store.bin");
      case "win32":
        return path.join(
          process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"),
          "screenpipe",
          "store.bin"
        );
      default:
        throw new Error(`unsupported platform: ${platform}`);
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    const fs = await requireNodeModule('fs/promises');
    const path = await requireNodeModule('path');
    if (!fs || !path) throw new Error('failed to load required modules');

    this.storePath = await this.getStorePath();

    try {
      await fs.mkdir(path.dirname(this.storePath), { recursive: true });
      const data = await fs.readFile(this.storePath);
      this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data.toString()) };
      this.initialized = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await this.save();
        this.initialized = true;
      } else {
        throw error;
      }
    }
  }

  async save(): Promise<void> {
    const fs = await requireNodeModule('fs/promises');
    const path = await requireNodeModule('path');
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    await fs.writeFile(this.storePath, JSON.stringify(this.settings, null, 2));
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
    if (!this.initialized) await this.init();
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
}

/**
 * Utility function to convert snake_case to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace("-", "").replace("_", "")
  );
}

/**
 * Function to recursively convert object keys from snake_case to camelCase
 */
function convertToCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertToCamelCase);
  } else if (obj !== null && typeof obj === "object") {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = toCamelCase(key);
      result[camelKey] = convertToCamelCase(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

/**
 * Function to convert camelCase to snake_case
 */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Send a desktop notification to the user.
 * Works in: Both Browser and Node.js
 * 
 * @example
 * ```typescript
 * pipe.sendDesktopNotification({ title: "Task Completed", body: "Your task has been completed." });
 * ```
 */
export async function sendDesktopNotification(
  options: NotificationOptions
): Promise<boolean> {
  const notificationApiUrl = process.env.SCREENPIPE_SERVER_URL || "http://localhost:11435";
  try {
    await fetch(`${notificationApiUrl}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    return true;
  } catch (error) {
    console.error("Failed to send notification:", error);
    return false;
  }
}

/**
 * Load the pipe configuration that can be set through the screenpipe app or the pipe.json file.
 * Works in: Node.js only
 * 
 * @example
 * ```typescript
 * pipe.loadPipeConfig();
 * ```
 */
export function loadPipeConfig(): PipeConfig {
  assertNode('loadPipeConfig');
  try {
    const fs = require('fs');
    const path = require('path');
    const baseDir = process.env.SCREENPIPE_DIR || process.cwd();
    const pipeId = process.env.PIPE_ID || path.basename(process.cwd());
    const configPath = `${baseDir}/pipes/${pipeId}/pipe.json`;

    const configContent = fs.readFileSync(configPath, "utf8");
    const parsedConfig: ParsedConfig = JSON.parse(configContent);
    const config: PipeConfig = {};
    parsedConfig.fields.forEach((field) => {
      config[field.name] = field.value !== undefined ? field.value : field.default;
    });
    return config;
  } catch (error) {
    console.error("Error loading pipe.json:", error);
    return {};
  }
}

/**
 * Query the screenpipe API.
 * Works in: Both Browser and Node.js
 * 
 * @example
 * ```typescript
 * pipe.queryScreenpipe({ q: "squirrel", contentType: "ocr", limit: 10 });
 * ```
 */
export async function queryScreenpipe(
  params: ScreenpipeQueryParams
): Promise<ScreenpipeResponse | null> {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      if (key === 'speakerIds' && Array.isArray(value)) {
        // Convert speaker IDs array to comma-separated string
        queryParams.append(toSnakeCase(key), value.join(','));
      } else {
        const snakeKey = toSnakeCase(key);
        queryParams.append(snakeKey, value.toString());
      }
    }
  });

  const url = `http://localhost:3030/search?${queryParams}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
        console.error("screenpipe api error:", {
          status: response.status,
          error: errorJson,
        });
      } catch {
        console.error("screenpipe api error:", {
          status: response.status,
          error: errorText,
        });
      }
      throw new Error(`http error! status: ${response.status}`);
    }
    const data = await response.json();
    return convertToCamelCase(data) as ScreenpipeResponse;
  } catch (error) {
    console.error("error querying screenpipe:", error);
    return null;
  }
}

export interface InboxMessage {
  title: string;
  body: string;
  actions?: InboxMessageAction[];
}

export interface InboxMessageAction {
  label: string;
  action: string;
  callback: () => Promise<void>;
}

type ScheduledTask = any;

class Task {
  private _name: string;
  private _interval: string | number;
  private _time: string | null = null;
  private _handler: (() => Promise<void>) | null = null;
  private _cronTask: ScheduledTask | null = null;

  constructor(name: string) {
    assertNode('Task');
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

    assertNode('Task.schedule');
    const cron = await requireNodeModule('node-cron');
    const cronExpression = this.toCronExpression();

    this._cronTask = cron.schedule(cronExpression, this._handler, {
      name: this._name,
    });
  }

  stop(): void {
    assertNode('Task.stop');
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

/**
 * Scheduler for running tasks at specific times or intervals.
 * Works in: Node.js only
 * 
 * @example
 * ```typescript
 * pipe.scheduler.task("dailyReport")
 *   .every("1 day")
 *   .at("00:00")
 *   .do(async () => {
 *     console.log("running daily report");
 *   });
 * 
 * pipe.scheduler.task("everyFiveMinutes")
 *   .every("5 minutes")
 *   .do(async () => {
 *     console.log("running task every 5 minutes");
 *   });
 * 
 * pipe.scheduler.start();
 * ```
 */
class Scheduler {
  private tasks: Task[] = [];

  constructor() {
    assertNode('Scheduler');
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
    assertNode('Scheduler.stop');
    if (isNode) {
      const cron = await requireNodeModule('node-cron');
      cron.getTasks().forEach((task: any) => task.stop());
    }
    this.tasks = [];
  }
}

export type InputAction =
  | { type: "WriteText"; data: string }
  | { type: "KeyPress"; data: string }
  | { type: "MouseMove"; data: { x: number; y: number } }
  | { type: "MouseClick"; data: "left" | "right" | "middle" };

interface InputControlResponse {
  success: boolean;
}

// Add this type for action responses
interface ActionResponse {
  action: string;
}

// Keep track of action callbacks
const actionCallbacks = new Map<string, () => Promise<void>>();

// Add this function to find an available port
async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = require("net").createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

export class InboxManager {
  private actionServerPort?: number;
  private actionServerProcess?: any;

  async send(message: InboxMessage): Promise<boolean> {
    if (!this.actionServerPort) {
      this.actionServerPort = await getAvailablePort();
      // spawn the server as a separate process
      if (isNode) {
        const { fork } = await requireNodeModule('child_process');
        this.actionServerProcess = fork('./inbox-server.js', [this.actionServerPort.toString()]);
      }
    }

    // Generate unique IDs for actions and store their callbacks
    if (message.actions) {
      if (!isNode) {
        console.warn('inbox actions are currently not supported in browser');
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

/**
 * Input control methods for simulating user input.
 * Works in: Both Browser and Node.js
 * 
 * @example
 * ```typescript
 * // Type text
 * pipe.input.type("Hello, Screenpipe!");
 * 
 * // Press a key
 * pipe.input.press("enter");
 * 
 * // Move mouse
 * pipe.input.moveMouse(100, 200);
 * 
 * // Click
 * pipe.input.click("left");
 * ```
 */
const input = {
  // ... existing implementation
}

/**
 * Main Screenpipe API object.
 * Different methods work in different environments as documented above.
 * 
 * @example
 * ```typescript
 * // Works in both Browser and Node.js
 * await pipe.sendDesktopNotification({ title: "Hello", body: "World" });
 * 
 * // Works only in Node.js
 * const config = pipe.loadPipeConfig();
 * ```
 */
export const pipe = {
  sendDesktopNotification,
  loadPipeConfig,
  queryScreenpipe,
  inbox: new InboxManager(),
  scheduler: isNode ? new Scheduler() : undefined,
  input: {
    type: (text: string) => sendInputControl({ type: "WriteText", data: text }),
    press: (key: string) => sendInputControl({ type: "KeyPress", data: key }),
    moveMouse: (x: number, y: number) => 
      sendInputControl({ type: "MouseMove", data: { x, y } }),
    click: (button: "left" | "right" | "middle") => 
      sendInputControl({ type: "MouseClick", data: button }),
  },
  settings: isNode ? new SettingsManager() : undefined,
};

async function sendInputControl(action: InputAction): Promise<boolean> {
  const apiUrl = process.env.SCREENPIPE_SERVER_URL || "http://localhost:3030";
  try {
    const response = await fetch(`${apiUrl}/experimental/input_control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: InputControlResponse = await response.json();
    return data.success;
  } catch (error) {
    console.error("failed to control input:", error);
    return false;
  }
}

export interface NotificationAction {
  id: string;
  label: string;
  callback?: () => Promise<void>;
}
