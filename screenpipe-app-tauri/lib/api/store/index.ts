import { invoke } from "@tauri-apps/api/core";

export interface PipeStorePlugin {
  id: string;
  name: string;
  description: string | null;
  is_paid: boolean | null;
  price: number | null;
  status: string | null;
  created_at: string | null;
  developer_accounts: {
    developer_name: string;
  };
  plugin_analytics: {
    downloads_count: number | null;
  };
}

export interface PipeDownloadResponse {
  download_url: string;
  file_hash: string;
  file_size: number;
}

export enum PipeDownloadError {
  PURCHASE_REQUIRED = "purchase required",
  DOWNLOAD_FAILED = "failed to download pipe",
}

export class PipeApi {
  private baseUrl: string;

  private constructor() {
    this.baseUrl = "https://screenpi.pe";
  }

  static async create(): Promise<PipeApi> {
    const api = new PipeApi();
    await api.initBaseUrl();
    return api;
  }

  private async initBaseUrl() {
    try {
      const BASE_URL = await invoke("get_env", { name: "BASE_URL_PRIVATE" });
      if (BASE_URL) {
        this.baseUrl = BASE_URL as string;
      }
    } catch (error) {
      console.error("error initializing base url:", error);
    }
  }

  async listStorePlugins(): Promise<PipeStorePlugin[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/plugins/registry`);
      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(`failed to fetch plugins: ${error}`);
      }
      const data: PipeStorePlugin[] = await response.json();
      return data;
    } catch (error) {
      console.error("error listing pipes:", error);
      throw error;
    }
  }

  async downloadPipe(
    pipeId: string,
    version: string
  ): Promise<PipeDownloadResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/plugins/download`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: pipeId, version }),
      });

      if (!response.ok) {
        const { error } = (await response.json()) as { error: string };
        throw new Error(error!, {
          cause:
            response.status === 403
              ? PipeDownloadError.PURCHASE_REQUIRED
              : PipeDownloadError.DOWNLOAD_FAILED,
        });
      }
      const data = (await response.json()) as PipeDownloadResponse;
      return data;
    } catch (error) {
      console.error("error downloading pipe:", error);
      throw error;
    }
  }
}
