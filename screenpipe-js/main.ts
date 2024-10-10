// @ts-nocheck
import * as fs from "node:fs/promises";

// Type definitions
export interface PipeConfig {
  [key: string]: any;
}

export interface NotificationOptions {
  title: string;
  body: string;
}

export interface EmailOptions {
  to: string;
  from: string;
  password: string;
  subject: string;
  body: string;
  contentType?: string;
}

export interface ScreenpipeQueryParams {
  content_type?: "all" | "ocr" | "audio";
  limit?: number;
  offset?: number;
  start_time?: string;
  end_time?: string;
  min_length?: number;
  max_length?: number;
  include_frames?: boolean;
  q?: string;
  app_name?: string;
  window_name?: string;
}

export async function sendNotification(
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

export async function loadConfig(): Promise<PipeConfig> {
  try {
    const configPath = `${process.env.SCREENPIPE_DIR}/pipes/${process.env.PIPE_ID}/pipe.json`;
    const configContent = await fs.readFile(configPath, "utf8");
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
): Promise<any> {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) queryParams.append(key, value.toString());
  });

  const url = `http://localhost:3030/search?${queryParams}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error querying Screenpipe:", error);
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
