"use client";

import { useState, useEffect } from "react";

export function HarvestClosestConnections() {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [nextHarvestTime, setNextHarvestTime] = useState<string | null>(null);
  const [connectionsSent, setConnectionsSent] = useState(0);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);
  const [weeklyLimitReached, setWeeklyLimitReached] = useState(false);

  useEffect(() => {
    // Update initial state
    fetch("/api/harvest/status")
      .then(res => res.json())
      .then(data => {
        setConnectionsSent(data.connectionsSent || 0);
        setDailyLimitReached(data.dailyLimitReached || false);
        setWeeklyLimitReached(data.weeklyLimitReached || false);
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
            setDailyLimitReached(data.dailyLimitReached || false);
            setWeeklyLimitReached(data.weeklyLimitReached || false);
            if (data.nextHarvestTime) {
              setNextHarvestTime(data.nextHarvestTime);
              if (new Date(data.nextHarvestTime) > new Date()) {
                setStatus(`harvesting cooldown active until ${new Date(data.nextHarvestTime).toLocaleString()}`);
              }
            }
            if (!data.isHarvesting && isRunning) {
              setIsRunning(false);
              setStatus("harvest process stopped");
            }
          })
          .catch(console.error);
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [isRunning]);

  const startHarvesting = async () => {
    try {
      setIsRunning(true);
      setStatus("starting harvesting process...");

      const response = await fetch("/api/harvest/start", {
        method: "POST",
      });

      const data = await response.json();
      console.log('harvest start response:', data);

      if (response.ok) {
        setStatus(data.message?.toLowerCase() || 'unknown status');
        setConnectionsSent(data.connectionsSent || 0);
        setDailyLimitReached(data.dailyLimitReached || false);
        setWeeklyLimitReached(data.weeklyLimitReached || false);
        if (data.nextHarvestTime) {
          setNextHarvestTime(data.nextHarvestTime);
        }
      } else {
        // Handle 429 without stopping the workflow
        if (response.status === 429) {
          setNextHarvestTime(data.nextHarvestTime);
          setStatus(data.message?.toLowerCase() || 'rate limit reached');
        } else {
          setStatus(`error: ${data.message?.toLowerCase() || 'unknown error'}`);
          setIsRunning(false);
        }
      }
    } catch (error: any) {
      console.error("failed to start harvesting:", error);
      setStatus(`error: ${error.message?.toLowerCase() || error.toString().toLowerCase()}`);
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
      <div className="flex items-center gap-4">
        <span className="text-lg font-medium">
          harvest connections {connectionsSent > 0 && `(${connectionsSent})`}
        </span>
        <div className="flex gap-2">
          {!isRunning && (
            <button
              onClick={startHarvesting}
              className="bg-black text-white px-4 py-2 rounded-md text-base"
            >
              start
            </button>
          )}
          {isRunning && (
            <button
              onClick={stopHarvesting}
              className="bg-red-600 text-white px-4 py-2 rounded-md text-base hover:bg-red-700"
            >
              stop
            </button>
          )}
        </div>
      </div>
      {isRunning && status && (
        <span className="text-sm text-gray-500">
          {status}
        </span>
      )}
      {(dailyLimitReached || weeklyLimitReached) && nextHarvestTime && (
        <span className="text-sm text-gray-500">
          {dailyLimitReached && `daily limit reached, next harvest at ${new Date(nextHarvestTime).toLocaleString()}`}
          {weeklyLimitReached && `weekly limit reached, next harvest at ${new Date(nextHarvestTime).toLocaleString()}`}
        </span>
      )}
    </div>
  );
}
