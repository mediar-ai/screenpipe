import fs from "fs/promises";
import path from "path";
import type {
  PipeConfig,
  ParsedConfig,
  InputAction,
  InputControlResponse,
  ScreenpipeQueryParams,
  ScreenpipeResponse,
  TranscriptionStreamResponse,
  TranscriptionChunk,
  VisionEvent,
  VisionStreamResponse,
} from "../../common/types";
import {
  toSnakeCase,
  convertToCamelCase,
  toCamelCase,
} from "../../common/utils";
import { SettingsManager } from "./SettingsManger";
import { Scheduler } from "./Scheduler";
import { InboxManager } from "./InboxManager";
import { EventSource } from "eventsource";

class NodePipe {
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
  public scheduler = new Scheduler();
  public inbox = new InboxManager();

  public async sendDesktopNotification(
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
  }

  public async sendInputControl(action: InputAction): Promise<boolean> {
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
  }

  public async loadPipeConfig(): Promise<PipeConfig> {
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
  }

  public async *streamTranscriptions(): AsyncGenerator<
    TranscriptionStreamResponse,
    void,
    unknown
  > {
    const apiUrl = process.env.SCREENPIPE_SERVER_URL || "http://localhost:3030";
    const eventSource = new EventSource(`${apiUrl}/sse/transcriptions`);

    try {
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
}

const pipe = new NodePipe();

export { pipe, toCamelCase, toSnakeCase, convertToCamelCase };

export * from "../../common/types";
