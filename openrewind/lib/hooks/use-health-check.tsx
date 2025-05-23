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
  verbose_instructions?: string | null;
  device_status_details?: string | null;
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
  const previousHealthStatus = useRef<string | null>(null);
  const unhealthyTransitionsRef = useRef<number>(0);
  const retryIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchHealth = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket("ws://127.0.0.1:3030/ws/health");
    wsRef.current = ws;

    ws.onopen = () => {
      setIsLoading(false);
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
        retryIntervalRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      const data: HealthCheckResponse = JSON.parse(event.data);
      if (isHealthChanged(healthRef.current, data)) {
        setHealth(data);
        healthRef.current = data;
      }

      if (
        data.status === "unhealthy" &&
        previousHealthStatus.current === "healthy"
      ) {
        unhealthyTransitionsRef.current += 1;
      }

      previousHealthStatus.current = data.status;
    };

    ws.onerror = (event) => {
      const error = event as ErrorEvent;
      const errorHealth: HealthCheckResponse = {
        status: "error",
        status_code: 500,
        last_frame_timestamp: null,
        last_audio_timestamp: null,
        last_ui_timestamp: null,
        frame_status: "error",
        audio_status: "error",
        ui_status: "error",
        message: error.message,
      };
      setHealth(errorHealth);
      setIsServerDown(true);
      setIsLoading(false);
      if (!retryIntervalRef.current) {
        retryIntervalRef.current = setInterval(fetchHealth, 2000);
      }
    };

    ws.onclose = () => {
      const errorHealth: HealthCheckResponse = {
        status: "error",
        status_code: 500,
        last_frame_timestamp: null,
        last_audio_timestamp: null,
        last_ui_timestamp: null,
        frame_status: "error",
        audio_status: "error",
        ui_status: "error",
        message: "WebSocket connection closed",
      };
      setHealth(errorHealth);
      setIsServerDown(true);
      if (!retryIntervalRef.current) {
        retryIntervalRef.current = setInterval(fetchHealth, 2000);
      }
    };
  }, []);

  const debouncedFetchHealth = useCallback(() => {
    return new Promise<void>((resolve) => {
      debounce(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          fetchHealth().then(resolve);
        } else {
          resolve();
        }
      }, 1000)();
    });
  }, [fetchHealth]);

  useEffect(() => {
    fetchHealth();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
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
