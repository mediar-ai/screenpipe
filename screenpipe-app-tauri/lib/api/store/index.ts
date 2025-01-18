import { useUser } from "@/lib/hooks/use-user";
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
  private authToken: string;

  private constructor(authToken: string) {
    this.baseUrl = "https://screenpi.pe";
    this.authToken = authToken;
  }

  static async create(authToken: string): Promise<PipeApi> {
    const api = new PipeApi(authToken);
    await api.init(authToken);
    return api;
  }

  private async init(authToken: string) {
    try {
      const BASE_URL = await invoke("get_env", { name: "BASE_URL_PRIVATE" });
      if (BASE_URL) {
        this.baseUrl = BASE_URL as string;
      }
      this.authToken = authToken;
    } catch (error) {
      console.error("error initializing base url:", error);
    }
  }

  async listStorePlugins(): Promise<PipeStorePlugin[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/plugins/registry`, {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      });
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
  ): Promise<PipeDownloadResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/plugins/download`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({ pipe_id: pipeId }),
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
