"use client";

import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Chrome, CheckCircle, LogIn, Loader2, Info, Copy, Check } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
// import { pipe } from "@screenpipe/js";

interface Props {
  loginStatus: 'checking' | 'logged_in' | 'logged_out' | null;
  setLoginStatus: (status: 'checking' | 'logged_in' | 'logged_out' | null) => void;
}

type StatusType = 'connecting' | 'connected' | 'error' | 'idle';

export function LaunchLinkedInChromeSession({ loginStatus, setLoginStatus }: Props) {
  const [status, setStatus] = useState<StatusType>('idle');
  const [loginCheckInterval, setLoginCheckInterval] = useState<NodeJS.Timeout | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (loginCheckInterval) {
        clearInterval(loginCheckInterval);
      }
    };
  }, [loginCheckInterval]);

  const addLog = (message: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    // Clean up embedded timestamps in the message
    const cleanMessage = message.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z - /, '');
    setLogs(prev => [...prev, `${time} - ${cleanMessage}`]);
  };

  const killChrome = async () => {
    try {
      addLog('killing chrome...');
      const response = await fetch('/api/chrome', { method: 'DELETE' });
      const data = await response.json();
      if (data.logs) {
        data.logs.forEach((log: string) => addLog(log));
      }
      setStatus('idle');
      addLog('chrome killed');
    } catch (error) {
      addLog(`error killing chrome: ${error}`);
      console.error('failed to kill chrome:', error);
    }
  };

  const launchChrome = async () => {
    try {
      await killChrome();
      setStatus('connecting');
      setError(null);

      // Get screen dimensions from browser
      const screenDims = {
        width: window.screen.availWidth,
        height: window.screen.availHeight
      };
      addLog(`screen dimensions: ${screenDims.width}x${screenDims.height}`);

      const response = await fetch('/api/chrome', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screenDims })
      });
      const data = await response.json();
      if (data.logs) {
        data.logs.forEach((log: string) => addLog(log));
      }
      if (!response.ok) {
        throw new Error(data.error || 'Failed to launch chrome');
      }

      // Start polling the server-side API for debugger URL
      pollDebuggerStatus();
    } catch (error) {
      console.error('failed to launch chrome:', error);
      setStatus('error');
      setError(error instanceof Error ? error.message : String(error));
    }
  };

  const pollDebuggerStatus = async () => {
    let attempts = 0;
    const maxAttempts = 15;

    while (attempts < maxAttempts) {
      try {
        addLog('polling debugger status...');
        const response = await fetch('/api/chrome/status');
        const data = await response.json();
        
        // Add logs from the status endpoint
        if (data.logs) {
          data.logs.forEach((log: string) => addLog(log));
        }
        
        addLog(`poll response: ${JSON.stringify(data)}`);

        if (data.status === 'connected') {
          addLog('debugger connected, proceeding to linkedin');
          setStatus('connected');
          await navigateToLinkedIn();
          return;
        }
        addLog(`not connected yet, attempt ${attempts + 1}/${maxAttempts}`);
      } catch (error) {
        addLog(`poll error: ${error}`);
        console.error('error checking debugger status:', error);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    addLog('max polling attempts reached, setting error state');
    setStatus('error');
  };

  const checkLoginStatus = async (wsUrl: string) => {
    try {
      const response = await fetch('/api/chrome/check-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wsUrl }),
      });
      
      if (!response.ok) throw new Error('Failed to check login status');
      const data = await response.json();
      
      // Add log handling
      if (data.logs) {
        data.logs.forEach((log: string) => addLog(log));
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
    } catch (error) {
      console.error('failed to check login status:', error);
      if (loginCheckInterval) {
        clearInterval(loginCheckInterval);
        setLoginCheckInterval(null);
      }
    }
  };

  const navigateToLinkedIn = async () => {
    try {
      // First get the wsUrl from status endpoint
      const statusResponse = await fetch('/api/chrome/status');
      const statusData = await statusResponse.json();
      
      if (statusData.status !== 'connected' || !statusData.wsUrl) {
        throw new Error('chrome not connected');
      }

      const response = await fetch('/api/chrome/navigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: 'https://www.linkedin.com',
          wsUrl: statusData.wsUrl 
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to navigate');
      }

      // Missing: We need to handle the response data and logs here
      const data = await response.json();
      if (data.logs) {
        data.logs.forEach((log: string) => addLog(log));
      }

      // Add login status check after navigation
      setLoginStatus('checking');
      await checkLoginStatus(statusData.wsUrl);
    } catch (error) {
      console.error('failed to navigate:', error);
    }
  };

  const copyLogsToClipboard = () => {
    const logsText = logs.join('\n');
    navigator.clipboard.writeText(logsText);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {(status === 'idle' || status === 'connecting') && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={launchChrome}
                  disabled={status === 'connecting'}
                  className="flex items-center gap-2"
                >
                  <Chrome className="w-4 h-4" />
                  {status === 'connecting' ? 'launching chrome...' : 'launch'}
                </Button>
                <HoverCard>
                  <HoverCardTrigger>
                    <Info className="w-4 h-4 text-gray-500" />
                  </HoverCardTrigger>
                  <HoverCardContent className="w-80">
                    <p className="text-sm text-gray-500">
                      opens linkedin in a new chrome window while keeping your existing tabs
                    </p>
                  </HoverCardContent>
                </HoverCard>
              </div>
            )}
            {status === 'connected' && (
              <Button
                onClick={killChrome}
                variant="destructive"
                className="flex items-center gap-2"
              >
                exit chrome
              </Button>
            )}
          </div>

          {status === 'connected' && (
            <>
              {loginStatus === 'checking' && (
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  checking linkedin login...
                </div>
              )}
              {loginStatus === 'logged_in' && (
                <div className="text-sm text-green-500 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  logged in to linkedin
                </div>
              )}
              {loginStatus === 'logged_out' && (
                <div className="text-sm text-amber-500 flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  please log in to linkedin
                </div>
              )}
            </>
          )}

          {status === 'error' && (
            <div className="text-sm text-red-500 flex items-center gap-2">
              <span>failed to launch chrome</span>
              {error && <span className="font-mono">({error})</span>}
            </div>
          )}
        </div>

        <Collapsible
          open={isLogsOpen}
          onOpenChange={setIsLogsOpen}
          className="w-auto"
        >
          <CollapsibleTrigger className="text-xs bg-gray-50 hover:bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
            {isLogsOpen ? 'hide logs' : 'show logs'}
          </CollapsibleTrigger>
          <CollapsibleContent className="absolute mt-2 right-0 left-0">
            <div className="bg-gray-50 rounded-md text-xs font-mono max-h-40 w-full relative border border-gray-200/50">
              <div className="absolute top-2 right-2 z-10">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs transition-all duration-200 bg-gray-50/80 backdrop-blur-sm"
                  onClick={copyLogsToClipboard}
                >
                  {hasCopied ? (
                    <Check className="w-3 h-3 mr-1 text-green-500" />
                  ) : (
                    <Copy className="w-3 h-3 mr-1" />
                  )}
                  {hasCopied ? 'copied!' : 'copy'}
                </Button>
              </div>
              <div className="p-2 overflow-y-auto max-h-40">
                {logs.map((log, i) => (
                  <div key={i} className="text-gray-600">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
