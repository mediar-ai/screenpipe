"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConnectionStats {
  pending: number;
  accepted: number;
  declined: number;
  email_required: number;
  cooldown: number;
  total: number;
  averageProfileCheckDuration?: number;
}

// Add type for harvesting status
type HarvestingStatus = 'running' | 'stopped' | 'cooldown';

// Add helper function for formatting time
function formatTimeRemaining(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// Add error type
type ApiError = {
  message?: string;
  toString: () => string;
};

// Add this new component
function CountdownTimer({ targetTime, prefix = "next profile in:" }: { targetTime: number, prefix?: string }) {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (now >= targetTime) {
        setTimeLeft('');
        clearInterval(interval);
        return;
      }
      setTimeLeft(formatTimeRemaining(targetTime - now));
    }, 1000);

    return () => clearInterval(interval);
  }, [targetTime]);

  if (!timeLeft) return null;

  return (
    <span className="text-sm text-gray-500">
      {prefix} {timeLeft}
    </span>
  );
}

export function HarvestClosestConnections() {
  const [harvestingStatus, setHarvestingStatus] = useState<HarvestingStatus>('stopped');
  const [status, setStatus] = useState("");
  const [nextHarvestTime, setNextHarvestTime] = useState<string | null>(null);
  const [connectionsSent, setConnectionsSent] = useState(0);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);
  const [weeklyLimitReached, setWeeklyLimitReached] = useState(false);
  const [stats, setStats] = useState<ConnectionStats>({
    pending: 0,
    accepted: 0,
    declined: 0,
    email_required: 0,
    cooldown: 0,
    total: 0
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number } | null>(null);
  const [nextProfileTime, setNextProfileTime] = useState<number | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<string | null>(null);

  useEffect(() => {
    // Update initial state
    fetch("/api/harvest/status")
      .then(res => res.json())
      .then(data => {
        setHarvestingStatus(data.isHarvesting);
        setConnectionsSent(data.connectionsSent || 0);
        setDailyLimitReached(data.dailyLimitReached || false);
        setWeeklyLimitReached(data.weeklyLimitReached || false);
        if (data.nextHarvestTime) {
          setNextHarvestTime(data.nextHarvestTime);
          if (new Date(data.nextHarvestTime) > new Date()) {
            setStatus(`harvesting cooldown active until ${new Date(data.nextHarvestTime).toLocaleString()}`);
          }
        }
      })
      .catch(console.error);
  }, []);

  // Combine both status polling effects into one
  useEffect(() => {
    if (harvestingStatus !== 'stopped') {
      const interval = setInterval(() => {
        fetch("/api/harvest/status")
          .then(res => res.json())
          .then(data => {
            setHarvestingStatus(data.isHarvesting);
            setConnectionsSent(data.connectionsSent || 0);
            setDailyLimitReached(data.connectionsSent >= 35);
            setWeeklyLimitReached(data.weeklyLimitReached || false);
            if (data.stats) {
              setStats(data.stats);
            }
            if (data.nextHarvestTime) {
              setNextHarvestTime(data.nextHarvestTime);
              if (new Date(data.nextHarvestTime) > new Date()) {
                const message = data.connectionsSent >= 35
                  ? `daily limit of ${data.connectionsSent} connections reached, next harvest at ${new Date(data.nextHarvestTime).toLocaleString()}`
                  : `harvesting cooldown active until ${new Date(data.nextHarvestTime).toLocaleString()}`;
                setStatus(message);
              }
            }

            // Check for cooldown restart if needed
            if (!data.isHarvesting && data.nextHarvestTime) {
              const now = new Date();
              const harvestTime = new Date(data.nextHarvestTime);
              
              if (now >= harvestTime) {
                console.log('cooldown period ended, initiating restart');
                setNextHarvestTime(null);
                setStatus('cooldown period ended, restarting...');
                
                // Force a status refresh to trigger the backend restart
                fetch('/api/harvest/status?refresh=true')
                  .then(() => new Promise(resolve => setTimeout(resolve, 1000)))
                  .then(() => setHarvestingStatus('running'))
                  .catch(error => {
                    console.error('failed to restart harvesting:', error);
                    setStatus('failed to restart after cooldown');
                  });
              }
            }

            if (data.nextProfileTime) {
              setNextProfileTime(data.nextProfileTime);
            } else {
              setNextProfileTime(null);
            }
          })
          .catch(error => {
            console.error('failed to fetch status:', error);
          });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [harvestingStatus]);

  const startHarvesting = async () => {
    try {
      setHarvestingStatus('running');
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
          setHarvestingStatus('stopped');
        }
      }
    } catch (error: unknown) {
      console.error("failed to start harvesting:", error);
      const err = error as ApiError;
      setStatus(`error: ${err.message?.toLowerCase() || err.toString().toLowerCase()}`);
      setHarvestingStatus('stopped');
    }
  };

  const stopHarvesting = async () => {
    try {
      // Set status immediately to improve UI responsiveness
      setHarvestingStatus('stopped');
      setStatus("stopping harvest process...");

      const response = await fetch("/api/harvest/stop", {
        method: "POST",
      });
      
      if (!response.ok) {
        const data = await response.json();
        setStatus(`error stopping: ${data.message?.toLowerCase() || 'unknown error'}`);
        // Revert status if there was an error
        setHarvestingStatus('running');
      }
    } catch (error: unknown) {
      console.error("failed to stop harvesting:", error);
      const err = error as ApiError;
      setStatus(`${err.message?.toLowerCase() || err.toString().toLowerCase()}`);
      // Revert status if there was an error
      setHarvestingStatus('running');
    }
  };

  const refreshStats = async () => {
    try {
      setIsRefreshing(true);
      
      // Start polling for progress
      const pollInterval = setInterval(async () => {
        const response = await fetch("/api/harvest/status");
        const data = await response.json();
        if (data.refreshProgress) {
          setRefreshProgress(data.refreshProgress);
        }
      }, 1000);

      // Trigger the actual refresh
      const response = await fetch("/api/harvest/status?refresh=true");
      const data = await response.json();
      
      // Add rate limit handling
      if (data.rateLimitedUntil) {
        setRateLimitedUntil(data.rateLimitedUntil);
      } else {
        setRateLimitedUntil(null);
      }

      // Clear polling and progress
      clearInterval(pollInterval);
      setRefreshProgress(null);
      
      setConnectionsSent(data.connectionsSent || 0);
      setDailyLimitReached(data.dailyLimitReached || false);
      setWeeklyLimitReached(data.weeklyLimitReached || false);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error("failed to refresh stats:", error);
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center gap-4">
        <div className="flex items-center gap-4">
          <span className="text-lg font-medium">
            farming connections {connectionsSent > 0 && `(${connectionsSent})`}
          </span>
          <div className="flex gap-2">
            {harvestingStatus === 'stopped' && (
              <button
                onClick={startHarvesting}
                className="bg-black text-white px-4 py-2 rounded-md text-base"
              >
                start
              </button>
            )}
            {(harvestingStatus === 'running' || harvestingStatus === 'cooldown') && (
              <button
                onClick={stopHarvesting}
                className="bg-red-600 text-white px-4 py-2 rounded-md text-base hover:bg-red-700"
              >
                stop
              </button>
            )}
          </div>
        </div>
        {harvestingStatus && (
          <span className="text-sm text-gray-500">
            {dailyLimitReached && nextHarvestTime 
              ? `daily limit reached, next harvest at ${new Date(nextHarvestTime).toLocaleString()}`
              : weeklyLimitReached && nextHarvestTime 
                ? `weekly limit reached, next harvest at ${new Date(nextHarvestTime).toLocaleString()}`
                : status}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        automatically send connection requests to your closest linkedin connections
      </p>

      <div className="flex items-center mt-4 mb-2">
        <span className="text-sm font-medium">stats</span>
        <button
          onClick={refreshStats}
          disabled={isRefreshing || !!rateLimitedUntil}
          className={`p-2 rounded-md transition-all ${
            isRefreshing || rateLimitedUntil ? 'bg-gray-100 cursor-not-allowed' : 'hover:bg-gray-100'
          }`}
          aria-label="refresh stats"
        >
          <RefreshCw 
            className={`h-5 w-5 transition-all ${
              isRefreshing ? 'animate-spin text-gray-400' : 'text-gray-500 hover:text-gray-700'
            }`}
          />
        </button>
        {nextProfileTime && nextProfileTime > Date.now() && (
          <div className="ml-2">
            <CountdownTimer targetTime={nextProfileTime} />
          </div>
        )}
        {rateLimitedUntil && (
          <span className="ml-2 text-sm text-red-500">
            rate limited ({formatTimeRemaining(new Date(rateLimitedUntil).getTime() - Date.now())})
          </span>
        )}
        {refreshProgress && !rateLimitedUntil && (
          <span className="ml-2 text-sm text-gray-500">
            checking {refreshProgress.current}/{refreshProgress.total} profiles
            {stats.averageProfileCheckDuration && nextProfileTime && (
              <CountdownTimer 
                targetTime={nextProfileTime} 
                prefix="~"
              />
            )}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        <div className="flex flex-col items-center p-3 bg-gray-50 rounded-lg">
          <span className="text-lg font-medium">{stats.total}</span>
          <span className="text-sm text-muted-foreground">total</span>
        </div>
        <div className="flex flex-col items-center p-3 bg-blue-50 rounded-lg">
          <span className="text-lg font-medium">{stats.pending}</span>
          <span className="text-sm text-muted-foreground">pending</span>
        </div>
        <div className="flex flex-col items-center p-3 bg-green-50 rounded-lg">
          <span className="text-lg font-medium">{stats.accepted}</span>
          <span className="text-sm text-muted-foreground">accepted</span>
        </div>
        <div className="flex flex-col items-center p-3 bg-red-50 rounded-lg">
          <span className="text-lg font-medium">{stats.declined}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">declined</span>
                <Info className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-sm">profiles that didn&apos;t accept your connection request within 14 days are marked as declined and the request is withdrawn</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex flex-col items-center p-3 bg-yellow-50 rounded-lg">
          <span className="text-lg font-medium">{stats.email_required}</span>
          <span className="text-sm text-muted-foreground">email required</span>
        </div>
        <div className="flex flex-col items-center p-3 bg-orange-50 rounded-lg">
          <span className="text-lg font-medium">{stats.cooldown}</span>
          <span className="text-sm text-muted-foreground">cooldown</span>
        </div>
      </div>
    </div>
  );
}
