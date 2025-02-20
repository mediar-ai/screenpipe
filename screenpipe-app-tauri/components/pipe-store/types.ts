import { PipeStorePlugin } from "@/lib/api/store";

export type BuildStatus = "not_started" | "in_progress" | "success" | "error";

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
    buildStatus?: BuildStatus;
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
