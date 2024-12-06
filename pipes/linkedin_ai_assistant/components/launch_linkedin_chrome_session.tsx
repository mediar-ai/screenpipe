"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Chrome, ArrowRight, CheckCircle, LogIn } from "lucide-react";

export function LaunchLinkedInChromeSession() {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'idle'>('idle');
  const [loginStatus, setLoginStatus] = useState<'checking' | 'logged_in' | 'logged_out' | null>(null);

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
          return;
        }
      } catch (error) {
        console.error('Error checking debugger status:', error);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    // If polling fails after max attempts
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
      setLoginStatus(data.isLoggedIn ? 'logged_in' : 'logged_out');
    } catch (error) {
      console.error('failed to check login status:', error);
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
      <div className="flex gap-2">
        <Button
          onClick={launchChrome}
          disabled={status === 'connecting'}
          className="flex items-center gap-2"
        >
          <Chrome className="w-4 h-4" />
          {status === 'connecting'
            ? 'launching chrome...'
            : status === 'connected'
            ? 'relaunch chrome'
            : 'launch chrome'}
        </Button>

        {status === 'connected' && (
          <Button
            onClick={killChrome}
            variant="destructive"
            className="flex items-center gap-2"
          >
            kill chrome
          </Button>
        )}
      </div>

      {status === 'connected' && (
        <>
          <Button
            onClick={navigateToLinkedIn}
            className="flex items-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            navigate to linkedin
          </Button>

          {loginStatus === 'checking' && (
            <div className="text-sm text-gray-500">
              checking login status...
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
