"use client";

import React from "react";
import { ShareLogsButton } from "@/components/share-logs-button";
import { MessageSquare, Github } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";

export function FeedbackSection() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Send Feedback
        </h1>
        <p className="text-muted-foreground text-lg">
          Help us improve screenpipe by sharing your feedback
        </p>
      </div>

      <div className="space-y-6">
        <div className="p-6 bg-card rounded-xl border border-border">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-primary/10 rounded-lg">
              <MessageSquare className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">Share Your Thoughts</h3>
              <p className="text-sm text-muted-foreground">
                Your feedback helps us make screenpipe better. Logs are automatically
                included to help us diagnose any issues you&apos;re experiencing.
              </p>
            </div>
          </div>

          <ShareLogsButton showShareLink={true} />
        </div>

        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>What gets sent:</strong> Your feedback message, app logs, system info
            (OS version, app version), and any screenshots or recordings you choose to attach.
            No personal screen content is sent unless you explicitly attach it.
          </p>
        </div>

        <div className="p-6 bg-card rounded-xl border border-border">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Github className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">GitHub Issues</h3>
              <p className="text-sm text-muted-foreground mb-3">
                For product ideas, bugs, suggestions, or feature requests, you can also open an issue on GitHub.
              </p>
              <button
                onClick={() => open("https://github.com/mediar-ai/screenpipe/issues")}
                className="text-sm text-primary hover:underline"
              >
                github.com/mediar-ai/screenpipe/issues →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
