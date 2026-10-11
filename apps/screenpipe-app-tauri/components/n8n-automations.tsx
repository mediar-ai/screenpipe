// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useGT } from "gt-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ServerEditor } from "@/components/settings/custom-mcp-card";
import { localFetch } from "@/lib/api";
import { notifyConnectionsUpdated } from "@/lib/connections-events";
import type { McpServer } from "@/lib/mcp-registry";
import {
  canBuildN8nWorkflow,
  isN8nServer,
  n8nBaseUrl,
  n8nBuildPrefill,
  n8nEndpoint,
  parseN8nWorkflows,
  type N8nWorkflow,
} from "@/lib/n8n";

const DRAFT_KEY = "screenpipe:n8n-build-draft";
const EXAMPLES = [
  {
    title: "Save invoice attachments",
    prompt:
      "When an invoice arrives in Gmail, save its PDF attachments to a Google Drive folder and add a row to Google Sheets. Ask me which folder and sheet to use.",
  },
  {
    title: "Triage support requests",
    prompt:
      "When a support request arrives in Gmail, classify it and post a short summary with a link to the email in a Slack channel. Ask me which mailbox and channel to use.",
  },
  {
    title: "Prepare a weekly report",
    prompt:
      "Every Friday, read this week's rows from Google Sheets and prepare a summary email as a Gmail draft. Ask me which sheet and recipients to use.",
  },
];

