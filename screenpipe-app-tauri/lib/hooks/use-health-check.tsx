import { useState, useEffect, useCallback, useRef } from "react";

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

export function useHealthCheck() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isServerDown, setIsServerDown] = useState(false);
  const pollInterval = 1000; // 1 second
  const healthRef = useRef(health);

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:3030/health", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`http error! status: ${response.status}`);
      }
      const data: HealthCheckResponse = await response.json();
      if (isHealthChanged(healthRef.current, data)) {
        setHealth(data);
        healthRef.current = data;
      }
      setIsServerDown(false);
    } catch (error) {
      console.error("health check error:", error);
      if (!isServerDown) {
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
          message: "failed to fetch health status. server might be down.",
        };
        setHealth(errorHealth);
        healthRef.current = errorHealth;
      }
    }
  }, [isServerDown]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, pollInterval);

    return () => clearInterval(interval);
  }, [fetchHealth]);

  return { health, isServerDown, refetchHealth: fetchHealth };
}
