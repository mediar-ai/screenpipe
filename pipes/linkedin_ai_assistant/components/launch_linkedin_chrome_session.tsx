"use client";

import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Chrome, ArrowRight, CheckCircle, LogIn, Loader2 } from "lucide-react";

interface Props {
  loginStatus: 'checking' | 'logged_in' | 'logged_out' | null;
  setLoginStatus: (status: 'checking' | 'logged_in' | 'logged_out' | null) => void;
}

type StatusType = 'connecting' | 'connected' | 'error' | 'idle';

export function LaunchLinkedInChromeSession({ loginStatus, setLoginStatus }: Props) {
  const [status, setStatus] = useState<StatusType>('idle');
  const [loginCheckInterval, setLoginCheckInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (loginCheckInterval) {
        clearInterval(loginCheckInterval);
      }
    };
  }, [loginCheckInterval]);

  const killChrome = async () => {
    try {
      await fetch('/api/chrome', { method: 'DELETE' });
      setStatus('idle');
    } catch (error) {
      console.error('failed to kill chrome:', error);
    }
  };

  const launchChrome = async () => {
    try {
      await killChrome();
      setStatus('connecting');

      const response = await fetch('/api/chrome', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to launch chrome');

      // Start polling the server-side API for debugger URL
      pollDebuggerStatus();
    } catch (error) {
      console.error('failed to launch chrome:', error);
      setStatus('error');
    }
  };

  const pollDebuggerStatus = async () => {
    let attempts = 0;
    const maxAttempts = 15;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch('/api/chrome/status');
        const data = await response.json();

        if (data.status === 'connected') {
          setStatus('connected');
          // Automatically navigate to LinkedIn when Chrome connects
          await navigateToLinkedIn();
          return;
        }
      } catch (error) {
        console.error('error checking debugger status:', error);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
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

      // Add login status check after navigation
      setLoginStatus('checking');
      await checkLoginStatus(statusData.wsUrl);
    } catch (error) {
      console.error('failed to navigate:', error);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {(status === 'idle' || status === 'connecting') && (
            <Button
              onClick={launchChrome}
              disabled={status === 'connecting'}
              className="flex items-center gap-2"
            >
              <Chrome className="w-4 h-4" />
              {status === 'connecting' ? 'launching chrome...' : 'launch'}
            </Button>
          )}
          {status === 'connected' && (
            <Button
              onClick={killChrome}
              variant="destructive"
              className="flex items-center gap-2"
            >
              restart chrome
            </Button>
          )}
        </div>
        <span className="text-xs text-gray-500">
          it will close your chrome browser, but you can restore tabs
        </span>
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
        <div className="text-sm text-red-500">
          failed to launch chrome
        </div>
      )}
    </div>
  );
}