export function N8nAutomations() {
  const ui = useGT();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{
    server: McpServer;
    mode: "create" | "edit";
  } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [status, setStatus] = useState<{
    id: string;
    state: "checking" | "ready" | "limited" | "error" | "disabled";
  }>({ id: "", state: "checking" });
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([]);
  const [listState, setListState] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    try {
      setPrompt(sessionStorage.getItem(DRAFT_KEY) ?? "");
    } catch {
      /* Drafts still work in memory. */
    }
    setDraftLoaded(true);
  }, []);
  useEffect(() => {
    if (draftLoaded) {
      try {
        sessionStorage.setItem(DRAFT_KEY, prompt);
      } catch {
        /* Storage is optional. */
      }
    }
  }, [prompt, draftLoaded]);

  const refreshServers = useCallback(async () => {
    setLoadError(false);
    try {
      const response = await localFetch("/mcp-servers", {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (!Array.isArray(body.data)) throw new Error();
      if (!mounted.current) return;
      const list = (body.data as McpServer[]).filter(isN8nServer);
      setServers(list);
      setSelectedId((current) =>
        list.some((server) => server.id === current)
          ? current
          : (list[0]?.id ?? ""),
      );
    } catch {
      if (mounted.current) setLoadError(true);
    } finally {
      if (mounted.current) setLoaded(true);
    }
  }, []);
  useEffect(() => {
    void refreshServers();
  }, [refreshServers]);
  const selected = servers.find((server) => server.id === selectedId);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let cancelled = false;
    const id = selected.id;
    setWorkflows([]);
    setListState("loading");
    setStatus({ id, state: selected.enabled ? "checking" : "disabled" });
    if (!selected.enabled) {
      clearTimeout(timer);
      return;
    }
    void (async () => {
      try {
        const response = await localFetch(
          `/mcp-servers/${encodeURIComponent(id)}/tools`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (!Array.isArray(body.data?.tools)) throw new Error();
        if (cancelled) return;
        setStatus({
          id,
          state: canBuildN8nWorkflow(body.data.tools) ? "ready" : "limited",
        });
        if (
          !body.data.tools.some(
            (tool: { name: string }) => tool.name === "search_workflows",
          )
        ) {
          setListState("unavailable");
          return;
        }
        try {
          const list = await localFetch(
            `/mcp-servers/${encodeURIComponent(id)}/call`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                tool: "search_workflows",
                arguments: { limit: 20 },
              }),
            },
          );
          if (!list.ok) throw new Error();
          const rows = parseN8nWorkflows((await list.json()).data);
          if (!cancelled) {
            setWorkflows(rows);
            setListState("ready");
          }
        } catch {
          if (!cancelled) setListState("error");
        }
      } catch {
        if (!cancelled) {
          setStatus({ id, state: "error" });
          setListState("unavailable");
        }
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [selected, refreshKey]);

  const ready =
    !loadError &&
    selected?.enabled &&
    status.id === selected.id &&
    status.state === "ready";
  const setup = () => {
    setError("");
    try {
      const endpoint = n8nEndpoint(url);
      const existing = servers.find(
        (server) => n8nEndpoint(server.url) === endpoint,
      );
      setEditing(
        existing
          ? { server: existing, mode: "edit" }
          : {
              mode: "create",
              server: {
                id: `n8n-${crypto.randomUUID()}`,
                name: "n8n",
                url: endpoint,
                enabled: true,
                header_names: [],
                created_at: Math.floor(Date.now() / 1000),
              },
            },
      );
    } catch {
      setError(
        ui(
          "Enter an HTTPS n8n instance URL or MCP server URL. Localhost may use HTTP. Leave out passwords, query parameters, and fragments.",
        ),
      );
    }
  };
  const open = async (target: string) => {
    try {
      await openUrl(target);
    } catch {
      setError(ui("Could not open n8n. Try again."));
    }
  };
  const build = () => {
    if (!ready || !selected || !prompt.trim()) return;
    try {
      sessionStorage.setItem(
        "pendingChatPrefill",
        JSON.stringify(n8nBuildPrefill(selected, prompt)),
      );
      const destination = new URL(window.location.href);
      destination.searchParams.set("section", "home");
      destination.searchParams.delete("tab");
      window.location.href = destination.toString();
    } catch {
      setError(
        ui(
          "Could not open chat. Your request is still here; please try again.",
        ),
      );
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border">
          <GitBranch className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {ui("From a request to a workflow")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {ui(
              "Describe the work. Your agent builds a draft in n8n. Connect your apps there, test it, then publish.",
            )}
          </p>
        </div>
      </div>
      {!loaded ? (
        <p role="status" className="text-sm text-muted-foreground">
          {ui("Loading n8n connections…")}
        </p>
      ) : loadError ? (
        <div
          role="alert"
          className="rounded-lg border border-border p-4 text-sm"
        >
          {ui("Could not load n8n connections.")}{" "}
          <Button variant="outline" size="sm" onClick={refreshServers}>
            {ui("Retry")}
          </Button>
        </div>
      ) : selected ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
          <div className="min-w-0 flex-1">
            <Label
              htmlFor="n8n-instance"
              className="text-xs text-muted-foreground"
            >
              {ui("n8n instance")}
            </Label>
            <select
              id="n8n-instance"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="mt-1 block w-full min-w-0 bg-background text-sm font-medium"
            >
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {n8nBaseUrl(server.url)}
                </option>
              ))}
            </select>
            <p
              role="status"
              className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              {status.state === "checking" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : ready ? (
                <Check className="h-3 w-3" />
              ) : null}
              {status.state === "checking"
                ? ui("Checking workflow builder…")
                : ready
                  ? ui("Connected · Workflow builder available")
                  : status.state === "limited"
                    ? ui(
                        "Connected, but workflow building is unavailable. Check your n8n version and MCP permissions.",
                      )
                    : status.state === "disabled"
                      ? ui("Connection disabled. Enable it to build workflows.")
                      : ui(
                          "Could not reach n8n. Check your connection or sign in again.",
                        )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label={ui("Refresh n8n")}
            onClick={() => {
              void refreshServers();
              setRefreshKey((key) => key + 1);
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing({ server: selected, mode: "edit" })}
          >
            {ui("Connection settings")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => open(n8nBaseUrl(selected.url))}
          >
            {ui("Open n8n")}
            <ExternalLink className="ml-2 h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">
              {ui("Connect your n8n instance")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {ui(
                "In n8n, enable Settings → Instance-level MCP. Paste the server URL here, then sign in.",
              )}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="n8n-url" className="text-xs">
                {ui("n8n URL")}
              </Label>
              <Input
                id="n8n-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://your-team.app.n8n.cloud"
                onKeyDown={(event) => {
                  if (event.key === "Enter") setup();
                }}
                className="mt-1"
              />
            </div>
            <Button onClick={setup} disabled={!url.trim()}>
              {ui("Connect n8n")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {ui(
              "Use n8n Cloud or your own instance. Workflow building requires n8n 2.13 or later and access to its builder tools.",
            )}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="space-y-3">
        <Label htmlFor="n8n-request" className="text-sm font-semibold">
          {ui("What should the workflow do?")}
        </Label>
        <div className="rounded-lg border border-border overflow-hidden">
          <Textarea
            id="n8n-request"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={ui(
              "When an invoice arrives in Gmail, save the attachment to Drive and add a row to Sheets…",
            )}
            className="min-h-[110px] resize-y border-0 shadow-none focus-visible:ring-inset"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-3 py-3">
            <p className="text-xs text-muted-foreground">
              {ready
                ? ui(
                    "Continues in Screenpipe chat. Accounts are connected in n8n.",
                  )
                : selected
                  ? ui("Resolve the connection check above to start building.")
                  : ui(
                      "Connect n8n to start building. You can write your request now.",
                    )}
            </p>
            <Button
              size="sm"
              disabled={!ready || !prompt.trim()}
              onClick={build}
            >
              {ui("Build with agent")}
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <Button
              key={example.title}
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setPrompt(example.prompt)}
            >
              {ui(example.title)}
            </Button>
          ))}
        </div>
      </div>
      {selected && (ready || status.state === "limited") && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {ui("Recent n8n workflows")}
            </h3>
            <span className="text-xs text-muted-foreground">
              {ui("Up to 20 workflows from this instance")}
            </span>
          </div>
          {listState === "loading" ? (
            <p role="status" className="text-sm text-muted-foreground">
              {ui("Loading workflows…")}
            </p>
          ) : listState === "error" ? (
            <p role="alert" className="text-sm text-muted-foreground">
              {ui("Could not load workflows. Refresh to try again.")}
            </p>
          ) : listState === "unavailable" ? (
            <p className="text-sm text-muted-foreground">
              {ui("This connection does not expose workflow search.")}
            </p>
          ) : workflows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {ui("No workflows found. Describe your first one above.")}
            </p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {workflows.map((workflow) => (
                <button
                  key={workflow.id}
                  onClick={() =>
                    open(
                      `${n8nBaseUrl(selected.url)}/workflow/${encodeURIComponent(workflow.id)}`,
                    )
                  }
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {workflow.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {workflow.active === true
                      ? ui("Published")
                      : workflow.active === false
                        ? ui("Draft")
                        : ui("Status unknown")}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {ui(
          "Your agent prepares the workflow; you connect accounts and review it in n8n before running it. Connecting n8n does not stream your screen history.",
        )}
      </p>
      <Dialog
        open={!!editing}
        onOpenChange={(value) => {
          if (!value) setEditing(null);
        }}
      >
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto p-0 gap-0">
          <DialogHeader className="p-4 border-b border-border">
            <DialogTitle>{ui("Connect n8n")}</DialogTitle>
            <DialogDescription>
              {ui(
                "Sign in to your n8n instance. Gmail, Slack, and other app accounts are connected inside n8n when you review a workflow.",
              )}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <ServerEditor
              key={editing.server.id}
              initial={editing.server}
              initialHeaders={editing.server.header_names.map((name) => ({
                name,
                value: "••••••••",
              }))}
              existingServers={servers}
              mode={editing.mode}
              notice={ui(
                "Enable Instance-level MCP in n8n first. If browser sign-in is unavailable, use Manual authentication with the access token from n8n's MCP settings.",
              )}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                notifyConnectionsUpdated();
                void refreshServers();
                setRefreshKey((key) => key + 1);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
