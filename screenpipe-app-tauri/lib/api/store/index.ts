import { invoke } from "@tauri-apps/api/core";

export interface PipeStorePlugin {
  id: string;
  name: string;
  description: string | null;
  is_paid: boolean | null;
  price: number | null;
  status: string | null;
  created_at: string | null;
  source_code: string | null;
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

type PurchaseHistoryResponse = PurchaseHistoryItem[];

export interface PurchaseHistoryItem {
  id: string;
  amount_paid: number;
  currency: string;
  stripe_payment_status: string;
  created_at: string;
  refunded_at: string | null;
  plugin_id: string;
  plugin_name: string;
  plugin_description: string;
  developer_name: string;
}

interface PurchaseUrlResponse {
  data: {
    checkout_url?: string;
    used_credits?: boolean;
    payment_successful?: boolean;
    already_purchased?: boolean;
  };
}

export interface CheckUpdateResponse {
  has_update: boolean;
  current_version: string;
  latest_version: string;
  latest_file_hash: string;
  latest_file_size: number;
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

  async getUserPurchaseHistory(): Promise<PurchaseHistoryResponse> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/plugins/user-purchase-history`,
        {
          headers: {
            Authorization: `Bearer ${this.authToken}`,
          },
        }
      );
      if (!response.ok) {
        const { error } = (await response.json()) as { error: string };
        throw new Error(`failed to fetch purchase history: ${error}`);
      }

      const data = (await response.json()) as PurchaseHistoryResponse;
      return data;
    } catch (error) {
      console.error("error getting purchase history:", error);
      throw error;
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

  async purchasePipe(pipeId: string): Promise<PurchaseUrlResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/plugins/purchase`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({ pipe_id: pipeId }),
      });
      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(`failed to purchase pipe: ${error}`);
      }
      const data = (await response.json()) as PurchaseUrlResponse;
      console.log("purchase data", data);
      return data;
    } catch (error) {
      console.error("error purchasing pipe:", error);
      throw error;
    }
  }

  async downloadPipe(pipeId: string): Promise<PipeDownloadResponse> {
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
      console.warn("error downloading pipe:", error);
      throw error;
    }
  }

  async checkUpdate(
    pipeId: string,
    version: string
  ): Promise<CheckUpdateResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/plugins/check-update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({ pipe_id: pipeId, version }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(`failed to check for updates: ${error}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("error checking for updates:", error);
      throw error;
    }
  }
}
