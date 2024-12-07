"use client";

import { useState } from "react";
import { LaunchLinkedInChromeSession } from "@/components/launch_linkedin_chrome_session";
import TemplateEditor from "@/components/settings_editor";
import template from "@/lib/storage/templates.json";
import { StartWorkflow } from "@/components/start_workflow";
import StateViewer from "@/components/state_viewer";
import { ReloadButton } from "@/components/reload_button";
import { HarvestClosestConnections } from "@/components/harvest";

export default function Home() {
  const [loginStatus, setLoginStatus] = useState<'checking' | 'logged_in' | 'logged_out' | null>(null);

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen w-full p-4 pb-20 gap-16 sm:p-8">
      <main className="w-full max-w-[95vw] flex flex-col gap-8 row-start-2 items-center sm:items-start justify-center">
        <div className="w-full flex justify-end">
        </div>
        <ReloadButton />
        <LaunchLinkedInChromeSession 
          loginStatus={loginStatus}
          setLoginStatus={setLoginStatus}
        />
        {loginStatus === 'logged_in' && (
          <>
            <HarvestClosestConnections />
            {/* <TemplateEditor initialTemplate={template} />
            <StartWorkflow />
            <StateViewer /> */}
          </>
        )}
      </main>
    </div>
  );
}
