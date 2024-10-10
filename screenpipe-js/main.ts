import * as fs from "node:fs";
import process from "node:process";

// Type definitions
export interface PipeConfig {
  [key: string]: object | string | number | boolean;
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
    const parsedConfig = JSON.parse(configContent);
    const config: PipeConfig = {};
    parsedConfig.fields.forEach((field: any) => {
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
