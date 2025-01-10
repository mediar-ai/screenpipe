interface PipeCron {
  path: string;
  schedule: string;
}

interface PipeConfig {
  crons: PipeCron[];
  is_nextjs: boolean;
  source: string;
}

interface Pipe {
  config: PipeConfig;
  enabled: boolean;
  id: string;
  port: number | null;
  source: string;
}

interface PipeListResponse {
  data: Pipe[];
  success: boolean;
}

interface PipeShortcut {
  pipeId: string;
  shortcut: string;
}

export class PipeApi {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:3030") {
    this.baseUrl = baseUrl;
  }

  async listPipes(): Promise<Pipe[]> {
    try {
      const response = await fetch(`${this.baseUrl}/pipes/list`);
      if (!response.ok) {
        throw new Error(`failed to fetch pipes: ${response.statusText}`);
      }
      const data: PipeListResponse = await response.json();
      if (!data.success) {
        throw new Error("failed to list pipes: api returned success: false");
      }
      return data.data;
    } catch (error) {
      console.error("error listing pipes:", error);
      throw error;
    }
  }

  async startAudio(deviceName: string): Promise<void> {
    try {
      const type = deviceName.includes("(input)") ? "Input" : "Output";
      const name = deviceName.replaceAll("(input)", "").replaceAll("(output)", "").trim();
      const response = await fetch(`${this.baseUrl}/audio/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device_name: name,
          device_type: type,
        }),
      });

      if (!response.ok) {
        throw new Error(`failed to start audio: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(`failed to start audio: ${data.message}`);
      }
    } catch (error) {
      console.error("error starting audio:", error);
      throw error;
    }
  }

  async stopAudio(deviceName: string): Promise<void> {
    try {
      const type = deviceName.includes("(input)") ? "Input" : "Output";
      const name = deviceName.replaceAll("(input)", "").replaceAll("(output)", "").trim();
      const response = await fetch(`${this.baseUrl}/audio/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device_name: name,
          device_type: type,
        }),
      });

      if (!response.ok) {
        throw new Error(`failed to stop audio: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(`failed to stop audio: ${data.message}`);
      }
    } catch (error) {
      console.error("error stopping audio:", error);
      throw error;
    }
  }
}
