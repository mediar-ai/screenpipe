// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { open } from "@tauri-apps/plugin-shell";
import { buildPerplexitySetupCommand } from "@/lib/ai-tools-mcp";

export function PerplexitySetup() {
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const copyCommand = async () => {
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(await buildPerplexitySetupCommand());
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  return (
    <div className="border-t border-border/60 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
          <img src="/images/perplexity.svg" alt="" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[13px] text-foreground">Perplexity</span>
          <span className="ml-2 text-xs text-muted-foreground">Set up in the Mac app</span>
        </div>
        <Button type="button" size="sm" variant="outline" aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)} className="h-7 text-xs normal-case font-sans tracking-normal">
          {expanded ? "Hide setup" : "Set up"}
        </Button>
      </div>
      {expanded && (
        <div className="mt-3 space-y-3 text-xs text-muted-foreground">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>In Perplexity, open Account settings → Connectors and install its helper when prompted. Availability depends on your Perplexity plan.</li>
            <li>Choose Add connector → Simple. Name it Screenpipe and paste the setup command below.</li>
            <li>Save, wait for Running, then enable Screenpipe under Sources in a new chat. Keep Screenpipe running.</li>
          </ol>
          <div className="flex items-center gap-3">
            <Button type="button" size="sm" variant="outline" disabled={copyState === "copying"}
              onClick={copyCommand} className="h-7 text-xs normal-case font-sans tracking-normal">
              {copyState === "copying" ? "Preparing…" : copyState === "copied" ? "Command copied" : "Copy setup command"}
            </Button>
            <button type="button" className="underline" onClick={() => void open("https://www.perplexity.ai/help-center/en/articles/11502712-local-and-remote-mcps-for-perplexity").catch(() => {})}>
              Perplexity setup guide
            </button>
          </div>
          <p>The command contains your local access key. Paste it only into Perplexity’s connector settings.</p>
          {copyState === "error" && <p role="alert">Could not copy the command. Check that Screenpipe is running and try again.</p>}
          <p>Try: “Use Screenpipe to summarize today by client and draft my timesheet. Cite the activity you found.”</p>
          <p>Connection status and removal are managed in Perplexity.</p>
        </div>
      )}
    </div>
  );
}
