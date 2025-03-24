import { useState, useEffect, useCallback, useRef } from "react";

import { debounce, DebouncedFunc } from "lodash";


interface HealthCheckResponse {
  status: string;
  status_code: number;
  last_frame_timestamp: string | null;
  last_audio_timestamp: string | null;
  last_ui_timestamp: string | null;
  frame_status: string;
  audio_status: string;
  ui_status: string;
  message: string;
}

function isHealthChanged(
  oldHealth: HealthCheckResponse | null,
  newHealth: HealthCheckResponse
): boolean {
  if (!oldHealth) return true;
  return (
    oldHealth.status !== newHealth.status ||
    oldHealth.status_code !== newHealth.status_code ||
    oldHealth.last_frame_timestamp !== newHealth.last_frame_timestamp ||
    oldHealth.last_audio_timestamp !== newHealth.last_audio_timestamp ||
    oldHealth.last_ui_timestamp !== newHealth.last_ui_timestamp ||
    oldHealth.frame_status !== newHealth.frame_status ||
    oldHealth.audio_status !== newHealth.audio_status ||
    oldHealth.ui_status !== newHealth.ui_status ||
    oldHealth.message !== newHealth.message
  );
}

interface HealthCheckHook {
  health: HealthCheckResponse | null;
  isServerDown: boolean;
  isLoading: boolean;
  fetchHealth: () => Promise<void>;
  debouncedFetchHealth: () => Promise<void>;
}

export function useHealthCheck() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isServerDown, setIsServerDown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const healthRef = useRef(health);
  
  // Update the ref type to match the return type of debounce
  const debouncedFetchRef = useRef<DebouncedFunc<() => Promise<void>> | null>(null);

  const fetchHealth = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      console.log("fetching health data...");
      const response = await fetch("http://localhost:3030/health", {
        cache: "no-store",
        signal: abortControllerRef.current.signal,
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: HealthCheckResponse = await response.json();
      console.log("health data received:", data);

      if (isHealthChanged(healthRef.current, data)) {
        setHealth(data);
        healthRef.current = data;
      }

      setIsServerDown(false);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      // console.error("Health check error:", error);
      if (!isServerDown) {
        console.error("server appears to be down:", error);
        setIsServerDown(true);
        const errorHealth: HealthCheckResponse = {
          last_frame_timestamp: null,
          last_audio_timestamp: null,
          last_ui_timestamp: null,
          frame_status: "error",
          audio_status: "error",
          ui_status: "error",
          status: "error",
          status_code: 500,
          message: "Failed to fetch health status. Server might be down.",
        };
        setHealth(errorHealth);
        healthRef.current = errorHealth;
      }
    } finally {
      setIsLoading(false);
    }
  }, [isServerDown, setIsLoading]);

  // Update the debounced function when fetchHealth changes
  useEffect(() => {
    // This will now have the correct type
    debouncedFetchRef.current = debounce(() => fetchHealth(), 200);
    
    // Add cleanup to cancel debounced calls when dependencies change
    return () => {
      debouncedFetchRef.current?.cancel();
    };
  }, [fetchHealth]);

  // Create a stable function to call the debounced fetch
  const debouncedFetchHealth = useCallback(async () => {
    // This returns a Promise<void> to match the interface
    return new Promise<void>((resolve) => {
      if (debouncedFetchRef.current) {
        console.log("calling debounced health check");
        debouncedFetchRef.current();
        resolve();
      } else {
        console.warn("debounced health check not initialized");
        resolve();
      }
    });
  }, []);

  useEffect(() => {
    console.log("setting up health check interval");
    fetchHealth();
    const interval = setInterval(fetchHealth, 1000);

    return () => {
      console.log("cleaning up health check interval");
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchHealth]);

  return {
    health,
    isServerDown,
    isLoading,
    fetchHealth,
    debouncedFetchHealth,
  } as HealthCheckHook;
}
