"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderOpen,
  RefreshCw,
  Check,
  Loader2,
  AlertCircle,
  Clock,
  FileText,
  ExternalLink,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/lib/hooks/use-settings";
import { useToast } from "@/components/ui/use-toast";

// Types matching Rust structs
interface ObsidianSyncSettings {
  enabled: boolean;
  vaultPath: string;
  syncIntervalMinutes: number;
  customPrompt: string;
  lastSyncTime: string | null;
  syncHours: number;
}

interface ObsidianSyncStatus {
  isSyncing: boolean;
  lastSyncTime: string | null;
  lastError: string | null;
  notesCreatedToday: number;
}

const DEFAULT_SETTINGS: ObsidianSyncSettings = {
  enabled: false,
  vaultPath: "",
  syncIntervalMinutes: 0, // 0 = manual only
  customPrompt: "",
  lastSyncTime: null,
  syncHours: 2,
};

export function ObsidianSyncCard() {
  const { settings: appSettings } = useSettings();
  const { toast } = useToast();

  const [settings, setSettings] = useState<ObsidianSyncSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<ObsidianSyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    lastError: null,
    notesCreatedToday: 0,
  });
  const [suggestedPaths, setSuggestedPaths] = useState<string[]>([]);
  const [isValidVault, setIsValidVault] = useState<boolean | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("obsidian-sync-settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (e) {
        console.error("Failed to parse obsidian settings:", e);
      }
    }

    // Fetch suggested vault paths
    fetchVaultPaths();

    // Get initial status
    fetchStatus();
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem("obsidian-sync-settings", JSON.stringify(settings));
  }, [settings]);

  // Validate vault path when it changes
  useEffect(() => {
    if (settings.vaultPath) {
      validateVault(settings.vaultPath);
    } else {
      setIsValidVault(null);
    }
  }, [settings.vaultPath]);

  // Listen for sync events
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    listen<void>("obsidian_sync_started", () => {
      setStatus((s) => ({ ...s, isSyncing: true }));
    }).then((u) => unlisteners.push(u));

    listen<ObsidianSyncStatus>("obsidian_sync_completed", (event) => {
      setStatus(event.payload);
      toast({
        title: "Obsidian sync completed",
        description: "Your activity has been synced to Obsidian",
      });
    }).then((u) => unlisteners.push(u));

    listen<string>("obsidian_sync_error", (event) => {
      setStatus((s) => ({
        ...s,
        isSyncing: false,
        lastError: event.payload,
      }));
      toast({
        variant: "destructive",
        title: "Obsidian sync failed",
        description: event.payload,
      });
    }).then((u) => unlisteners.push(u));

    return () => {
      unlisteners.forEach((u) => u());
    };
  }, [toast]);

  const fetchVaultPaths = async () => {
    try {
      const paths = await invoke<string[]>("obsidian_get_vault_paths");
      setSuggestedPaths(paths);
    } catch (e) {
      console.error("Failed to fetch vault paths:", e);
    }
  };

  const fetchStatus = async () => {
    try {
      const status = await invoke<ObsidianSyncStatus>("obsidian_get_sync_status");
      setStatus(status);
    } catch (e) {
      console.error("Failed to fetch sync status:", e);
    }
  };

  const validateVault = useCallback(async (path: string) => {
    if (!path.trim()) {
      setIsValidVault(null);
      return;
    }

    setIsValidating(true);
    try {
      const isValid = await invoke<boolean>("obsidian_validate_vault", { path });
      setIsValidVault(isValid);
    } catch (e) {
      console.error("Failed to validate vault:", e);
      setIsValidVault(false);
    } finally {
      setIsValidating(false);
    }
  }, []);

  const handleBrowse = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Obsidian Vault",
      });
      if (selected && typeof selected === "string") {
        setSettings((s) => ({ ...s, vaultPath: selected }));
      }
    } catch (e) {
      console.error("Failed to open dialog:", e);
    }
  };

  const handleSync = async () => {
    if (!isValidVault) {
      toast({
        variant: "destructive",
        title: "Invalid vault",
        description: "Please select a valid Obsidian vault first",
      });
      return;
    }

    // Check if user is logged in (required for Claude API)
    if (!appSettings?.user?.token) {
      toast({
        variant: "destructive",
        title: "Login required",
        description: "Please log in to use Obsidian sync",
      });
      return;
    }

    try {
      await invoke("obsidian_run_sync", { settings });
    } catch (e) {
      console.error("Failed to run sync:", e);
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: String(e),
      });
    }
  };

  const handleEnableScheduler = async () => {
    if (!isValidVault || settings.syncIntervalMinutes === 0) {
      return;
    }

    try {
      const newSettings = { ...settings, enabled: true };
      setSettings(newSettings);
      await invoke("obsidian_start_scheduler", { settings: newSettings });
      toast({
        title: "Scheduler started",
        description: `Syncing every ${settings.syncIntervalMinutes} minutes`,
      });
    } catch (e) {
      console.error("Failed to start scheduler:", e);
      toast({
        variant: "destructive",
        title: "Failed to start scheduler",
        description: String(e),
      });
    }
  };

  const handleDisableScheduler = async () => {
    try {
      setSettings((s) => ({ ...s, enabled: false }));
      await invoke("obsidian_stop_scheduler");
      toast({
        title: "Scheduler stopped",
      });
    } catch (e) {
      console.error("Failed to stop scheduler:", e);
    }
  };

  const openObsidian = async () => {
    if (!settings.vaultPath) return;

    // Extract vault name from path
    const vaultName = settings.vaultPath.split("/").pop() || "vault";
    const deepLink = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=screenpipe%2Flogs`;

    try {
      await openUrl(deepLink);
    } catch (e) {
      console.error("Failed to open Obsidian:", e);
    }
  };

  const formatLastSync = (isoTime: string | null) => {
    if (!isoTime) return "Never";

    const date = new Date(isoTime);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    return date.toLocaleDateString();
  };

  const isLoggedIn = Boolean(appSettings?.user?.token);

  return (
    <Card className="border-border bg-card shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start p-6 gap-6">
          {/* Obsidian Logo */}
          <div className="flex-shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center">
              <FileText className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-semibold text-foreground">
                Obsidian Sync
              </h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-full">
                PKM
              </span>
              {settings.enabled && (
                <span className="px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-500 rounded-full">
                  ● auto-sync
                </span>
              )}
            </div>
            <p className="text-muted-foreground mb-4">
              Automatically sync your screen activity to Obsidian as markdown
              notes. Powered by Claude AI.
            </p>

            {!isLoggedIn && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-4">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  <AlertCircle className="h-4 w-4 inline mr-2" />
                  Login required to use Obsidian sync (requires Claude API access)
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => setIsExpanded(!isExpanded)}
                variant="outline"
                className="gap-2"
              >
                {isExpanded ? "Hide Settings" : "Configure"}
              </Button>

              <Button
                onClick={handleSync}
                disabled={!isValidVault || status.isSyncing || !isLoggedIn}
                className="gap-2"
              >
                {status.isSyncing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Sync Now
                  </>
                )}
              </Button>

              {settings.vaultPath && (
                <Button
                  variant="outline"
                  onClick={openObsidian}
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in Obsidian
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Expanded Settings */}
        {isExpanded && (
          <div className="px-6 pb-6 space-y-4 border-t border-border pt-4">
            {/* Vault Path */}
            <div className="space-y-2">
              <Label htmlFor="vault-path" className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Obsidian Vault Path
              </Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    id="vault-path"
                    value={settings.vaultPath}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, vaultPath: e.target.value }))
                    }
                    placeholder="/path/to/your/vault"
                    className={
                      isValidVault === true
                        ? "border-green-500"
                        : isValidVault === false
                        ? "border-red-500"
                        : ""
                    }
                  />
                  {isValidating && (
                    <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <Button type="button" variant="outline" onClick={handleBrowse}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              {isValidVault === true && (
                <p className="text-sm text-green-500 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Valid Obsidian vault
                </p>
              )}
              {isValidVault === false && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Not a valid Obsidian vault
                  (no .obsidian folder)
                </p>
              )}
              {/* Suggested paths */}
              {suggestedPaths.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {suggestedPaths.map((path) => (
                    <Badge
                      key={path}
                      variant="outline"
                      className="cursor-pointer hover:bg-muted"
                      onClick={() =>
                        setSettings((s) => ({ ...s, vaultPath: path }))
                      }
                    >
                      {path.split("/").pop()}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Sync Hours */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Hours to sync
              </Label>
              <Select
                value={String(settings.syncHours)}
                onValueChange={(v) =>
                  setSettings((s) => ({ ...s, syncHours: parseInt(v) }))
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 1 hour</SelectItem>
                  <SelectItem value="2">Last 2 hours</SelectItem>
                  <SelectItem value="4">Last 4 hours</SelectItem>
                  <SelectItem value="8">Last 8 hours</SelectItem>
                  <SelectItem value="24">Last 24 hours</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How far back to look when syncing
              </p>
            </div>

            {/* Auto-sync Interval */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Auto-sync interval
              </Label>
              <div className="flex gap-2 items-center">
                <Select
                  value={String(settings.syncIntervalMinutes)}
                  onValueChange={(v) =>
                    setSettings((s) => ({
                      ...s,
                      syncIntervalMinutes: parseInt(v),
                    }))
                  }
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Manual only</SelectItem>
                    <SelectItem value="15">Every 15 minutes</SelectItem>
                    <SelectItem value="30">Every 30 minutes</SelectItem>
                    <SelectItem value="60">Every hour</SelectItem>
                    <SelectItem value="120">Every 2 hours</SelectItem>
                  </SelectContent>
                </Select>
                {settings.syncIntervalMinutes > 0 && (
                  <Button
                    variant={settings.enabled ? "destructive" : "default"}
                    size="sm"
                    onClick={
                      settings.enabled
                        ? handleDisableScheduler
                        : handleEnableScheduler
                    }
                    disabled={!isValidVault || !isLoggedIn}
                  >
                    {settings.enabled ? "Stop" : "Start"}
                  </Button>
                )}
              </div>
            </div>

            {/* Custom Prompt */}
            <div className="space-y-2">
              <Label htmlFor="custom-prompt">
                Custom instructions (optional)
              </Label>
              <Textarea
                id="custom-prompt"
                value={settings.customPrompt}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, customPrompt: e.target.value }))
                }
                placeholder="Add any custom instructions for how to structure your notes, what to focus on, naming conventions, etc."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                These instructions will be added to the AI prompt
              </p>
            </div>
          </div>
        )}

        {/* Status Bar */}
        <div className="px-6 py-3 bg-muted/50 border-t border-border">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>
                Last sync:{" "}
                <span className="text-foreground">
                  {formatLastSync(status.lastSyncTime)}
                </span>
              </span>
              {status.notesCreatedToday > 0 && (
                <span>
                  {status.notesCreatedToday} sync
                  {status.notesCreatedToday > 1 ? "s" : ""} today
                </span>
              )}
            </div>
            {status.lastError && (
              <span className="text-red-500 text-xs truncate max-w-xs">
                Error: {status.lastError}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
