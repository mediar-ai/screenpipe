import { useState, useEffect, useRef, useCallback } from "react";
import posthog from "posthog-js";

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
  const [isLoading, setIsLoading] = useState(true);
  const healthRef = useRef(health);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchHealth = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket("ws://127.0.0.1:11435/ws/health");
    wsRef.current = ws;

    ws.onopen = () => {
      setIsLoading(false);
    };

    ws.onmessage = (event) => {
      const data: HealthCheckResponse = JSON.parse(event.data);
      if (isHealthChanged(healthRef.current, data)) {
        setHealth(data);
        healthRef.current = data;
      }

      if (data.status === "unhealthy") {
        posthog.capture("health_check_unhealthy", {
          frame_status: data.frame_status,
          audio_status: data.audio_status,
          ui_status: data.ui_status,
          message: data.message,
        });
      }
    };

    ws.onerror = (event) => {
      const error = event as ErrorEvent;
      posthog.capture("health_check_error", {
        error: error.message,
      });
      setIsServerDown(true);
      setIsLoading(false);
    };

    ws.onclose = () => {
      setIsServerDown(true);
    };
  }, []);

  const debouncedFetchHealth = useCallback(() => {
    let timeoutId: NodeJS.Timeout;
    return () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchHealth();
      }, 300);
    };
  }, [fetchHealth]);

  useEffect(() => {
    fetchHealth();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [fetchHealth]);

  return {
    health,
    isServerDown,
    isLoading,
    fetchHealth,
    debouncedFetchHealth: debouncedFetchHealth(),
  } as HealthCheckHook;
}

