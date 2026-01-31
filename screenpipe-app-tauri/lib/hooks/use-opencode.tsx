import { useState, useEffect, useCallback } from "react";
import { commands, OpencodeInfo, OpencodeCheckResult } from "@/lib/utils/tauri";
import { listen } from "@tauri-apps/api/event";

export interface UseOpencodeResult {
  info: OpencodeInfo | null;
  checkResult: OpencodeCheckResult | null;
  isLoading: boolean;
  error: string | null;
  logs: string[];
  start: (projectDir: string) => Promise<OpencodeInfo | null>;
  stop: () => Promise<void>;
  refresh: () => Promise<void>;
  check: () => Promise<void>;
  clearError: () => void;
}

export function useOpencode(): UseOpencodeResult {
  const [info, setInfo] = useState<OpencodeInfo | null>(null);
  const [checkResult, setCheckResult] = useState<OpencodeCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const result = await commands.opencodeInfo();
      if (result.status === "ok") {
        setInfo(result.data);
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const check = useCallback(async () => {
    try {
      const result = await commands.opencodeCheck();
      if (result.status === "ok") {
        setCheckResult(result.data);
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const start = useCallback(async (projectDir: string): Promise<OpencodeInfo | null> => {
    setIsLoading(true);
    setError(null);
    setLogs([]);
    try {
      const result = await commands.opencodeStart(projectDir, null);
      if (result.status === "ok") {
        setInfo(result.data);
        return result.data;
      } else {
        setError(result.error);
        return null;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await commands.opencodeStop();
      if (result.status === "ok") {
        setInfo(result.data);
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initial check on mount
  useEffect(() => {
    check();
    refresh();
  }, [check, refresh]);

  // Listen for OpenCode events
  useEffect(() => {
    const unlistenLog = listen<string>("opencode_log", (event) => {
      setLogs((prev) => [...prev.slice(-99), event.payload]);
    });

    const unlistenTerminated = listen<number | null>("opencode_terminated", () => {
      refresh();
    });

    const unlistenError = listen<string>("opencode_error", (event) => {
      setError(event.payload);
      refresh();
    });

    return () => {
      unlistenLog.then((fn) => fn());
      unlistenTerminated.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [refresh]);

  // Poll for status while running
  useEffect(() => {
    if (info?.running) {
      const interval = setInterval(refresh, 10000);
      return () => clearInterval(interval);
    }
  }, [info?.running, refresh]);

  return {
    info,
    checkResult,
    isLoading,
    error,
    logs,
    start,
    stop,
    refresh,
    check,
    clearError,
  };
}
