import * as fs from "node:fs";
import process from "node:process";
import cronParser from "npm:cron-parser";

// Type definitions
export interface PipeConfig {
  [key: string]: any;
}

export interface NotificationOptions {
  title: string;
  body: string;
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
}

class Task {
  private _name: string;
  private _interval: string | number;
  private _time: string | null = null;
  private _handler: (() => Promise<void>) | null = null;
  private _nextRunTime: Date;

  constructor(name: string) {
    this._name = name;
    this._interval = 0;
    this._nextRunTime = new Date(0); // Set to past date to run immediately
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

  getNextRunTime(): Date {
    return this._nextRunTime;
  }

  async execute(): Promise<void> {
    if (this._handler) {
      await this._handler();
      this._nextRunTime = this.calculateNextRunTime();
    }
  }

  private calculateNextRunTime(): Date {
    const now = new Date();
    if (typeof this._interval === "number") {
      return new Date(now.getTime() + this._interval);
    }

    const cronExpression = this.toCronExpression();
    const interval = cronParser.parseExpression(cronExpression);
    return interval.next().toDate();
  }

  private toCronExpression(): string {
    if (typeof this._interval === "number") {
      // Convert milliseconds to minutes for cron
      const minutes = Math.floor(this._interval / 60000);
      return `*/${minutes} * * * *`;
    }

    const [value, unit] = this._interval.split(" ");
    switch (unit) {
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

  getName(): string {
    return this._name;
  }
}

class Scheduler {
  private tasks: Task[] = [];
  private running: boolean = false;

  task(name: string): Task {
    const task = new Task(name);
    this.tasks.push(task);
    return task;
  }

  async start(): Promise<void> {
    this.running = true;
    while (this.running) {
      const now = new Date();
      console.log(`Current time: ${now.toISOString()}`);
      console.log(`Tasks: ${this.tasks.map((t) => t.getName()).join(", ")}`);

      for (const task of this.tasks) {
        if (task.getNextRunTime() <= now) {
          console.log(
            `Executing task: ${task.getName()} at ${now.toISOString()}`
          );
          await task.execute();
          console.log(
            `Task ${task.getName()} executed, next run time: ${task
              .getNextRunTime()
              .toISOString()}`
          );
        } else {
          console.log(
            `Task ${task.getName()} not due yet. Next run time: ${task
              .getNextRunTime()
              .toISOString()}`
          );
        }
      }

      await this.sleep(100); // Check more frequently
    }
  }

  stop(): void {
    this.running = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * The pipe object is used to interact with the screenpipe higher level functions.
 *
 */
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
   */
  inbox: {
    send: async (message: InboxMessage): Promise<boolean> => {
      const notificationApiUrl =
        process.env.SCREENPIPE_SERVER_URL || "http://localhost:11435";
      try {
        const response = await fetch(`${notificationApiUrl}/inbox`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...message, type: "inbox" }),
        });
        return response.ok;
      } catch (error) {
        console.error("failed to send inbox message:", error);
        return false;
      }
    },
  },
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
};
