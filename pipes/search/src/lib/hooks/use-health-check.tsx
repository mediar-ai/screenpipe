import { useState, useEffect, useCallback, useRef } from "react";
import { debounce } from "lodash";

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
  const healthRef = useRef(health);

  const fetchHealth = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("http://localhost:3030/health", {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      if (!response.ok) {
        setIsServerDown(true);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: HealthCheckResponse = await response.json();

      if (isHealthChanged(healthRef.current, data)) {
        setHealth(data);
        healthRef.current = data;
      }

      setIsServerDown(false);
    } catch (error) {
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
    } finally {
      setIsLoading(false);
    }
  }, []);

  const debouncedFetchHealth = useCallback(debounce(fetchHealth, 200), [
    fetchHealth,
  ]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 2000);

    return () => {
      clearInterval(interval);
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

