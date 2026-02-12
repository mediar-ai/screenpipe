"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Play,
  Trash2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  RefreshCw,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { homeDir, join } from "@tauri-apps/api/path";
import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
import { useSettings } from "@/lib/hooks/use-settings";

function parsePipeError(stderr: string): {
  type: "daily_limit" | "rate_limit" | "unknown";
  message: string;
  used?: number;
  limit?: number;
  resets_at?: string;
} {
  // stderr format: '429 "{\"error\":...}"\n' — inner quotes are backslash-escaped
  const jsonMatch = stderr.match(/\d{3}\s+"(.+)"/s);
  if (jsonMatch) {
    try {
      const raw = jsonMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const parsed = JSON.parse(raw);
      if (parsed.error === "daily_limit_exceeded") {
        return {
          type: "daily_limit",
          message: `daily limit reached (${parsed.used_today}/${parsed.limit_today})`,
          used: parsed.used_today,
          limit: parsed.limit_today,
          resets_at: parsed.resets_at,
        };
      }
      if (parsed.error === "rate limit exceeded") {
        return {
          type: "rate_limit",
          message: `rate limited — retrying automatically`,
        };
      }
    } catch {}
  }
  return { type: "unknown", message: stderr.slice(0, 150) };
}

interface PipeConfig {
  name: string;
  schedule: string;
  lookback: string;
  enabled: boolean;
  agent: string;
  model: string;
  provider?: string;
  config: Record<string, unknown>;
}

interface PipeStatus {
  config: PipeConfig;
  last_run: string | null;
  last_success: boolean | null;
  is_running: boolean;
  prompt_body: string;
  last_error: string | null;
}

interface PipeRunLog {
  pipe_name: string;
  started_at: string;
  finished_at: string;
  success: boolean;
  stdout: string;
  stderr: string;
}

