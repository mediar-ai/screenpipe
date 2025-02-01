import type {
  InputAction,
  InputControlResponse,
  NotificationOptions,
  ScreenpipeQueryParams,
  ScreenpipeResponse,
  TranscriptionChunk,
  TranscriptionStreamResponse,
  VisionEvent,
  VisionStreamResponse,
} from "../../common/types";
import { toSnakeCase, convertToCamelCase } from "../../common/utils";
import { captureEvent, captureMainFeatureEvent } from "../../common/analytics";

async function sendInputControl(action: InputAction): Promise<boolean> {
  const apiUrl = "http://localhost:3030";
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
  streamTranscriptions(): AsyncGenerator<
    TranscriptionStreamResponse,
    void,
    unknown
  >;
  streamVision(
    includeImages?: boolean
  ): AsyncGenerator<VisionStreamResponse, void, unknown>;
  captureEvent: (
    event: string,
    properties?: Record<string, any>
  ) => Promise<void>;
  captureMainFeatureEvent: (
    name: string,
    properties?: Record<string, any>
  ) => Promise<void>;
}

class BrowserPipeImpl implements BrowserPipe {
  private async initAnalyticsIfNeeded(): Promise<{
    analyticsEnabled: boolean;
    userId?: string;
    email?: string;
  }> {
    try {
      // Connect to settings SSE stream
      const settingsStream = new EventSource(
        "http://localhost:11435/sse/settings"
      );

      // Get initial settings
      const settings = await new Promise<{
        analyticsEnabled: boolean;
        userId?: string;
        email?: string;
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          settingsStream.close();
          reject(new Error("settings stream timeout"));
        }, 5000);

        settingsStream.onmessage = (event) => {
          clearTimeout(timeout);
          settingsStream.close();
          // Parse the settings array and find analyticsEnabled
          const settingsArray: [string, any][] = JSON.parse(event.data);
          const analyticsEnabled =
            settingsArray.find(([key]) => key === "analyticsEnabled")?.[1] ??
            false;
          const userId =
            settingsArray.find(([key]) => key === "user.clerk_id")?.[1] ??
            undefined;
          const userEmail =
            settingsArray.find(([key]) => key === "user.email")?.[1] ??
            undefined;
          resolve({ analyticsEnabled, userId, email: userEmail });
        };

        settingsStream.onerror = (error) => {
          clearTimeout(timeout);
          settingsStream.close();
          reject(error);
        };
      });

      return {
        analyticsEnabled: settings.analyticsEnabled,
        userId: settings.userId,
        email: settings.email,
      };
    } catch (error) {
      console.error(
        "failed to fetch settings, defaulting to analytics enabled:",
        error
      );
      return {
        analyticsEnabled: false,
        userId: undefined,
      };
    }
  }

  async sendDesktopNotification(
    options: NotificationOptions
  ): Promise<boolean> {
    const { userId, email } = await this.initAnalyticsIfNeeded();
    const notificationApiUrl = "http://localhost:11435";
    try {
      await fetch(`${notificationApiUrl}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      await this.captureEvent("notification_sent", {
        distinct_id: userId,
        email: email,
        success: true,
      });
      return true;
    } catch (error) {
      await this.captureEvent("error_occurred", {
        feature: "notification",
        error: "send_failed",
        distinct_id: userId,
        email: email,
      });
      return false;
    }
  }

  async queryScreenpipe(
    params: ScreenpipeQueryParams
  ): Promise<ScreenpipeResponse | null> {
    console.log("queryScreenpipe:", params);
    const { userId, email } = await this.initAnalyticsIfNeeded();
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
      await captureEvent("search_performed", {
        distinct_id: userId,
        content_type: params.contentType,
        result_count: data.pagination.total,
        email: email,
      });
      return convertToCamelCase(data) as ScreenpipeResponse;
    } catch (error) {
      await captureEvent("error_occurred", {
        feature: "search",
        error: "query_failed",
        distinct_id: userId,
        email: email,
      });
      console.error("error querying screenpipe:", error);
      return null;
    }
  }

  input: {
    type: (text: string) => Promise<boolean>;
    press: (key: string) => Promise<boolean>;
    moveMouse: (x: number, y: number) => Promise<boolean>;
    click: (button: "left" | "right" | "middle") => Promise<boolean>;
  } = {
    type: (text: string) => sendInputControl({ type: "WriteText", data: text }),
    press: (key: string) => sendInputControl({ type: "KeyPress", data: key }),
    moveMouse: (x: number, y: number) =>
      sendInputControl({ type: "MouseMove", data: { x, y } }),
    click: (button: "left" | "right" | "middle") =>
      sendInputControl({ type: "MouseClick", data: button }),
  };

  async *streamTranscriptions(): AsyncGenerator<
    TranscriptionStreamResponse,
    void,
    unknown
  > {
    const eventSource = new EventSource(
      "http://localhost:3030/sse/transcriptions"
    );
    const { userId, email } = await this.initAnalyticsIfNeeded();

    try {
      await this.captureEvent("stream_started", {
        feature: "transcription",
        distinct_id: userId,
        email: email,
      });

      while (true) {
        const chunk: TranscriptionChunk = await new Promise(
          (resolve, reject) => {
            eventSource.onmessage = (event) => {
              if (event.data.trim() === "keep-alive-text") {
                return;
              }
              resolve(JSON.parse(event.data));
            };
            eventSource.onerror = (error) => {
              reject(error);
            };
          }
        );

        yield {
          id: crypto.randomUUID(),
          object: "text_completion_chunk",
          created: Date.now(),
          model: "screenpipe-realtime",
          choices: [
            {
              text: chunk.transcription,
              index: 0,
              finish_reason: chunk.is_final ? "stop" : null,
            },
          ],
          metadata: {
            timestamp: chunk.timestamp,
            device: chunk.device,
            isInput: chunk.is_input,
          },
        };
      }
    } finally {
      await this.captureEvent("stream_ended", {
        feature: "transcription",
        distinct_id: userId,
        email: email,
      });
      eventSource.close();
    }
  }

  async *streamVision(
    includeImages: boolean = false
  ): AsyncGenerator<VisionStreamResponse, void, unknown> {
    const eventSource = new EventSource(
      `http://localhost:3030/sse/vision?images=${includeImages}`
    );
    const { userId, email } = await this.initAnalyticsIfNeeded();
    try {
      await this.captureEvent("stream_started", {
        feature: "vision",
        distinct_id: userId,
        email: email,
      });

      while (true) {
        const event: VisionEvent = await new Promise((resolve, reject) => {
          eventSource.onmessage = (event) => {
            resolve(JSON.parse(event.data));
          };
          eventSource.onerror = (error) => {
            reject(error);
          };
        });

        yield {
          type: "vision_stream",
          data: event,
        };
      }
    } finally {
      await this.captureEvent("stream_ended", {
        feature: "vision",
        distinct_id: userId,
        email: email,
      });
      eventSource.close();
    }
  }

  public async captureEvent(
    eventName: string,
    properties?: Record<string, any>
  ) {
    const { analyticsEnabled } = await this.initAnalyticsIfNeeded();
    if (!analyticsEnabled) return;
    return captureEvent(eventName, properties);
  }

  public async captureMainFeatureEvent(
    featureName: string,
    properties?: Record<string, any>
  ) {
    const { analyticsEnabled } = await this.initAnalyticsIfNeeded();
    if (!analyticsEnabled) return;
    return captureMainFeatureEvent(featureName, properties);
  }
}

const pipeImpl = new BrowserPipeImpl();
export const pipe = pipeImpl;

export * from "../../common/types";
export { getDefaultSettings } from "../../common/utils";
