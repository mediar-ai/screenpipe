import { useState, useEffect, useCallback, useRef } from "react";

export const DeviceStatus = {
  OK: "ok",
  STALE: "stale",
  DISABLED: "disabled",
  NO_DATA: "no data",
  ERROR: "error",
  UNKNOWN: "unknown",
} as const;
export type DeviceStatus = (typeof DeviceStatus)[keyof typeof DeviceStatus];

export const SystemStatus = {
  HEALTHY: "healthy",
  UNHEALTHY: "unhealthy",
  ERROR: "error",
  WEBSOCKET_CLOSED: "websocket_closed",
} as const;
export type SystemStatus = (typeof SystemStatus)[keyof typeof SystemStatus];


export type HealthCheckResponse = {
  status: SystemStatus;
  status_code: 200 | 500;
  last_frame_timestamp: string | null;
  last_audio_timestamp: string | null;
  last_ui_timestamp: string | null;
  frame_status: DeviceStatus;
  audio_status: DeviceStatus;
  ui_status: DeviceStatus;
  message: string;
}
 
function isHealthChanged(
  oldHealth: HealthCheckResponse | null,
  newHealth: HealthCheckResponse
): boolean {
  if (!oldHealth) return true;
  return Object.keys(newHealth).some(
    (key) => oldHealth[key as keyof HealthCheckResponse] !== newHealth[key as keyof HealthCheckResponse]
  );
}

type HealthCheckHook = {
  health: HealthCheckResponse | null;
  isServerDown: boolean;
  isLoading: boolean;
  fetchHealth: () => Promise<void>;
  debouncedFetchHealth: () => Promise<void>;
}

export function useHealthCheck() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
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
        data.status === SystemStatus.UNHEALTHY &&
        previousHealthStatus.current === SystemStatus.HEALTHY
      ) {
        unhealthyTransitionsRef.current += 1;
      }

      previousHealthStatus.current = data.status;
    };

    ws.onerror = (event) => {
      const error = event as ErrorEvent;
      const errorHealth: HealthCheckResponse = {
        status: SystemStatus.ERROR,
        status_code: 500,
        last_frame_timestamp: null,
        last_audio_timestamp: null,
        last_ui_timestamp: null,
        frame_status: DeviceStatus.UNKNOWN,
        audio_status: DeviceStatus.UNKNOWN,
        ui_status: DeviceStatus.UNKNOWN,
        message: error.message,
      };
      setHealth(errorHealth);
      setIsLoading(false);
      if (!retryIntervalRef.current) {
        retryIntervalRef.current = setInterval(fetchHealth, 2000);
      }
    };

    ws.onclose = (s) => {
      console.log("ws.onclose", s)
      const errorHealth: HealthCheckResponse = {
        status: SystemStatus.WEBSOCKET_CLOSED,
        status_code: 500,
        last_frame_timestamp: null,
        last_audio_timestamp: null,
        last_ui_timestamp: null,
        frame_status: DeviceStatus.UNKNOWN,
        audio_status: DeviceStatus.UNKNOWN,
        ui_status: DeviceStatus.UNKNOWN,
        message: "websocket connection closed",
      };

      setHealth(errorHealth);
      if (!retryIntervalRef.current) {
        retryIntervalRef.current = setInterval(fetchHealth, 2000);
      }
    };
  }, []);

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
    isLoading,
  } as HealthCheckHook;
}
