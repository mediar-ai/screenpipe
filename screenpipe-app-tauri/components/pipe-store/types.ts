import { PipeStorePlugin } from "@/lib/api/store";

export interface InstalledPipe {
  config: {
    id?: string;
    enabled?: boolean;
    is_nextjs: boolean;
    port?: number;
    source: string;
    crons?: {
      path: string;
      schedule: string;
    }[];
    fields?: Record<string, any>;
    version?: string;
  };
}

export interface PipeWithStatus extends PipeStorePlugin {
  is_installed: boolean;
  is_enabled: boolean;
  installed_config?: InstalledPipe['config'];
  has_purchased: boolean;
  is_core_pipe: boolean;
  is_installing?: boolean;
  has_update?: boolean;
}

export interface BrokenPipe {
  id: string;
  lastAttempt: number;
} 
