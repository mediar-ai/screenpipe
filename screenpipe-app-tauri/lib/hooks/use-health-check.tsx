import { useState, useEffect } from "react";

interface HealthCheckResponse {
  status: string;
  status_code: number;
  last_frame_timestamp: string | null;
  last_audio_timestamp: string | null;
  frame_status: string;
  audio_status: string;
  message: string;
}

export function useHealthCheck() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isServerDown, setIsServerDown] = useState(false);
  const baseCheckInterval = 5000; // 5 seconds
  const maxCheckInterval = 60000; // 1 minute

  const fetchHealth = async () => {
    try {
      const response = await fetch("http://localhost:3030/health");
      if (!response.ok) {
        throw new Error(`http error! status: ${response.status}`);
      }
      const data: HealthCheckResponse = await response.json();
      if (
        !health ||
        health.status !== data.status ||
        health.status_code !== data.status_code ||
        health.message !== data.message
      ) {
        setHealth(data);
      }
      setIsServerDown(false);
    } catch (error) {
      if (!isServerDown) {
        setIsServerDown(true);
        setHealth({
          last_frame_timestamp: null,
          last_audio_timestamp: null,
          frame_status: "error",
          audio_status: "error",
          status: "error",
          status_code: 500,
          message: "failed to fetch health status. server might be down.",
        });
      }
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(
      () => {
        fetchHealth();
      },
      isServerDown ? maxCheckInterval : baseCheckInterval
    );

    return () => clearInterval(interval);
  }, [isServerDown]);

  return { health, isServerDown };
}