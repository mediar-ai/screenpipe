"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { platform } from "@tauri-apps/plugin-os";
import posthog from "posthog-js";

const API = "http://localhost:3030";

export function AppleIntelligenceCard() {
  const [os, setOs] = useState<string>("");
  const [aiStatus, setAiStatus] = useState<
    "unknown" | "available" | "unavailable"
  >("unknown");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setOs(platform());
  }, []);

  // Load enabled state
  useEffect(() => {
    try {
      const stored = localStorage?.getItem("apple-intelligence-enabled");
      if (stored !== null) setEnabled(stored !== "false");
    } catch {}
  }, []);

  // Save enabled state
  const toggleEnabled = (val: boolean) => {
    setEnabled(val);
    try {
      localStorage?.setItem("apple-intelligence-enabled", String(val));
    } catch {}
    posthog.capture(val ? "apple_intelligence_enabled" : "apple_intelligence_disabled");
  };

  const statusCapturedRef = React.useRef(false);

  // Check AI availability
  const checkStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/ai/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const available = data.available ? "available" : "unavailable";
        setAiStatus(available as any);
        if (!statusCapturedRef.current) {
          statusCapturedRef.current = true;
          posthog.capture("apple_intelligence_status", {
            available: data.available,
            enabled,
          });
        }
      } else {
        setAiStatus("unavailable");
      }
    } catch {
      setAiStatus("unavailable");
    }
  }, [enabled]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  if (os && os !== "macos") return null;

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start p-4 gap-4">
          <div className="flex-shrink-0">
            <img
              src="/apple-intelligence-logo.svg"
              alt="Apple Intelligence"
              className="w-10 h-10 rounded-xl"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-foreground">
                Apple Intelligence
              </h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-full">
                on-device
              </span>
              {aiStatus === "available" && (
                <span className="px-2 py-0.5 text-xs font-medium bg-foreground text-background rounded-full">
                  available
                </span>
              )}
            </div>

            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              Generates a daily summary of your activity in the timeline at 6pm.
              Includes time breakdown, key moments, action items, and people
              mentioned. Runs entirely on-device using Apple&apos;s Foundation
              Models. Only processes when plugged in.
            </p>

            {aiStatus === "unavailable" && (
              <p className="text-xs text-muted-foreground mb-3">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                Requires macOS 26+ with Apple Intelligence enabled.
              </p>
            )}

            <div className="flex items-center gap-3">
              <Switch
                checked={enabled}
                onCheckedChange={toggleEnabled}
                disabled={aiStatus !== "available"}
              />
              <Label className="text-xs text-muted-foreground">
                {enabled ? "Daily summaries enabled" : "Daily summaries disabled"}
              </Label>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="px-4 py-2 bg-muted/50 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Summaries appear in your timeline · you can also generate manually
            </span>
            <span
              className={`ml-auto ${aiStatus === "available" ? "text-green-500" : ""}`}
            >
              {aiStatus === "available"
                ? "● on-device"
                : aiStatus === "unavailable"
                  ? "○ not available"
                  : "○ checking..."}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
