"use client";

import React from "react";
import { ShareLogsButton } from "@/components/share-logs-button";
import { MessageSquare, Github, Lightbulb } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";

export function FeedbackSection() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Feedback
        </h1>
        <p className="text-muted-foreground text-sm">
          Help us improve screenpipe
        </p>
      </div>

      <div className="space-y-2">
        <div className="px-3 py-2.5 bg-card rounded-lg border border-border">
          <div className="flex items-center gap-2.5 mb-2.5">
            <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-foreground">Share your thoughts</h3>
              <p className="text-xs text-muted-foreground">Logs are included automatically</p>
            </div>
          </div>
          <ShareLogsButton showShareLink={true} />
        </div>

        <div className="px-3 py-2.5 bg-card rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-foreground">Feature ideas</h3>
                <p className="text-xs text-muted-foreground">Vote or submit requests</p>
              </div>
            </div>
            <button
              onClick={() => open("https://screenpi.pe/ideas")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              screenpi.pe/ideas →
            </button>
          </div>
        </div>

        <div className="px-3 py-2.5 bg-card rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Github className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-foreground">GitHub issues</h3>
                <p className="text-xs text-muted-foreground">Bugs & technical issues</p>
              </div>
            </div>
            <button
              onClick={() => open("https://github.com/screenpipe/screenpipe/issues")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Open →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
