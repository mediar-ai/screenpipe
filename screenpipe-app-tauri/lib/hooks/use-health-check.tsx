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

  const fetchHealth = async () => {
    try {
      const response = await fetch("http://localhost:3030/health");
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error! status: ${response.status} ${text}`);
      }
      const data: HealthCheckResponse = await response.json();
      if (
        (health !== null && health.status === data.status) ||
        // did not change
        (health != null &&
          health.status_code === data.status_code &&
          health.message === data.message)
      ) {
        return;
      }
      // console.log("setting health", data);
      setHealth(data);
    } catch (error) {
      // console.error("Failed to fetch health status:", error);
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
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 1000); // Poll every 1 second

    return () => clearInterval(interval);
  }, []);

  return { health };
}
