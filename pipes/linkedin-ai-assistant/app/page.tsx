"use client";

import { useState } from "react";
import { LaunchLinkedInChromeSession } from "@/components/launch-linkedin-chrome-session";
// import { IntroRequester } from "@/components/intro-requester";
import { ReloadButton } from "@/components/reload-button";
import { HarvestClosestConnections } from "@/components/harvest";

export default function Home() {
  const [loginStatus, setLoginStatus] = useState<'checking' | 'logged_in' | 'logged_out' | null>(null);

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
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold">getting started</h2>
            <LaunchLinkedInChromeSession
              loginStatus={loginStatus}
              setLoginStatus={setLoginStatus}
            />
            <ReloadButton />
          </div>
        </section>

        {loginStatus === 'logged_in' && (
          <section>
            <h2 className="text-xl font-semibold mb-4">available workflows</h2>
            <div className="grid gap-4">
              <div className="border rounded-lg p-4">
                <HarvestClosestConnections />
              </div>

              {/* <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-4">
                  send introduction requests to your network based on your criteria
                </p>
                <IntroRequester />
              </div> */}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
