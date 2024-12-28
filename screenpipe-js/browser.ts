// browser.ts
import type {
  NotificationOptions,
  ScreenpipeQueryParams,
  ScreenpipeResponse,
  InputAction,
  InputControlResponse,
} from "./types";

import { toSnakeCase, convertToCamelCase } from "./next";

async function sendInputControl(action: InputAction): Promise<boolean> {
  const apiUrl = process.env.SCREENPIPE_SERVER_URL || "http://localhost:3030";
  try {
    const response = await fetch(`${apiUrl}/experimental/input_control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      throw new Error(`http error! status: ${response.status}`);
    }
    const data: InputControlResponse = await response.json();
    return data.success;
  } catch (error) {
    console.error("failed to control input:", error);
    return false;
  }
}

export interface BrowserPipe {
  sendDesktopNotification(options: NotificationOptions): Promise<boolean>;
  queryScreenpipe(
    params: ScreenpipeQueryParams
  ): Promise<ScreenpipeResponse | null>;
  input: {
    type: (text: string) => Promise<boolean>;
    press: (key: string) => Promise<boolean>;
    moveMouse: (x: number, y: number) => Promise<boolean>;
    click: (button: "left" | "right" | "middle") => Promise<boolean>;
  };
}

// Browser-only implementations
export const pipe: BrowserPipe = {
  async sendDesktopNotification(
    options: NotificationOptions
  ): Promise<boolean> {
    const notificationApiUrl = "http://localhost:11435";
    try {
      await fetch(`${notificationApiUrl}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      return true;
    } catch (error) {
      console.error("failed to send notification:", error);
      return false;
    }
  },

  async queryScreenpipe(
    params: ScreenpipeQueryParams
  ): Promise<ScreenpipeResponse | null> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        if (key === "speakerIds" && Array.isArray(value)) {
          if (value.length > 0) {
            queryParams.append(toSnakeCase(key), value.join(","));
          }
        } else {
          const snakeKey = toSnakeCase(key);
          queryParams.append(snakeKey, value!.toString());
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
  },

  input: {
    type: (text: string) => sendInputControl({ type: "WriteText", data: text }),
    press: (key: string) => sendInputControl({ type: "KeyPress", data: key }),
    moveMouse: (x: number, y: number) =>
      sendInputControl({ type: "MouseMove", data: { x, y } }),
    click: (button: "left" | "right" | "middle") =>
      sendInputControl({ type: "MouseClick", data: button }),
  },
};

// Export individual functions for more granular usage
export const sendDesktopNotification = pipe.sendDesktopNotification;
export const queryScreenpipe = pipe.queryScreenpipe;
export const input = pipe.input;
