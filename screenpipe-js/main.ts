import * as fs from "node:fs";
import cron, { type ScheduledTask } from "node-cron";
import express, { Request, Response, NextFunction } from "express";

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
export type ContentType = "ocr" | "audio" | "all";

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
}

/**
 * Structure of Full Text Search content.
 */
export interface FTSContent {
  textId: number;
  matchedText: string;
  frameId: number;
  timestamp: string;
  appName: string;
  windowName: string;
  filePath: string;
  originalFrameText?: string;
  tags: string[];
}

/**
 * Union type for different types of content items.
 */
export type ContentItem =
  | { type: "OCR"; content: OCRContent }
  | { type: "Audio"; content: AudioContent }
  | { type: "FTS"; content: FTSContent };

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

export async function sendDesktopNotification(
  options: NotificationOptions
): Promise<boolean> {
  const notificationApiUrl =
    process.env.SCREENPIPE_SERVER_URL || "http://localhost:11435";
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

export function loadPipeConfig(): PipeConfig {
  try {
    const configPath = `${process.env.SCREENPIPE_DIR}/pipes/${process.env.PIPE_ID}/pipe.json`;
    const configContent = fs.readFileSync(configPath, "utf8");
    const parsedConfig: ParsedConfig = JSON.parse(configContent);
    const config: PipeConfig = {};
    parsedConfig.fields.forEach((field) => {
      config[field.name] =
        field.value !== undefined ? field.value : field.default;
    });
    return config;
  } catch (error) {
    console.error("Error loading pipe.json:", error);
    return {};
  }
}

export async function queryScreenpipe(
  params: ScreenpipeQueryParams
): Promise<ScreenpipeResponse | null> {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      const snakeKey = toSnakeCase(key);
      queryParams.append(snakeKey, value.toString());
    }
  });

  const url = `http://localhost:3030/search?${queryParams}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return convertToCamelCase(data) as ScreenpipeResponse;
  } catch (error) {
    console.error("error querying screenpipe:", error);
    return null;
  }
}

export function extractJsonFromLlmResponse(response: string): any {
  let cleaned = response.replace(/^```(?:json)?\s*|\s*```$/g, "");
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  cleaned = cleaned.replace(/^[^{]*/, "").replace(/[^}]*$/, "");
  cleaned = cleaned.replace(/\\n/g, "").replace(/\n/g, "");
  cleaned = cleaned.replace(/"(\\"|[^"])*"/g, (match) => {
    return match.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  });

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.warn("failed to parse json:", error);
    cleaned = cleaned
      .replace(/,\s*}/g, "}")
      .replace(/'/g, '"')
      .replace(/(\w+):/g, '"$1":')
      .replace(/:\s*'([^']*)'/g, ': "$1"')
      .replace(/\\"/g, '"')
      .replace(/"{/g, '{"')
      .replace(/}"/g, '"}');

    try {
      return JSON.parse(cleaned);
    } catch (secondError) {
      console.warn("failed to parse json after attempted fixes:", secondError);
      throw new Error("invalid json format in llm response");
    }
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

class Task {
  private _name: string;
  private _interval: string | number;
  private _time: string | null = null;
  private _handler: (() => Promise<void>) | null = null;
  private _cronTask: ScheduledTask | null = null;

  constructor(name: string) {
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

  schedule(): void {
    if (!this._handler) {
      throw new Error(`No handler defined for task: ${this._name}`);
    }

    const cronExpression = this.toCronExpression();

    this._cronTask = cron.schedule(cronExpression, this._handler, {
      name: this._name,
    });
  }

  stop(): void {
    return this._cronTask!.stop();
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

  task(name: string): Task {
    const task = new Task(name);
    this.tasks.push(task);
    return task;
  }

  start() {
    this.tasks.forEach((task) => task.schedule());
  }

  stop(): void {
    cron.getTasks().forEach((task) => task.stop());
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
  private actionServer?: express.Express;

  async send(message: InboxMessage): Promise<boolean> {
    // Ensure action server is running and we have a port
    if (!this.actionServerPort) {
      this.actionServerPort = await getAvailablePort();
      this.actionServer = await this.startActionServer();
    }

    // Generate unique IDs for actions and store their callbacks
    if (message.actions) {
      message.actions = message.actions.map((action) => {
        const actionId = crypto.randomUUID();
        actionCallbacks.set(actionId, action.callback);
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

  private async startActionServer(): Promise<express.Express> {
    const app = express();
    app.use(express.json());

    // Add CORS middleware
    app.use((req: Request, res: Response, next: NextFunction): void => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.sendStatus(200);
        return;
      }
      next();
    });

    app.post("/action", (req, res) => {
      const { action } = req.body as ActionResponse;
      const callback = actionCallbacks.get(action);
      if (callback) {
        callback()
          .then(() => {
            res.json({ success: true });
            actionCallbacks.delete(action);
          })
          .catch((error) => {
            console.error("action callback failed:", error);
            res.status(500).json({ success: false, error: error.message });
          });
      } else {
        res.status(404).json({ success: false, error: "action not found" });
      }
    });

    return new Promise((resolve) => {
      app.listen(this.actionServerPort, () => {
        console.log(`action server listening on port ${this.actionServerPort}`);
        resolve(app);
      });
    });
  }
}

// Remove the startActionServer from pipe object since it's now handled by InboxManager
export const pipe = {
  /**
   * Send a desktop notification to the user.
   *
   * @example
   * ```typescript
   * pipe.sendDesktopNotification({ title: "Task Completed", body: "Your task has been completed." });
   * ```
   */
  sendDesktopNotification,
  /**
   * Load the pipe configuration that can be set through the screenpipe app or the pipe.json file.
   *
   * @example
   * ```typescript
   * pipe.loadPipeConfig();
   * ```
   */
  loadPipeConfig,
  /**
   * Query the screenpipe API.
   *
   * @example
   * ```typescript
   * pipe.queryScreenpipe({ q: "squirrel", contentType: "ocr", limit: 10 });
   * ```
   */
  queryScreenpipe,
  /**
   * Send a notification to the user's AI inbox.
   *
   * @example
   * ```typescript
   * pipe.inbox.send({ title: "Task Completed", body: "Your task has been completed." });
   * ```
   *
   * or with actions:
   * ```typescript
   * pipe.inbox.send({ title: "Task Completed", body: "Your task has been completed.", actions: [{ id: "view", label: "view details", callback: async () => { console.log("viewing details"); } }] });
   * ```
   */
  inbox: new InboxManager(),
  /**
   * Scheduler for running tasks at specific times or intervals.
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
  scheduler: new Scheduler(),
  /**
   * Experimental input control methods.
   * Use with caution as these directly manipulate input devices.
   */
  input: {
    /**
     * Simulate typing text.
     * @example
     * pipe.input.type("Hello, Screenpipe!");
     */
    type: (text: string): Promise<boolean> => {
      return sendInputControl({ type: "WriteText", data: text });
    },

    /**
     * Simulate a key press.
     * @example
     * pipe.input.press("enter");
     */
    press: (key: string): Promise<boolean> => {
      return sendInputControl({ type: "KeyPress", data: key });
    },

    /**
     * Move the mouse to absolute coordinates.
     * @example
     * pipe.input.moveMouse(100, 200);
     */
    moveMouse: (x: number, y: number): Promise<boolean> => {
      return sendInputControl({ type: "MouseMove", data: { x, y } });
    },

    /**
     * Simulate a mouse click.
     * @example
     * pipe.input.click("left");
     */
    click: (button: "left" | "right" | "middle"): Promise<boolean> => {
      return sendInputControl({ type: "MouseClick", data: button });
    },
  },
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