export function PipesSection() {
  const [pipes, setPipes] = useState<PipeStatus[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [logs, setLogs] = useState<PipeRunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningPipe, setRunningPipe] = useState<string | null>(null);
  const { settings } = useSettings();

  const fetchPipes = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:3030/pipes");
      const data = await res.json();
      setPipes(data.data || []);
    } catch (e) {
      console.error("failed to fetch pipes:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPipes();
    const interval = setInterval(fetchPipes, 10000);
    return () => clearInterval(interval);
  }, [fetchPipes]);

  const fetchLogs = async (name: string) => {
    try {
      const res = await fetch(`http://localhost:3030/pipes/${name}/logs`);
      const data = await res.json();
      setLogs(data.data || []);
    } catch (e) {
      console.error("failed to fetch logs:", e);
    }
  };

  const togglePipe = async (name: string, enabled: boolean) => {
    await fetch(`http://localhost:3030/pipes/${name}/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    fetchPipes();
  };

  const runPipe = async (name: string) => {
    setRunningPipe(name);
    try {
      await fetch(`http://localhost:3030/pipes/${name}/run`, {
        method: "POST",
      });
      if (expanded === name) fetchLogs(name);
    } finally {
      setRunningPipe(null);
      fetchPipes();
    }
  };

  const deletePipe = async (name: string) => {
    await fetch(`http://localhost:3030/pipes/${name}`, { method: "DELETE" });
    setExpanded(null);
    fetchPipes();
  };

  const openPipesFolder = async () => {
    const home = await homeDir();
    const path = await join(home, ".screenpipe", "pipes");
    revealItemInDir(path);
  };

  const toggleExpand = (name: string) => {
    if (expanded === name) {
      setExpanded(null);
    } else {
      setExpanded(name);
      fetchLogs(name);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">pipes</h3>
          <p className="text-sm text-muted-foreground">
            scheduled agents that run on your screen data
            {" · "}
            <a
              href="https://docs.screenpi.pe/pipes"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground transition-colors"
            >
              docs
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {settings.user?.credits_balance != null && (
            <div className="flex items-center gap-1.5 mr-2">
              <Badge variant="outline" className="text-xs font-mono">
                {settings.user.credits_balance} credits
              </Badge>
              {settings.user.credits_balance <= 10 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => openUrl("https://screenpi.pe/onboarding")}
                >
                  buy more
                </Button>
              )}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={fetchPipes}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={openPipesFolder}>
            <FolderOpen className="h-4 w-4 mr-1" />
            open folder
          </Button>
        </div>
      </div>

      {pipes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>no pipes installed</p>
            <p className="text-sm mt-2">
              create a pipe at{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                ~/.screenpipe/pipes/my-pipe/pipe.md
              </code>
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Global daily limit banner — shown once at top */}
          {(() => {
            const limitError = pipes
              .filter((p) => p.last_success === false && p.last_error)
              .map((p) => parsePipeError(p.last_error!))
              .find((e) => e.type === "daily_limit");
            if (!limitError) return null;
            return (
              <div className="flex items-center gap-2 text-xs px-4 py-2 border rounded-md">
                <span className="text-muted-foreground">
                  {limitError.message}
                  {limitError.resets_at && (
                    <> · resets {new Date(limitError.resets_at).toLocaleTimeString()}</>
                  )}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => openUrl("https://screenpi.pe/onboarding?tab=pricing")}
                >
                  get more queries →
                </Button>
              </div>
            );
          })()}
          {pipes.map((pipe) => (
            <Card key={pipe.config.name}>
              <CardContent className="p-4">
                {/* Header row */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleExpand(pipe.config.name)}
                    className="flex items-center gap-1 text-sm font-medium flex-1 text-left"
                  >
                    {expanded === pipe.config.name ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    {pipe.config.name}
                  </button>

                  <Badge variant="outline" className="text-xs">
                    {pipe.config.schedule}
                  </Badge>

                  {pipe.is_running && (
                    <Badge variant="outline" className="text-xs">
                      running
                    </Badge>
                  )}

                  {pipe.last_run && (
                    <span className="text-xs text-muted-foreground">
                      {pipe.last_success === true ? "✓" : "✗"}{" "}
                      {new Date(pipe.last_run).toLocaleTimeString()}
                    </span>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => runPipe(pipe.config.name)}
                    disabled={
                      runningPipe === pipe.config.name || pipe.is_running
                    }
                  >
                    {runningPipe === pipe.config.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>

                  <Switch
                    checked={pipe.config.enabled}
                    onCheckedChange={(checked) =>
                      togglePipe(pipe.config.name, checked)
                    }
                  />
                </div>

                {/* Per-pipe error (skip daily_limit — shown globally above) */}
                {pipe.last_success === false && pipe.last_error && (() => {
                  const error = parsePipeError(pipe.last_error);
                  if (error.type === "daily_limit") return null;
                  if (error.type === "rate_limit") {
                    return (
                      <p className="mt-2 text-xs text-muted-foreground">{error.message}</p>
                    );
                  }
                  return (
                    <p className="mt-2 text-xs text-muted-foreground truncate max-w-full">
                      {error.message}
                    </p>
                  );
                })()}

                {/* Expanded detail */}
                {expanded === pipe.config.name && (
                  <div className="mt-4 space-y-4 border-t pt-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs">agent</Label>
                        <Input
                          value={pipe.config.agent}
                          disabled
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">model</Label>
                        <Input
                          value={pipe.config.model}
                          disabled
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">provider</Label>
                        <Input
                          value={pipe.config.provider || "screenpipe cloud"}
                          disabled
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      add <code>provider: anthropic</code> to pipe.md frontmatter to use your own key.{" "}
                      run <code>pi /login</code> in terminal to authenticate.
                    </p>

                    <div>
                      <Label className="text-xs">prompt</Label>
                      <Textarea
                        value={pipe.prompt_body}
                        readOnly
                        className="text-xs font-mono h-32"
                      />
                    </div>

                    {/* Logs */}
                    <div>
                      <Label className="text-xs">recent runs</Label>
                      <div className="mt-1 space-y-2 max-h-64 overflow-y-auto">
                        {logs.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            no runs yet — click ▶ to run manually
                          </p>
                        ) : (
                          logs
                            .slice()
                            .reverse()
                            .map((log, i) => (
                              <div
                                key={i}
                                className="border rounded p-2 space-y-1"
                              >
                                <div className="flex items-center gap-2 text-xs font-mono">
                                  <span className="text-muted-foreground">
                                    {new Date(log.started_at).toLocaleString()}
                                  </span>
                                  <span>
                                    {log.success ? "✓" : "✗"}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {Math.round(
                                      (new Date(log.finished_at).getTime() -
                                        new Date(log.started_at).getTime()) /
                                        1000
                                    )}
                                    s
                                  </span>
                                </div>
                                {log.success && log.stdout && (
                                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-20 overflow-y-auto">
                                    {log.stdout.slice(0, 500)}
                                  </pre>
                                )}
                                {!log.success && log.stderr && (
                                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-20 overflow-y-auto">
                                    {log.stderr.slice(0, 500)}
                                  </pre>
                                )}
                              </div>
                            ))
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deletePipe(pipe.config.name)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        delete
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
