import { PipeStorePlugin } from "@/lib/api/store";

export interface InstalledPipe {
  config: {
    enabled?: boolean;
    is_nextjs: boolean;
    port?: number;
    source: string;
    crons?: {
      path: string;
      schedule: string;
    }[];
    fields?: Record<string, any>;
  };
  enabled: boolean;
  id: string;
  port: number | null;
  source: string;
}

export interface PipeWithStatus extends PipeStorePlugin {
  is_installed: boolean;
  installed_config?: InstalledPipe['config'];
  has_purchased: boolean;
  is_core_pipe: boolean;
}

export interface BrokenPipe {
  id: string;
  lastAttempt: number;
} 