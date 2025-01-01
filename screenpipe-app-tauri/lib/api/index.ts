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

  constructor(baseUrl: string = 'http://localhost:3030') {
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
        throw new Error('failed to list pipes: api returned success: false');
      }
      return data.data;
    } catch (error) {
      console.error('error listing pipes:', error);
      throw error;
    }
  }
}
