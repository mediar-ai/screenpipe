"use client";

import { useState, useEffect } from "react";

export function HarvestClosestConnections() {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [nextHarvestTime, setNextHarvestTime] = useState<string | null>(null);
  const [connectionsSent, setConnectionsSent] = useState(0);

  useEffect(() => {
    // Update initial state
    fetch("/api/harvest/status")
      .then(res => res.json())
      .then(data => {
        setConnectionsSent(data.connectionsSent || 0);
        if (data.nextHarvestTime) {
          setNextHarvestTime(data.nextHarvestTime);
          if (new Date(data.nextHarvestTime) > new Date()) {
            setStatus(`harvesting cooldown active until ${new Date(data.nextHarvestTime).toLocaleString()}`);
          }
        }
        setIsRunning(data.isHarvesting || false);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (isRunning) {
      const interval = setInterval(() => {
        fetch("/api/harvest/status")
          .then(res => res.json())
          .then(data => {
            setConnectionsSent(data.connectionsSent || 0);
            setIsRunning(data.isHarvesting || false);
            if (!data.isHarvesting) {
              setStatus("harvest process stopped");
            }
          })
          .catch(console.error);
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [isRunning]);

  const startHarvesting = async () => {
    setIsRunning(true);
    setStatus("starting harvesting process...");

    try {
      const response = await fetch("/api/harvest/start", {
        method: "POST",
      });

      const data = await response.json();
      console.log('response data:', data);

      if (response.ok) {
        setStatus(data.message?.toLowerCase() || 'unknown status');
        if (data.nextHarvestTime) {
          setNextHarvestTime(data.nextHarvestTime);
        }
        setIsRunning(true);
      } else {
        setStatus(`${data.message?.toLowerCase() || 'unknown error'}`);
        setIsRunning(false);
      }
    } catch (error: any) {
      console.error("failed to start harvesting:", error);
      setStatus(`${error.message?.toLowerCase() || error.toString().toLowerCase()}`);
      setIsRunning(false);
    }
  };

  const stopHarvesting = async () => {
    try {
      const response = await fetch("/api/harvest/stop", {
        method: "POST",
      });
      
      if (response.ok) {
        setStatus("stopping harvest process...");
      } else {
        const data = await response.json();
        setStatus(`error stopping: ${data.message?.toLowerCase() || 'unknown error'}`);
      }
    } catch (error: any) {
      console.error("failed to stop harvesting:", error);
      setStatus(`${error.message?.toLowerCase() || error.toString().toLowerCase()}`);
    }
  };

  return (
    <div className="flex flex-row items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          harvest connections {connectionsSent > 0 && `(${connectionsSent})`}
        </span>
        {isRunning || (nextHarvestTime && new Date(nextHarvestTime) > new Date()) ? (
          <button
            onClick={stopHarvesting}
            className="bg-red-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-red-700"
          >
            stop
          </button>
        ) : (
          <button
            onClick={startHarvesting}
            className="bg-black text-white px-3 py-1.5 rounded-md text-sm"
            disabled={nextHarvestTime && new Date(nextHarvestTime) > new Date()}
          >
            start
          </button>
        )}
      </div>
      {status && (
        <span className="text-sm text-gray-500">
          {status}
        </span>
      )}
    </div>
  );
}
