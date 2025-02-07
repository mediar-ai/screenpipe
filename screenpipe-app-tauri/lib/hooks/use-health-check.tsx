import { useState, useEffect, useCallback, useRef } from "react";

import { debounce } from "lodash";
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

const POSTHOG_RATE_LIMIT_HOURS = 1; // adjust this value as needed

function shouldSendPosthogEvent(eventName: string): boolean {
  const lastSentKey = `last_posthog_${eventName}`;
  const lastSent = localStorage.getItem(lastSentKey);
  const now = Date.now();

  if (
    !lastSent ||
    now - parseInt(lastSent) > POSTHOG_RATE_LIMIT_HOURS * 60 * 60 * 1000
  ) {
    localStorage.setItem(lastSentKey, now.toString());
    return true;
  }
  return false;
}

export function useHealthCheck() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isServerDown, setIsServerDown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const healthRef = useRef(health);
  const previousHealthStatus = useRef<string | null>(null);
  const unhealthyTransitionsRef = useRef<number>(0);

  const fetchHealth = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      const response = await fetch("http://localhost:3030/health", {
        cache: "no-store",
        signal: abortControllerRef.current.signal,
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      if (!response.ok) {
        if (shouldSendPosthogEvent("health_check_http_error")) {
          posthog.capture("health_check_http_error", {
            status: response.status,
            statusText: response.statusText,
          });
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: HealthCheckResponse = await response.json();

      if (
        data.status === "unhealthy" &&
        previousHealthStatus.current === "healthy"
      ) {
        unhealthyTransitionsRef.current += 1;

        if (shouldSendPosthogEvent("health_check_unhealthy")) {
          posthog.capture("health_check_unhealthy", {
            frame_status: data.frame_status,
            audio_status: data.audio_status,
            ui_status: data.ui_status,
            message: data.message,
            transitions_since_last_event: unhealthyTransitionsRef.current,
          });
          unhealthyTransitionsRef.current = 0;
        }
      }

      previousHealthStatus.current = data.status;

      if (isHealthChanged(healthRef.current, data)) {
        setHealth(data);
        healthRef.current = data;
      }

      setIsServerDown(false);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      if (!isServerDown && shouldSendPosthogEvent("health_check_server_down")) {
        posthog.capture("health_check_server_down", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      if (!isServerDown) {
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

  const debouncedFetchHealth = useCallback(debounce(fetchHealth, 1000), [
    fetchHealth,
  ]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 1000);

    return () => {
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
