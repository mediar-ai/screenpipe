import type {
  InputAction,
  InputControlResponse,
  ScreenpipeQueryParams,
  ScreenpipeResponse,
  NotificationOptions,
} from "../../common/types";
import { toSnakeCase, convertToCamelCase } from "../../common/utils";
import { SettingsManager } from "./SettingsManager";
import { InboxManager } from "./InboxManager";
import { PipesManager } from "../../common/PipesManager";
import {
  captureEvent,
  captureMainFeatureEvent,
  setAnalyticsClient,
} from "../../common/analytics";
import posthog from "posthog-js";

setAnalyticsClient({
  init: posthog.init.bind(posthog),
  identify: posthog.identify.bind(posthog),
  capture: posthog.capture.bind(posthog),
});
class NodePipe {
  private analyticsInitialized = false;
  private analyticsEnabled = true;

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
  public pipes = new PipesManager();

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
      console.error("error querying screenpipe:", error);
      throw error;
    }
  }

  private async initAnalyticsIfNeeded() {
    if (this.analyticsInitialized) return;

    const settings = await this.settings.getAll();
    this.analyticsEnabled = settings.analyticsEnabled;
    if (settings.analyticsEnabled) {
      this.analyticsInitialized = true;
    }
  }

  public async captureEvent(
    eventName: string,
    properties?: Record<string, any>
  ) {
    if (!this.analyticsEnabled) return;
    await this.initAnalyticsIfNeeded();
    const settings = await this.settings.getAll();
    return captureEvent(eventName, {
      distinct_id: settings.user.id,
      email: settings.user.email,
      ...properties,
    });
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
export { getDefaultSettings } from "../../common/utils";
