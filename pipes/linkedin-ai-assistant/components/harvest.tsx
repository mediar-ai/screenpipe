"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Info, Loader2 } from "lucide-react";
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
type HarvestingStatus = 'stopped' | 'running' | 'cooldown';

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
    // Load initial state with stats
    const loadInitialState = async () => {
      try {
        const res = await fetch("/api/harvest/status?refresh=true");
        if (!res.ok) return;
        
        const data = await res.json();
        setHarvestingStatus(data.harvestingStatus || 'stopped');
        setConnectionsSent(data.connectionsSent || 0);
        setDailyLimitReached(data.dailyLimitReached || false);
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
      } catch (error) {
        console.error('failed to load initial state:', error);
        setStatus('failed to load initial state');
        setHarvestingStatus('stopped');
      }
    };

    loadInitialState();
  }, []);

  // Combine both status polling effects into one
  useEffect(() => {
    if (harvestingStatus !== 'stopped') {
      const interval = setInterval(() => {
        fetch("/api/harvest/status")
          .then(res => {
            if (!res.ok) {
              console.error('status check failed:', res.status);
              return null;
            }
            return res.json();
          })
          .then(data => {
            if (!data) return;
            
            // Batch state updates together
            const updates = () => {
              setConnectionsSent(data.connectionsSent || 0);
              setHarvestingStatus(data.harvestingStatus);
              setDailyLimitReached(data.connectionsSent >= 35);
              setWeeklyLimitReached(data.weeklyLimitReached || false);
              if (data.stats) setStats(data.stats);
              if (data.nextProfileTime) {
                setNextProfileTime(data.nextProfileTime);
              } else {
                setNextProfileTime(null);
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
            };
            
            updates();
          })
          .catch(error => {
            console.error('failed to fetch status:', error);
          });
      }, 2000); // Increased to 2 seconds

      return () => clearInterval(interval);
    }
  }, [harvestingStatus]);

  const startHarvesting = async () => {
    try {
      console.log('attempting to start harvesting...');
      setHarvestingStatus('running');
      setStatus("starting farming process...");

      const response = await fetch("/api/harvest/start", {
        method: "POST",
      });

      console.log('harvest start response status:', response.status);
      const data = await response.json();
      console.log('harvest start response data:', data);

      if (response.ok) {
        setStatus(data.message?.toLowerCase() || 'unknown status');
        setConnectionsSent(data.connectionsSent || 0);
        setDailyLimitReached(data.dailyLimitReached || false);
        setWeeklyLimitReached(data.weeklyLimitReached || false);
        setHarvestingStatus(data.harvestingStatus);
        if (data.nextHarvestTime) {
          setNextHarvestTime(data.nextHarvestTime);
        }
      } else {
        // Handle 429 without stopping the workflow
        if (response.status === 429) {
          setNextHarvestTime(data.nextHarvestTime);
          setStatus(data.message?.toLowerCase() || 'rate limit reached');
          setHarvestingStatus('cooldown');
        } else {
          console.error('failed to start harvesting:', data);
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
      setStatus("farming stopped");

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

      // Trigger the actual refresh with refresh=true
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
            farming connections
          </span>
          <div className="flex items-center gap-2">
            {harvestingStatus === 'stopped' ? (
              <button
                onClick={startHarvesting}
                className="bg-black text-white px-4 py-2 rounded-md text-base"
              >
                start
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                <button
                  onClick={stopHarvesting}
                  className="bg-red-600 text-white px-4 py-2 rounded-md text-base hover:bg-red-700"
                >
                  stop
                </button>
              </div>
            )}
          </div>
        </div>
        {harvestingStatus && (
          <span className="text-sm text-gray-500">
            {dailyLimitReached && nextHarvestTime 
              ? `daily limit reached, next harvest at ${new Date(nextHarvestTime).toLocaleString()}`
              : weeklyLimitReached && nextHarvestTime 
                ? `weekly limit reached, next harvest at ${new Date(nextHarvestTime).toLocaleString()}`
                : harvestingStatus === 'running'
                  ? connectionsSent > 0 
                    ? `sent ${connectionsSent} connections` 
                    : ''
                  : status}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        automatically send connection requests to your closest linkedin network
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

