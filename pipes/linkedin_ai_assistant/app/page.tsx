"use client";

import { useState } from "react";
import { LaunchLinkedInChromeSession } from "@/components/launch_linkedin_chrome_session";
import { IntroRequester } from "@/components/intro-requester";
import { ReloadButton } from "@/components/reload_button";
import { HarvestClosestConnections } from "@/components/harvest";

export default function Home() {
  const [loginStatus, setLoginStatus] = useState<'checking' | 'logged_in' | 'logged_out' | null>(null);

  return (
    <div className="min-h-screen w-full p-4 pb-20 sm:p-8">
      <div className="space-y-1.5 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">linkedin ai assistant</h1>
        <p className="text-sm text-muted-foreground">automate your linkedin interactions with ai</p>
      </div>

      <div className="flex flex-col gap-2 mb-8">
        <ReloadButton />
        <LaunchLinkedInChromeSession 
          loginStatus={loginStatus}
          setLoginStatus={setLoginStatus}
        />
      </div>

      {loginStatus === 'logged_in' && (
        <div className="w-full space-y-6">
          <h2 className="text-2xl font-semibold mb-6">workflows</h2>
          <div className="space-y-6 text-lg">
            <HarvestClosestConnections />
            <IntroRequester />
          </div>
        </div>
      )}
    </div>
  );
}
