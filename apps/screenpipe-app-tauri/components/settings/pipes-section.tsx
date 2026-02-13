"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Check,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { homeDir, join } from "@tauri-apps/api/path";
import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
import { useSettings } from "@/lib/hooks/use-settings";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import posthog from "posthog-js";

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
      if (parsed.error === "credits_exhausted") {
        return {
          type: "daily_limit",
          message: parsed.message || "free credits exhausted",
        };
      }
    } catch {}
  }
  return { type: "unknown", message: stderr.slice(0, 150) };
}

interface PipeConfig {
  name: string;
  schedule: string;
  enabled: boolean;
  agent: string;
  model: string;
  provider?: string;
  preset?: string;
  config: Record<string, unknown>;
}

interface PipeStatus {
  config: PipeConfig;
  last_run: string | null;
  last_success: boolean | null;
  is_running: boolean;
  prompt_body: string;
  raw_content: string;
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
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [refreshing, setRefreshing] = useState(false);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingSaves = useRef<Record<string, string>>({});
  const { settings } = useSettings();

  const fetchPipes = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:3030/pipes");
      const data = await res.json();
      const fetched: PipeStatus[] = data.data || [];
      setPipes(fetched);
      // Clear drafts that match the server content (already saved)
      setPromptDrafts((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const pipe of fetched) {
          if (next[pipe.config.name] && next[pipe.config.name] === pipe.raw_content) {
            delete next[pipe.config.name];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    } catch (e) {
      console.error("failed to fetch pipes:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const trackedPipesView = useRef(false);
  useEffect(() => {
    fetchPipes().then(() => {
      if (!trackedPipesView.current) {
        trackedPipesView.current = true;
        setPipes((current) => {
          if (current.length > 0) {
            posthog.capture("pipes_viewed", {
              count: current.length,
              enabled_count: current.filter(p => p.config.enabled).length,
              pipes: current.map(p => p.config.name),
            });
          }
          return current;
        });
      }
    });
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
    posthog.capture("pipe_toggled", { pipe: name, enabled });
    await fetch(`http://localhost:3030/pipes/${name}/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    fetchPipes();
  };

  const runPipe = async (name: string) => {
    posthog.capture("pipe_run", { pipe: name });
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
    posthog.capture("pipe_deleted", { pipe: name });
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

  const savePipeContent = useCallback(async (name: string, content: string) => {
    setSaveStatus((prev) => ({ ...prev, [name]: "saving" }));
    try {
      const res = await fetch(`http://localhost:3030/pipes/${name}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_content: content }),
      });
      const data = await res.json();
      // Server returns 200 even on error — check body for error field
      if (!res.ok || data.error) throw new Error(data.error || "save failed");
      setSaveStatus((prev) => ({ ...prev, [name]: "saved" }));
      // Don't clear draft or refetch — the 10s poll will sync.
      setTimeout(() => setSaveStatus((prev) => { const next = { ...prev }; delete next[name]; return next; }), 2000);
    } catch (e) {
      console.error("pipe save failed:", e);
      setSaveStatus((prev) => ({ ...prev, [name]: "error" }));
    }
  }, []);

  const handlePipeEdit = useCallback((name: string, value: string) => {
    setPromptDrafts((prev) => ({ ...prev, [name]: value }));
    pendingSaves.current[name] = value;
    // Clear existing timer
    if (debounceTimers.current[name]) {
      clearTimeout(debounceTimers.current[name]);
    }
    // Auto-save after 1.5s of no typing
    debounceTimers.current[name] = setTimeout(() => {
      delete pendingSaves.current[name];
      savePipeContent(name, value);
    }, 1500);
  }, [savePipeContent]);

  // Flush pending saves on unmount (e.g. switching settings tabs)
  useEffect(() => {
    const timers = debounceTimers;
    const pending = pendingSaves;
    const save = savePipeContent;
    return () => {
      for (const timer of Object.values(timers.current)) {
        clearTimeout(timer);
      }
      for (const [name, content] of Object.entries(pending.current)) {
        save(name, content);
      }
    };
  }, [savePipeContent]);

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
                  onClick={() => setShowUpgrade(true)}
                >
                  buy more
                </Button>
              )}
            </div>
          )}
          <Button variant="outline" size="sm" disabled={refreshing} onClick={async () => {
            setRefreshing(true);
            await fetchPipes();
            setRefreshing(false);
          }}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
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
                  onClick={() => setShowUpgrade(true)}
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
                    <div>
                      <Label className="text-xs">ai preset</Label>
                      <select
                        value={pipe.config.preset || ""}
                        onChange={async (e) => {
                          const val = e.target.value;
                          await fetch(`http://localhost:3030/pipes/${pipe.config.name}/config`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ preset: val || null }),
                          });
                          fetchPipes();
                        }}
                        className="w-full h-8 text-xs border rounded px-2 bg-background"
                      >
                        <option value="">none (use pipe defaults)</option>
                        {(settings.aiPresets || []).map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.id} — {p.model} ({p.provider})
                            {p.defaultPreset ? " ★" : ""}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        uses model & provider from your ai settings preset
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">pipe.md</Label>
                        {saveStatus[pipe.config.name] === "saving" && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> saving...
                          </span>
                        )}
                        {saveStatus[pipe.config.name] === "saved" && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Check className="h-3 w-3" /> saved
                          </span>
                        )}
                        {saveStatus[pipe.config.name] === "error" && (
                          <span className="text-[11px] text-destructive">save failed</span>
                        )}
                        {promptDrafts[pipe.config.name] !== undefined && !saveStatus[pipe.config.name] && (
                          <span className="text-[11px] text-muted-foreground">unsaved</span>
                        )}
                      </div>
                      <Textarea
                        value={promptDrafts[pipe.config.name] ?? pipe.raw_content}
                        onChange={(e) => handlePipeEdit(pipe.config.name, e.target.value)}
                        className="text-xs font-mono h-64 mt-1"
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

      <UpgradeDialog
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        reason="daily_limit"
        source="pipes"
      />
    </div>
  );
}
