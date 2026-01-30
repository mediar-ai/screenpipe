import { useState, useEffect, useCallback } from "react";
import { commands, OpencodeInfo, OpencodeCheckResult } from "@/lib/utils/tauri";

export interface UseOpencodeResult {
  info: OpencodeInfo | null;
  checkResult: OpencodeCheckResult | null;
  isLoading: boolean;
  error: string | null;
  start: (projectDir: string) => Promise<void>;
  stop: () => Promise<void>;
  refresh: () => Promise<void>;
  check: () => Promise<void>;
}

export function useOpencode(): UseOpencodeResult {
  const [info, setInfo] = useState<OpencodeInfo | null>(null);
  const [checkResult, setCheckResult] = useState<OpencodeCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const start = useCallback(async (projectDir: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await commands.opencodeStart(projectDir);
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

  // Initial check on mount
  useEffect(() => {
    check();
    refresh();
  }, [check, refresh]);

  // Poll for status while running
  useEffect(() => {
    if (info?.running) {
      const interval = setInterval(refresh, 5000);
      return () => clearInterval(interval);
    }
  }, [info?.running, refresh]);

  return {
    info,
    checkResult,
    isLoading,
    error,
    start,
    stop,
    refresh,
    check,
  };
}

// Helper to create an OpenCode client configuration
export function getOpencodeClientConfig(info: OpencodeInfo | null) {
  if (!info?.running || !info.baseUrl) {
    return null;
  }

  return {
    baseUrl: info.baseUrl,
    auth: info.username && info.password ? {
      username: info.username,
      password: info.password,
    } : undefined,
  };
}
