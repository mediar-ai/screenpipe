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
exports.LaunchLinkedInChromeSession = LaunchLinkedInChromeSession;
const button_1 = require("@/components/ui/button");
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const hover_card_1 = require("@/components/ui/hover-card");
const collapsible_1 = require("@/components/ui/collapsible");
function LaunchLinkedInChromeSession({ loginStatus, setLoginStatus }) {
    const [status, setStatus] = (0, react_1.useState)('idle');
    const [loginCheckInterval, setLoginCheckInterval] = (0, react_1.useState)(null);
    const [logs, setLogs] = (0, react_1.useState)([]);
    const [isLogsOpen, setIsLogsOpen] = (0, react_1.useState)(false);
    const [hasCopied, setHasCopied] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        return () => {
            if (loginCheckInterval) {
                clearInterval(loginCheckInterval);
            }
        };
    }, [loginCheckInterval]);
    const logger = {
        log: (message) => {
            const now = new Date();
            const time = now.toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            setLogs(prev => [...prev, `${time} - ${message}`]);
        },
        error: (message) => {
            const now = new Date();
            const time = now.toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            console.error(message);
            setLogs(prev => [...prev, `${time} - error: ${message}`]);
        }
    };
    const killChrome = () => __awaiter(this, void 0, void 0, function* () {
        try {
            logger.log('killing chrome...');
            const response = yield fetch('/api/chrome', { method: 'DELETE' });
            const data = yield response.json();
            if (data.logs) {
                data.logs.forEach((log) => logger.log(log));
            }
            setStatus('idle');
            logger.log('chrome killed');
        }
        catch (error) {
            logger.error(`failed to kill chrome: ${error}`);
        }
    });
    const launchChrome = () => __awaiter(this, void 0, void 0, function* () {
        try {
            setStatus('connecting');
            setError(null);
            yield killChrome();
            yield new Promise(resolve => setTimeout(resolve, 1000));
            const screenDims = {
                width: window.screen.availWidth,
                height: window.screen.availHeight
            };
            logger.log(`screen dimensions: ${screenDims.width}x${screenDims.height}`);
            const response = yield fetch('/api/chrome', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ screenDims })
            });
            const data = yield response.json();
            if (data.logs) {
                data.logs.forEach((log) => logger.log(log));
            }
            if (!response.ok) {
                throw new Error(data.error || 'Failed to launch chrome');
            }
            yield new Promise(resolve => setTimeout(resolve, 2000));
            pollDebuggerStatus();
        }
        catch (error) {
            logger.error(`failed to launch chrome: ${error}`);
            setStatus('error');
            setError(error instanceof Error ? error.message : String(error));
        }
    });
    const pollDebuggerStatus = () => __awaiter(this, void 0, void 0, function* () {
        let attempts = 0;
        const maxAttempts = 15;
        while (attempts < maxAttempts) {
            try {
                logger.log('polling debugger status...');
                const response = yield fetch('/api/chrome/status');
                const data = yield response.json();
                if (data.logs) {
                    data.logs.forEach((log) => logger.log(log));
                }
                logger.log(`poll response: ${JSON.stringify(data)}`);
                if (data.status === 'connected') {
                    logger.log('debugger connected, proceeding to linkedin');
                    setStatus('connected');
                    yield navigateToLinkedIn();
                    return;
                }
                logger.log(`not connected yet, attempt ${attempts + 1}/${maxAttempts}`);
            }
            catch (error) {
                logger.error(`poll error: ${error}`);
            }
            yield new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        logger.log('max polling attempts reached, setting error state');
        setStatus('error');
    });
    const checkLoginStatus = (wsUrl) => __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch('/api/chrome/check-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wsUrl }),
            });
            if (!response.ok)
                throw new Error('Failed to check login status');
            const data = yield response.json();
            if (data.logs) {
                data.logs.forEach((log) => logger.log(log));
            }
            const isLoggedIn = data.isLoggedIn;
            setLoginStatus(isLoggedIn ? 'logged_in' : 'logged_out');
            if (isLoggedIn && loginCheckInterval) {
                clearInterval(loginCheckInterval);
                setLoginCheckInterval(null);
            }
            else if (!isLoggedIn && !loginCheckInterval) {
                const interval = setInterval(() => checkLoginStatus(wsUrl), 5000);
                setLoginCheckInterval(interval);
            }
        }
        catch (error) {
            logger.error('failed to check login status:');
            if (loginCheckInterval) {
                clearInterval(loginCheckInterval);
                setLoginCheckInterval(null);
            }
        }
    });
    const navigateToLinkedIn = () => __awaiter(this, void 0, void 0, function* () {
        try {
            const statusResponse = yield fetch('/api/chrome/status');
            const statusData = yield statusResponse.json();
            if (statusData.status !== 'connected' || !statusData.wsUrl) {
                throw new Error('chrome not connected');
            }
            const response = yield fetch('/api/chrome/navigate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: 'https://www.linkedin.com',
                    wsUrl: statusData.wsUrl
                }),
            });
            if (!response.ok) {
                const error = yield response.json();
                throw new Error(error.details || 'Failed to navigate');
            }
            const data = yield response.json();
            if (data.logs) {
                data.logs.forEach((log) => logger.log(log));
            }
            setLoginStatus('checking');
            yield checkLoginStatus(statusData.wsUrl);
        }
        catch (error) {
            logger.error('failed to navigate:');
        }
    });
    const copyLogsToClipboard = () => {
        const logsText = logs.join('\n');
        navigator.clipboard.writeText(logsText);
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 1000);
    };
    return (<div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {(status === 'idle' || status === 'connecting') && (<div className="flex items-center gap-2">
                <button_1.Button onClick={launchChrome} disabled={status === 'connecting'} className="flex items-center gap-2">
                  <lucide_react_1.Chrome className="w-4 h-4"/>
                  {status === 'connecting' ? 'launching chrome...' : 'launch'}
                </button_1.Button>
                <hover_card_1.HoverCard>
                  <hover_card_1.HoverCardTrigger>
                    <lucide_react_1.Info className="w-4 h-4 text-gray-500"/>
                  </hover_card_1.HoverCardTrigger>
                  <hover_card_1.HoverCardContent className="w-80">
                    <p className="text-sm text-gray-500">
                      opens linkedin in a new chrome window while keeping your existing tabs
                    </p>
                  </hover_card_1.HoverCardContent>
                </hover_card_1.HoverCard>
              </div>)}
            {status === 'connected' && (<button_1.Button onClick={killChrome} variant="destructive" className="flex items-center gap-2">
                exit chrome
              </button_1.Button>)}
          </div>

          {status === 'connected' && (<>
              {loginStatus === 'checking' && (<div className="text-sm text-gray-500 flex items-center gap-2">
                  <lucide_react_1.Loader2 className="w-4 h-4 animate-spin"/>
                  checking linkedin login...
                </div>)}
              {loginStatus === 'logged_in' && (<div className="text-sm text-green-500 flex items-center gap-2">
                  <lucide_react_1.CheckCircle className="w-4 h-4"/>
                  logged in to linkedin
                </div>)}
              {loginStatus === 'logged_out' && (<div className="text-sm text-amber-500 flex items-center gap-2">
                  <lucide_react_1.LogIn className="w-4 h-4"/>
                  please log in to linkedin
                </div>)}
            </>)}

          {status === 'error' && (<div className="text-sm text-red-500 flex items-center gap-2">
              <span>failed to launch chrome</span>
              {error && <span className="font-mono">({error})</span>}
            </div>)}
        </div>

        <collapsible_1.Collapsible open={isLogsOpen} onOpenChange={setIsLogsOpen} className="w-auto">
          <collapsible_1.CollapsibleTrigger className="text-xs bg-gray-50 hover:bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
            {isLogsOpen ? 'hide logs' : 'show logs'}
          </collapsible_1.CollapsibleTrigger>
          <collapsible_1.CollapsibleContent className="absolute mt-2 right-0 left-0">
            <div className="bg-gray-50 rounded-md text-xs font-mono max-h-40 w-full relative border border-gray-200/50">
              <div className="absolute top-2 right-2 z-10">
                <button_1.Button variant="ghost" size="sm" className="h-6 text-xs transition-all duration-200 bg-gray-50/80 backdrop-blur-sm" onClick={copyLogsToClipboard}>
                  {hasCopied ? (<lucide_react_1.Check className="w-3 h-3 mr-1 text-green-500"/>) : (<lucide_react_1.Copy className="w-3 h-3 mr-1"/>)}
                  {hasCopied ? 'copied!' : 'copy'}
                </button_1.Button>
              </div>
              <div className="p-2 overflow-y-auto max-h-40">
                {logs.map((log, i) => (<div key={i} className="text-gray-600">
                    {log}
                  </div>))}
              </div>
            </div>
          </collapsible_1.CollapsibleContent>
        </collapsible_1.Collapsible>
      </div>
    </div>);
}
