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
  };
  enabled: boolean;
  id: string;
  port: number | null;
  source: string;
}

export interface PipeWithStatus extends PipeStorePlugin {
  isInstalled: boolean;
  isRunning: boolean;
  installedConfig?: InstalledPipe;
  hasPurchased: boolean;
}

export interface BrokenPipe {
  id: string;
  lastAttempt: number;
} 