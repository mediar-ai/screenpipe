import { PipeStorePlugin } from "@/lib/api/store";

export type BuildStatus =
  | string
  | {
      status: "in_progress" | "error" | "success" | "not_started" | "updating";
      step: string;
      progress?: number;
      error?: string;
    };

export interface InstalledConfig {
  port?: number;
  enabled?: boolean;
  version?: string;
  buildStatus?: BuildStatus;
  is_nextjs?: boolean;
  source?: string;
}

export interface InstalledPipe {
  config: InstalledConfig & {
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
  desc: string;
  id: string;
}

export interface PipeWithStatus extends PipeStorePlugin {
  is_installed: boolean;
  is_enabled: boolean;
  installed_config?: InstalledPipe["config"];
  has_purchased: boolean;
  is_core_pipe: boolean;
  is_installing?: boolean;
  has_update?: boolean;
  is_local?: boolean;
}

export interface BrokenPipe {
  id: string;
  lastAttempt: number;
}
