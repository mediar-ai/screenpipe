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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [nextProfileTime, setNextProfileTime] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [rateLimitedUntil, setRateLimitedUntil] = useState<string | null>(null);
  const [restrictionInfo, setRestrictionInfo] = useState<{
    isRestricted: boolean;
    endDate?: string;
    reason?: string;
  } | null>(null);

  useEffect(() => {
    // Load initial state with status only
    const loadInitialState = async () => {
      try {
        const res = await fetch("/api/harvest/connection-status-update");
        if (!res.ok) return;
        
        const data = await res.json();
        setHarvestingStatus(data.harvestingStatus || 'stopped');
        setConnectionsSent(data.connectionsSent || 0);
        setDailyLimitReached(data.dailyLimitReached || false);
        setWeeklyLimitReached(data.weeklyLimitReached || false);
        setRestrictionInfo(data.restrictionInfo || null);
        
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

  // Stats polling without condition
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/harvest/stats");
        if (!res.ok) return;
        const data = await res.json();
        
        // update stats
        if (data.stats) {
          setStats(data.stats);
        }
      } catch (error) {
        console.error("failed to fetch stats:", error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []); // Empty dependency array since we want it to run always

  // Add this useEffect near your other effects
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (isRefreshing) {
      // Start polling only when refreshing is true
      pollInterval = setInterval(async () => {
        const response = await fetch("/api/harvest/connection-status-update");
        const data = await response.json();
        if (data.refreshProgress) {
          setRefreshProgress(data.refreshProgress);
        }
      }, 1000);
    }

    // Cleanup when isRefreshing becomes false or component unmounts
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isRefreshing]); // Only re-run when isRefreshing changes

  // Simplify the updateConnectionsStatus function
  const updateConnectionsStatus = async () => {
    try {
      if (isRefreshing) {
        await fetch("/api/harvest/connection-status-update/stop", { method: "POST" });
        setIsRefreshing(false);
        setRefreshProgress(null);
        return;
      }
      
      setIsRefreshing(true);
      // Trigger the update
      const statusRes = await fetch("/api/harvest/connection-status-update?refresh=true");
      if (statusRes.ok) {
        const data = await statusRes.json();
        setHarvestingStatus(data.harvestingStatus || 'stopped');
        setConnectionsSent(data.connectionsSent || 0);
        setDailyLimitReached(data.dailyLimitReached || false);
        setWeeklyLimitReached(data.weeklyLimitReached || false);
        setRestrictionInfo(data.restrictionInfo || null);
        
        if (data.nextHarvestTime) {
          setNextHarvestTime(data.nextHarvestTime);
        }
      }
    } catch (error) {
      console.error("failed to update connections status:", error);
    }
  };

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
                disabled={isRefreshing}
                className={`bg-black text-white px-4 py-2 rounded-md text-base ${
                  isRefreshing ? 'opacity-50 cursor-not-allowed' : ''
                }`}
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
            {restrictionInfo?.isRestricted 
              ? `account restricted until ${new Date(restrictionInfo.endDate!).toLocaleString()}`
              : dailyLimitReached && nextHarvestTime 
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
        {restrictionInfo?.isRestricted && restrictionInfo?.reason && (
          <span className="text-sm text-red-500">
            {restrictionInfo.reason}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        automatically send connection requests to your closest linkedin network
      </p>

      <div className="flex items-center mt-4 mb-2">
        <span className="text-sm font-medium">stats</span>
        <button
          onClick={updateConnectionsStatus}
          disabled={isRefreshing || !!rateLimitedUntil || harvestingStatus === 'running'}
          className={`p-2 rounded-md transition-all ${
            isRefreshing || rateLimitedUntil || harvestingStatus === 'running' 
              ? 'bg-gray-100 cursor-not-allowed' 
              : 'hover:bg-gray-100'
          }`}
          aria-label="update connections status"
        >
          <RefreshCw 
            className={`h-5 w-5 transition-all ${
              isRefreshing ? 'animate-spin text-gray-400' : 'text-gray-500 hover:text-gray-700'
            }`}
          />
        </button>
        {isRefreshing && (
          <button
            onClick={() => updateConnectionsStatus()}
            className="ml-2 p-2 rounded-md bg-red-100 hover:bg-red-200 transition-all"
            aria-label="stop refreshing"
          >
            <span className="text-red-600 text-sm">stop</span>
          </button>
        )}
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

      {restrictionInfo?.isRestricted && (
        <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-md">
          <h3 className="text-red-600 font-medium mb-2">account temporarily restricted</h3>
          <p className="text-sm text-gray-600 mb-2">
            linkedin has detected automated activity on your account. to protect your account:
          </p>
          <ul className="text-sm text-gray-600 list-disc list-inside ml-2 space-y-1">
            <li>consider using linkedin manually for a few days after the restriction</li>
            <li>avoid using any automation tools until the restriction ends + a few days</li>
            <li>report issue to the support team matt@screenpi.pe</li>
          </ul>
        </div>
      )}
    </div>
  );
}

