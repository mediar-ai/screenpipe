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

export type PipeState = "loading" | "purchasing" | "purchased" | "purchase_error" | "installed" | "installing" | "install_done" | "install_error" | "enabling" | "enabled" | "disabled" | "opening" | "building" | "build_done" | "build_error";

export interface PipeWithStatus extends PipeStorePlugin {
  state: PipeState;
  has_purchased: boolean;
  is_installed: boolean;
  is_enabled: boolean;
  is_installing?: boolean;
  installed_config?: InstalledPipe["config"];
  is_core_pipe: boolean;
  has_update?: boolean;
  is_local?: boolean;
}

export interface BrokenPipe {
  id: string;
  lastAttempt: number;
}
