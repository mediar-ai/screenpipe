"use strict";
"use client";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HarvestClosestConnections = HarvestClosestConnections;
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const tooltip_1 = require("@/components/ui/tooltip");
// Add helper function for formatting time
function formatTimeRemaining(milliseconds) {
    const seconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}
// Add this helper function near your other utility functions
function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
// Add this new component
function CountdownTimer({ targetTime, prefix = "next profile in:" }) {
    const [timeLeft, setTimeLeft] = (0, react_1.useState)('');
    (0, react_1.useEffect)(() => {
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
    if (!timeLeft)
        return null;
    return (<span className="text-sm text-gray-500">
      {prefix} {timeLeft}
    </span>);
}
// Add this helper function for status styling
function getStatusStyle(status) {
    switch (status) {
        case 'running':
            return 'bg-green-100 text-green-800';
        case 'cooldown':
            return 'bg-yellow-100 text-yellow-800';
        case 'stopped':
            return 'bg-gray-100 text-gray-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}
// Add this helper function
function formatDuration(milliseconds) {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}
function HarvestClosestConnections() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const [harvestingStatus, setHarvestingStatus] = (0, react_1.useState)('stopped');
    const [status, setStatus] = (0, react_1.useState)("");
    const [nextHarvestTime, setNextHarvestTime] = (0, react_1.useState)(null);
    const [connectionsSent, setConnectionsSent] = (0, react_1.useState)(0);
    const [dailyLimitReached, setDailyLimitReached] = (0, react_1.useState)(false);
    const [weeklyLimitReached, setWeeklyLimitReached] = (0, react_1.useState)(false);
    const [stats, setStats] = (0, react_1.useState)({
        pending: 0,
        accepted: 0,
        declined: 0,
        email_required: 0,
        total: 0
    });
    const [isRefreshing, setIsRefreshing] = (0, react_1.useState)(false);
    const [refreshProgress, setRefreshProgress] = (0, react_1.useState)(null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [nextProfileTime, setNextProfileTime] = (0, react_1.useState)(null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [rateLimitedUntil, setRateLimitedUntil] = (0, react_1.useState)(null);
    const [restrictionInfo, setRestrictionInfo] = (0, react_1.useState)(null);
    const [isWithdrawing, setIsWithdrawing] = (0, react_1.useState)(false);
    // Add new state for cycle duration
    const [cycleStartTime, setCycleStartTime] = (0, react_1.useState)(null);
    const [cycleDuration, setCycleDuration] = (0, react_1.useState)('');
    const [statusMessage, setStatusMessage] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        // Load initial state with status only
        const loadInitialState = () => __awaiter(this, void 0, void 0, function* () {
            try {
                const res = yield fetch("/api/harvest/connection-status-update");
                if (!res.ok)
                    return;
                const data = yield res.json();
                console.log('initial state loaded:', {
                    harvestingStatus: data.harvestingStatus,
                    nextHarvestTime: data.nextHarvestTime,
                    now: new Date().toISOString(),
                    timeUntil: data.nextHarvestTime ?
                        Math.floor((new Date(data.nextHarvestTime).getTime() - Date.now()) / 1000 / 60) + 'm'
                        : 'none'
                });
                setHarvestingStatus(data.harvestingStatus || 'stopped');
                setNextHarvestTime(data.nextHarvestTime);
                setConnectionsSent(data.connectionsSent || 0);
                setDailyLimitReached(data.dailyLimitReached || false);
                setWeeklyLimitReached(data.weeklyLimitReached || false);
                // Fix: Only set restriction if it exists and is actually restricted
                if (data.restrictionInfo && data.restrictionInfo.isRestricted === true) {
                    console.log('setting restriction info:', data.restrictionInfo);
                    setRestrictionInfo(data.restrictionInfo);
                }
                else {
                    setRestrictionInfo(null); // Explicitly set to null if no restriction
                }
                if (data.nextHarvestTime) {
                    setNextHarvestTime(data.nextHarvestTime);
                    if (new Date(data.nextHarvestTime) > new Date()) {
                        const formattedTime = formatDateTime(data.nextHarvestTime);
                        const message = data.connectionsSent >= 35
                            ? <span className="flex items-center gap-2">
                  <lucide_react_1.Clock className="h-4 w-4 text-gray-500"/>
                  <span>daily limit reached, next harvest at</span>
                  <span className="font-medium">{formattedTime}</span>
                </span>
                            : <span className="flex items-center gap-2">
                  <lucide_react_1.Timer className="h-4 w-4 text-gray-500"/>
                  <span>next harvest scheduled for</span>
                  <span className="font-medium">{formattedTime}</span>
                </span>;
                        setStatus(message);
                    }
                }
            }
            catch (error) {
                console.error('failed to load initial state:', error);
                setStatus('failed to load initial state');
                setHarvestingStatus('stopped');
            }
        });
        loadInitialState();
    }, []);
    // Auto-restart effect
    (0, react_1.useEffect)(() => {
        console.log('auto-restart effect triggered:', {
            harvestingStatus,
            nextHarvestTime,
            now: new Date().toISOString()
        });
        if (!nextHarvestTime) {
            console.log('no next harvest time set');
            return;
        }
        if (harvestingStatus !== 'cooldown') {
            console.log('status is not cooldown:', harvestingStatus);
            return;
        }
        const timeUntilNextHarvest = new Date(nextHarvestTime).getTime() - Date.now();
        console.log('time until next harvest:', {
            nextHarvestTime,
            timeUntilNextHarvest: Math.floor(timeUntilNextHarvest / 1000 / 60) + 'm',
            status: harvestingStatus
        });
        if (timeUntilNextHarvest <= 0) {
            console.log('harvest time already passed, starting now');
            startHarvesting();
            return;
        }
        console.log('scheduling ui auto-restart after cooldown');
        const timer = setTimeout(() => {
            console.log('cooldown finished, auto-restarting harvest from ui');
            startHarvesting();
        }, timeUntilNextHarvest);
        return () => clearTimeout(timer);
    }, [nextHarvestTime, harvestingStatus]);
    // Stats polling stats, load connections
    (0, react_1.useEffect)(() => {
        const interval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
            try {
                const res = yield fetch("/api/harvest/stats");
                if (!res.ok)
                    return;
                const data = yield res.json();
                console.log('polling received data:', {
                    statusMessage: data.statusMessage,
                    harvestingStatus: data.harvestingStatus,
                    isAlive: data.isAlive
                });
                // Check if process is alive via heartbeat
                if (data.harvestingStatus === 'running' && !data.isAlive) {
                    console.log('detected dead harvest process');
                    setHarvestingStatus('stopped');
                    return;
                }
                // Update both stats and status
                if (data.stats) {
                    setStats(data.stats);
                }
                if (data.harvestingStatus) {
                    setHarvestingStatus(data.harvestingStatus);
                }
                if (data.nextHarvestTime) {
                    setNextHarvestTime(data.nextHarvestTime);
                }
                if (typeof data.connectionsSent === 'number') {
                    setConnectionsSent(data.connectionsSent);
                }
                // Add debug before setting status message
                if (data.statusMessage) {
                    console.log('setting status message:', data.statusMessage);
                    setStatusMessage(data.statusMessage);
                }
            }
            catch (error) {
                console.error("failed to fetch status:", error);
            }
        }), 2000);
        return () => clearInterval(interval);
    }, []);
    // Add this useEffect near your other effects
    (0, react_1.useEffect)(() => {
        let pollInterval;
        if (isRefreshing) {
            // Start polling only when refreshing is true
            pollInterval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                const response = yield fetch("/api/harvest/connection-status-update");
                const data = yield response.json();
                if (data.refreshProgress) {
                    setRefreshProgress(data.refreshProgress);
                }
            }), 1000);
        }
        // Cleanup when isRefreshing becomes false or component unmounts
        return () => {
            if (pollInterval) {
                clearInterval(pollInterval);
            }
        };
    }, [isRefreshing]); // Only re-run when isRefreshing changes
    // Add effect to sync withdrawal status
    (0, react_1.useEffect)(() => {
        if (stats.withdrawStatus) {
            setIsWithdrawing(stats.withdrawStatus.isWithdrawing);
        }
    }, [(_a = stats.withdrawStatus) === null || _a === void 0 ? void 0 : _a.isWithdrawing]);
    // Add effect to track running time
    (0, react_1.useEffect)(() => {
        let interval;
        if (harvestingStatus === 'running') {
            if (!cycleStartTime) {
                setCycleStartTime(Date.now());
            }
            interval = setInterval(() => {
                if (cycleStartTime) {
                    setCycleDuration(formatDuration(Date.now() - cycleStartTime));
                }
            }, 1000);
        }
        else {
            setCycleStartTime(null);
            setCycleDuration('');
        }
        return () => {
            if (interval)
                clearInterval(interval);
        };
    }, [harvestingStatus, cycleStartTime]);
    // Simplify the updateConnectionsStatus function
    const updateConnectionsStatus = () => __awaiter(this, void 0, void 0, function* () {
        try {
            if (isWithdrawing) {
                setIsRefreshing(true); // Start spinner immediately
                const response = yield fetch("/api/harvest/withdraw-connections", {
                    method: "POST"
                });
                if (!response.ok) {
                    throw new Error('failed to stop withdrawal');
                }
                console.log('withdrawal stopped successfully');
                setIsWithdrawing(false);
            }
            else {
                // Start withdrawal process
                console.log('starting withdrawal process');
                setIsRefreshing(true); // Start spinner immediately
                setIsWithdrawing(true);
                const withdrawRes = yield fetch("/api/harvest/withdraw-connections?start=true");
                if (!withdrawRes.ok) {
                    console.error('failed to start withdrawal');
                    setIsWithdrawing(false);
                }
            }
        }
        catch (error) {
            console.error("failed to update/withdraw connections:", error);
            setIsWithdrawing(false);
        }
        finally {
            setIsRefreshing(false); // Always stop spinner when done
        }
    });
    const startHarvesting = () => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        try {
            console.log('attempting to start harvesting...');
            setHarvestingStatus('running');
            setStatus("starting farming process...");
            const response = yield fetch("/api/harvest/start", {
                method: "POST",
            });
            console.log('harvest start response status:', response.status);
            const data = yield response.json();
            console.log('harvest start response data:', data);
            if (response.ok) {
                setStatus(((_a = data.message) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || 'unknown status');
                setConnectionsSent(data.connectionsSent || 0); // Update from response
                setDailyLimitReached(data.dailyLimitReached || false);
                setWeeklyLimitReached(data.weeklyLimitReached || false);
                setHarvestingStatus(data.harvestingStatus);
                if (data.nextHarvestTime) {
                    setNextHarvestTime(data.nextHarvestTime);
                }
            }
            else {
                // Handle 429 without stopping the workflow
                if (response.status === 429) {
                    setNextHarvestTime(data.nextHarvestTime);
                    setStatus(((_b = data.message) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || 'rate limit reached');
                    setHarvestingStatus('cooldown');
                }
                else {
                    console.error('failed to start harvesting:', data);
                    setStatus(`error: ${((_c = data.message) === null || _c === void 0 ? void 0 : _c.toLowerCase()) || 'unknown error'}`);
                    setHarvestingStatus('stopped');
                }
            }
        }
        catch (error) {
            console.error("failed to start harvesting:", error);
            const err = error;
            setStatus(`error: ${((_d = err.message) === null || _d === void 0 ? void 0 : _d.toLowerCase()) || err.toString().toLowerCase()}`);
            setHarvestingStatus('stopped');
        }
    });
    const stopHarvesting = () => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            // Set status immediately to improve UI responsiveness
            setHarvestingStatus('stopped');
            setStatus("farming stopped");
            const response = yield fetch("/api/harvest/stop", {
                method: "POST",
            });
            if (!response.ok) {
                const data = yield response.json();
                setStatus(`error stopping: ${((_a = data.message) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || 'unknown error'}`);
                // Revert status if there was an error
                setHarvestingStatus('running');
            }
        }
        catch (error) {
            console.error("failed to stop harvesting:", error);
            const err = error;
            setStatus(`${((_b = err.message) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || err.toString().toLowerCase()}`);
            // Revert status if there was an error
            setHarvestingStatus('running');
        }
    });
    return (<div className="flex flex-col gap-2">
      <div className="flex flex-row items-center gap-4">
        <div className="flex items-center gap-4">
          <span className="text-lg font-medium">
            farming connections
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(harvestingStatus)}`}>
            {harvestingStatus}
          </span>
          <div className="flex items-center gap-2">
            {harvestingStatus === 'stopped' ? (<button onClick={startHarvesting} disabled={isRefreshing} className={`bg-black text-white px-4 py-2 rounded-md text-base ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                start
              </button>) : (<div className="flex items-center gap-2">
                {harvestingStatus === 'running' && (<lucide_react_1.Loader2 className="h-4 w-4 animate-spin text-gray-500"/>)}
                <button onClick={stopHarvesting} className="bg-red-600 text-white px-4 py-2 rounded-md text-base hover:bg-red-700">
                  stop
                </button>
              </div>)}
          </div>
        </div>
        {harvestingStatus && (<span className="text-sm text-gray-500">
            {(restrictionInfo === null || restrictionInfo === void 0 ? void 0 : restrictionInfo.isRestricted)
                ? `account restricted until ${new Date(restrictionInfo.endDate).toLocaleString()}`
                : dailyLimitReached && nextHarvestTime
                    ? <span className="flex items-center gap-2">
                    <lucide_react_1.Clock className="h-4 w-4 text-gray-500"/>
                    <span>daily limit reached, next harvest at</span>
                    <span className="font-medium">{formatDateTime(nextHarvestTime)}</span>
                  </span>
                    : weeklyLimitReached && nextHarvestTime
                        ? <span className="flex items-center gap-2">
                      <lucide_react_1.Clock className="h-4 w-4 text-gray-500"/>
                      <span>weekly limit reached, next harvest at</span>
                      <span className="font-medium">{formatDateTime(nextHarvestTime)}</span>
                    </span>
                        : statusMessage
                            ? <span className="flex items-center gap-2">
                        <lucide_react_1.Info className="h-4 w-4 text-gray-500"/>
                        <span>{statusMessage.toLowerCase()}</span>
                      </span>
                            : harvestingStatus === 'running'
                                ? connectionsSent > 0
                                    ? `sent ${connectionsSent} connections in ${cycleDuration}`
                                    : cycleDuration ? `running for ${cycleDuration}` : ''
                                : ''}
          </span>)}
        {(restrictionInfo === null || restrictionInfo === void 0 ? void 0 : restrictionInfo.isRestricted) && (restrictionInfo === null || restrictionInfo === void 0 ? void 0 : restrictionInfo.reason) && (<span className="text-sm text-red-500">
            {restrictionInfo.reason}
          </span>)}
      </div>
      <p className="text-sm text-muted-foreground">
        automatically send connection requests to your closest linkedin network
      </p>

      <div className="flex items-center mt-4 mb-2">
        <span className="text-sm font-medium">stats</span>
        <button onClick={updateConnectionsStatus} disabled={isRefreshing || !!rateLimitedUntil || harvestingStatus === 'running'} className={`p-2 rounded-md transition-all ${isRefreshing || rateLimitedUntil || harvestingStatus === 'running'
            ? 'bg-gray-100 cursor-not-allowed'
            : 'hover:bg-gray-100'}`} aria-label={((_b = stats.withdrawStatus) === null || _b === void 0 ? void 0 : _b.isWithdrawing) ? "stop withdrawing old invitations" : "withdraw old invitations"}>
          <lucide_react_1.RefreshCw className={`h-5 w-5 transition-all ${isRefreshing || ((_c = stats.withdrawStatus) === null || _c === void 0 ? void 0 : _c.isWithdrawing) ? 'animate-spin text-gray-400' : 'text-gray-500 hover:text-gray-700'}`}/>
        </button>
        {isWithdrawing && (<button onClick={() => updateConnectionsStatus()} className="ml-2 p-2 rounded-md bg-red-100 hover:bg-red-200 transition-all" aria-label="stop withdrawing">
            <span className="text-red-600 text-sm">stop</span>
          </button>)}
        {(isWithdrawing ||
            ((_e = (_d = stats.withdrawStatus) === null || _d === void 0 ? void 0 : _d.reason) === null || _e === void 0 ? void 0 : _e.includes('failed')) ||
            ((_g = (_f = stats.withdrawStatus) === null || _f === void 0 ? void 0 : _f.reason) === null || _g === void 0 ? void 0 : _g.includes('detected')) ||
            ((_j = (_h = stats.withdrawStatus) === null || _h === void 0 ? void 0 : _h.reason) === null || _j === void 0 ? void 0 : _j.includes('completed')) ||
            (((_l = (_k = stats.withdrawStatus) === null || _k === void 0 ? void 0 : _k.reason) === null || _l === void 0 ? void 0 : _l.includes('finished')) &&
                ((_m = stats.withdrawStatus) === null || _m === void 0 ? void 0 : _m.timestamp) &&
                new Date().getTime() - new Date(stats.withdrawStatus.timestamp).getTime() < 12 * 60 * 60 * 1000)) &&
            ((_o = stats.withdrawStatus) === null || _o === void 0 ? void 0 : _o.reason) && (<span className="ml-2 text-sm text-gray-500">
              {stats.withdrawStatus.reason}
            </span>)}
        {nextProfileTime && nextProfileTime > Date.now() && (<div className="ml-2">
            <CountdownTimer targetTime={nextProfileTime}/>
          </div>)}
        {rateLimitedUntil && (<span className="ml-2 text-sm text-red-500">
            rate limited ({formatTimeRemaining(new Date(rateLimitedUntil).getTime() - Date.now())})
          </span>)}
        {refreshProgress && !rateLimitedUntil && (<span className="ml-2 text-sm text-gray-500">
            checking {refreshProgress.current}/{refreshProgress.total} profiles
            {stats.averageProfileCheckDuration && nextProfileTime && (<CountdownTimer targetTime={nextProfileTime} prefix="~"/>)}
          </span>)}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
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
          <tooltip_1.TooltipProvider>
            <tooltip_1.Tooltip>
              <tooltip_1.TooltipTrigger className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">declined</span>
                <lucide_react_1.Info className="h-3 w-3 text-muted-foreground"/>
              </tooltip_1.TooltipTrigger>
              <tooltip_1.TooltipContent>
                <p className="text-sm">profiles that didn&apos;t accept your connection request within 14 days are marked as declined and the request is withdrawn</p>
              </tooltip_1.TooltipContent>
            </tooltip_1.Tooltip>
          </tooltip_1.TooltipProvider>
        </div>
        <div className="flex flex-col items-center p-3 bg-yellow-50 rounded-lg">
          <span className="text-lg font-medium">{stats.email_required}</span>
          <span className="text-sm text-muted-foreground">email required</span>
        </div>
      </div>

      {(restrictionInfo === null || restrictionInfo === void 0 ? void 0 : restrictionInfo.isRestricted) && (<div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-md">
          <h3 className="text-red-600 font-medium mb-2">account temporarily restricted</h3>
          <p className="text-sm text-gray-600 mb-2">
            linkedin has detected automated activity on your account. to protect your account:
          </p>
          <ul className="text-sm text-gray-600 list-disc list-inside ml-2 space-y-1">
            <li>consider using linkedin manually for a few days after the restriction</li>
            <li>avoid using any automation tools until the restriction ends + a few days</li>
            <li>report issue to the support team matt@screenpi.pe</li>
          </ul>
        </div>)}
    </div>);
}
