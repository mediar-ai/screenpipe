"use client";

import { useState, useEffect } from "react";
import { LaunchLinkedInChromeSession } from "@/components/launch-linkedin-chrome-session";
import { IntroRequester } from "@/components/intro-requester";
import { ReloadButton } from "@/components/reload-button";
import { HarvestClosestConnections } from "@/components/harvest";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function Home() {
  const [loginStatus, setLoginStatus] = useState<'checking' | 'logged_in' | 'logged_out' | null>(null);
  const [isGettingStartedOpen, setIsGettingStartedOpen] = useState(true);

  useEffect(() => {
    if (loginStatus === 'logged_in') {
      setIsGettingStartedOpen(false);
    }
  }, [loginStatus]);

  return (
    <div className="min-h-screen w-full p-4 pb-20 sm:p-8">
      <div className="space-y-1.5 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">linkedin ai assistant</h1>
        <p className="text-sm text-muted-foreground">automate your linkedin interactions with ai</p>
        <p className="text-sm text-muted-foreground mt-4">
          this tool helps you manage your linkedin network by automating common tasks. you can harvest connections 
          from your network and request introductions using ai-powered workflows. make sure you&apos;re logged into 
          linkedin before starting any automation.
        </p>
      </div>

      <div className="space-y-8">
        <section>
          <button 
            onClick={() => setIsGettingStartedOpen(!isGettingStartedOpen)}
            className="flex items-center w-full hover:text-gray-600 transition-colors"
          >
            <h2 className="text-xl font-semibold">getting started</h2>
            {isGettingStartedOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {isGettingStartedOpen && (
            <div className="border rounded-lg p-4 space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                follow these steps to begin using the linkedin ai assistant:
              </p>
              <div className="flex flex-col gap-2">
                <LaunchLinkedInChromeSession
                  loginStatus={loginStatus}
                  setLoginStatus={setLoginStatus}
                />
                <ReloadButton />
              </div>
            </div>
          )}
        </section>

        {loginStatus === 'logged_in' && (
          <section>
            <h2 className="text-xl font-semibold mb-4">available workflows</h2>
            <div className="grid gap-4">
              <div className="border rounded-lg p-4">
                <HarvestClosestConnections />
              </div>

              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-4">
                  send introduction requests to your network based on your criteria
                </p>
                <IntroRequester />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
