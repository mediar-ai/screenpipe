import type {
  InputAction,
  InputControlResponse,
  ScreenpipeQueryParams,
  ScreenpipeResponse,
  TranscriptionStreamResponse,
  TranscriptionChunk,
  VisionEvent,
  VisionStreamResponse,
  NotificationOptions,
} from "../../common/types";
import { toSnakeCase, convertToCamelCase } from "../../common/utils";
import { SettingsManager } from "./SettingsManager";
import { InboxManager } from "./InboxManager";
import { EventSource } from "eventsource";
import {
  captureEvent,
  captureMainFeatureEvent,
  identifyUser,
} from "../../common/analytics";

class NodePipe {
  private analyticsInitialized = false;
  private analyticsEnabled = true;
  private userId?: string;
  private userProperties?: Record<string, any>;

  public input = {
    type: (text: string) =>
      this.sendInputControl({ type: "WriteText", data: text }),
    press: (key: string) =>
      this.sendInputControl({ type: "KeyPress", data: key }),
    moveMouse: (x: number, y: number) =>
      this.sendInputControl({ type: "MouseMove", data: { x, y } }),
    click: (button: "left" | "right" | "middle") =>
      this.sendInputControl({ type: "MouseClick", data: button }),
  };

  public settings = new SettingsManager();
  public inbox = new InboxManager();

  public async sendDesktopNotification(
    options: NotificationOptions
  ): Promise<boolean> {
    await this.initAnalyticsIfNeeded();
    const notificationApiUrl = "http://localhost:11435";
    try {
      await fetch(`${notificationApiUrl}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      await captureEvent("notification_sent", {
        success: true,
      });
      return true;
    } catch (error) {
      await captureEvent("error_occurred", {
        feature: "notification",
        error: "send_failed",
      });
      console.error("failed to send notification:", error);
      return false;
    }
  }

  public async sendInputControl(action: InputAction): Promise<boolean> {
    await this.initAnalyticsIfNeeded();
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

  public async queryScreenpipe(
    params: ScreenpipeQueryParams
  ): Promise<ScreenpipeResponse | null> {
    await this.initAnalyticsIfNeeded();
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
        content_type: params.contentType,
        result_count: data.pagination.total,
      });
      return convertToCamelCase(data) as ScreenpipeResponse;
    } catch (error) {
      await captureEvent("error_occurred", {
        feature: "search",
        error: "query_failed",
      });
      console.error("error querying screenpipe:", error);
      return null;
    }
  }

  public async *streamTranscriptions(): AsyncGenerator<
    TranscriptionStreamResponse,
    void,
    unknown
  > {
    const apiUrl = process.env.SCREENPIPE_SERVER_URL || "http://localhost:3030";
    const eventSource = new EventSource(`${apiUrl}/sse/transcriptions`);

    try {
      await captureEvent("stream_started", {
        feature: "transcription",
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
      await captureEvent("stream_ended", {
        feature: "transcription",
      });
      eventSource.close();
    }
  }

  public async *streamVision(
    includeImages: boolean = false
  ): AsyncGenerator<VisionStreamResponse, void, unknown> {
    const apiUrl = process.env.SCREENPIPE_SERVER_URL || "http://localhost:3030";
    const eventSource = new EventSource(
      `${apiUrl}/sse/vision?images=${includeImages}`
    );

    try {
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
      eventSource.close();
    }
  }

  private async initAnalyticsIfNeeded() {
    if (this.analyticsInitialized || !this.userId) return;

    const settings = await this.settings.getAll();
    this.analyticsEnabled = settings.analyticsEnabled;
    if (settings.analyticsEnabled) {
      await identifyUser(this.userId, this.userProperties);
      this.analyticsInitialized = true;
    }
  }

  public async captureEvent(
    eventName: string,
    properties?: Record<string, any>
  ) {
    if (!this.analyticsEnabled) return;
    await this.initAnalyticsIfNeeded();
    return captureEvent(eventName, properties);
  }

  public async captureMainFeatureEvent(
    featureName: string,
    properties?: Record<string, any>
  ) {
    if (!this.analyticsEnabled) return;
    await this.initAnalyticsIfNeeded();
    return captureMainFeatureEvent(featureName, properties);
  }
}

const pipe = new NodePipe();

export { pipe };

export * from "../../common/types";
