"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  Laptop,
  Trash2,
  Lock,
  Unlock,
  HardDrive,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface SyncStatus {
  enabled: boolean;
  isSyncing: boolean;
  lastSync: string | null;
  lastError: string | null;
  storageUsed: number | null;
  storageLimit: number | null;
  deviceCount: number | null;
  deviceLimit: number | null;
  syncTier: string | null;
}

interface SyncDevice {
  id: string;
  deviceId: string;
  deviceName: string | null;
  deviceOs: string;
  lastSyncAt: string | null;
  createdAt: string;
  isCurrent: boolean;
}

interface SyncConfig {
  enabled: boolean;
  syncIntervalMinutes: number;
  syncTranscripts: boolean;
  syncOcr: boolean;
  syncAudio: boolean;
  syncFrames: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function SyncSettings() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    loadSyncData();
  }, []);

  const loadSyncData = async () => {
    try {
      setIsLoading(true);
      const [statusResult, configResult, devicesResult] = await Promise.all([
        invoke<SyncStatus>("get_sync_status"),
        invoke<SyncConfig>("get_sync_config"),
        invoke<SyncDevice[]>("get_sync_devices"),
      ]);
      setStatus(statusResult);
      setConfig(configResult);
      setDevices(devicesResult);
    } catch (error) {
      console.error("failed to load sync data:", error);
      toast({
        title: "failed to load sync settings",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSync = async (enabled: boolean) => {
    if (enabled && !status?.enabled) {
      // Need to initialize sync
      setShowPasswordDialog(true);
      return;
    }

    try {
      await invoke("set_sync_enabled", { enabled });
      setStatus((prev) => (prev ? { ...prev, enabled } : null));
      toast({
        title: enabled ? "sync enabled" : "sync disabled",
        description: enabled
          ? "your data will now sync to the cloud"
          : "sync has been paused",
      });
    } catch (error) {
      toast({
        title: "failed to update sync",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleInitSync = async () => {
    if (!password) {
      toast({
        title: "password required",
        description: "please enter a password to encrypt your data",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsInitializing(true);
      const isNewUser = await invoke<boolean>("init_sync", { password });
      setShowPasswordDialog(false);
      setPassword("");

      toast({
        title: isNewUser ? "sync initialized" : "sync connected",
        description: isNewUser
          ? "your encryption keys have been generated"
          : "connected to your existing sync data",
      });

      await loadSyncData();
    } catch (error) {
      toast({
        title: "failed to initialize sync",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsInitializing(false);
    }
  };

  const handleTriggerSync = async () => {
    try {
      setIsSyncing(true);
      await invoke("trigger_sync");
      toast({
        title: "sync started",
        description: "syncing your data to the cloud",
      });

      // Poll for completion
      const checkSync = async () => {
        const newStatus = await invoke<SyncStatus>("get_sync_status");
        setStatus(newStatus);
        if (newStatus.isSyncing) {
          setTimeout(checkSync, 1000);
        } else {
          setIsSyncing(false);
          toast({
            title: "sync complete",
            description: "your data has been synced",
          });
        }
      };
      setTimeout(checkSync, 1000);
    } catch (error) {
      setIsSyncing(false);
      toast({
        title: "sync failed",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleUpdateConfig = async (updates: Partial<SyncConfig>) => {
    if (!config) return;

    const newConfig = { ...config, ...updates };
    try {
      await invoke("update_sync_config", { config: newConfig });
      setConfig(newConfig);
    } catch (error) {
      toast({
        title: "failed to update settings",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      await invoke("remove_sync_device", { deviceId });
      setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
      toast({
        title: "device removed",
        description: "the device has been unlinked from your sync",
      });
    } catch (error) {
      toast({
        title: "failed to remove device",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleDeleteCloudData = async () => {
    try {
      await invoke("delete_cloud_data");
      toast({
        title: "cloud data deleted",
        description: "all your cloud data has been permanently deleted",
      });
      await loadSyncData();
    } catch (error) {
      toast({
        title: "failed to delete data",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const storagePercent =
    status?.storageUsed && status?.storageLimit
      ? (status.storageUsed / status.storageLimit) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {status?.enabled ? (
            <Cloud className="h-5 w-5 text-primary" />
          ) : (
            <CloudOff className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <h3 className="text-lg font-medium">cloud sync</h3>
            <p className="text-sm text-muted-foreground">
              sync your data across devices with end-to-end encryption
            </p>
          </div>
        </div>
        <Switch
          checked={status?.enabled ?? false}
          onCheckedChange={handleToggleSync}
        />
      </div>

      {status?.enabled && (
        <>
          <Separator />

          {/* Status Card */}
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {status.isSyncing || isSyncing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm">syncing...</span>
                  </>
                ) : status.lastError ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-sm text-destructive">
                      {status.lastError}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">
                      {status.lastSync
                        ? `last synced ${formatRelativeTime(status.lastSync)}`
                        : "never synced"}
                    </span>
                  </>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTriggerSync}
                disabled={isSyncing || status.isSyncing}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${
                    isSyncing || status.isSyncing ? "animate-spin" : ""
                  }`}
                />
                sync now
              </Button>
            </div>

            {/* Storage Usage */}
            {status.storageLimit && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <span>storage</span>
                  </div>
                  <span className="text-muted-foreground">
                    {formatBytes(status.storageUsed ?? 0)} /{" "}
                    {formatBytes(status.storageLimit)}
                  </span>
                </div>
                <Progress value={storagePercent} className="h-2" />
              </div>
            )}

            {/* Tier Badge */}
            {status.syncTier && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{status.syncTier}</Badge>
                <span className="text-sm text-muted-foreground">
                  {status.deviceCount}/{status.deviceLimit} devices
                </span>
              </div>
            )}
          </Card>

          {/* Sync Options */}
          {config && (
            <>
              <Separator />
              <div className="space-y-4">
                <h4 className="text-sm font-medium">sync options</h4>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sync-transcripts" className="text-sm">
                      transcripts
                    </Label>
                    <Switch
                      id="sync-transcripts"
                      checked={config.syncTranscripts}
                      onCheckedChange={(checked) =>
                        handleUpdateConfig({ syncTranscripts: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="sync-ocr" className="text-sm">
                      OCR text
                    </Label>
                    <Switch
                      id="sync-ocr"
                      checked={config.syncOcr}
                      onCheckedChange={(checked) =>
                        handleUpdateConfig({ syncOcr: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="sync-audio" className="text-sm">
                      audio recordings
                    </Label>
                    <Switch
                      id="sync-audio"
                      checked={config.syncAudio}
                      onCheckedChange={(checked) =>
                        handleUpdateConfig({ syncAudio: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="sync-frames" className="text-sm">
                      screen frames
                    </Label>
                    <Switch
                      id="sync-frames"
                      checked={config.syncFrames}
                      onCheckedChange={(checked) =>
                        handleUpdateConfig({ syncFrames: checked })
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="sync-interval" className="text-sm">
                    sync frequency
                  </Label>
                  <Select
                    value={String(config.syncIntervalMinutes)}
                    onValueChange={(value) =>
                      handleUpdateConfig({ syncIntervalMinutes: parseInt(value) })
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 minute</SelectItem>
                      <SelectItem value="5">5 minutes</SelectItem>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {/* Devices */}
          {devices.length > 0 && (
            <>
              <Separator />
              <div className="space-y-4">
                <h4 className="text-sm font-medium">connected devices</h4>
                <div className="space-y-2">
                  {devices.map((device) => (
                    <Card
                      key={device.deviceId}
                      className="p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <Laptop className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {device.deviceName || device.deviceId}
                            {device.isCurrent && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                this device
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {device.deviceOs}
                            {device.lastSyncAt &&
                              ` • last synced ${formatRelativeTime(device.lastSyncAt)}`}
                          </p>
                        </div>
                      </div>
                      {!device.isCurrent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveDevice(device.deviceId)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Danger Zone */}
          <Separator />
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-destructive">danger zone</h4>
            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Lock className="h-4 w-4 mr-2" />
                    lock sync
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>lock sync?</AlertDialogTitle>
                    <AlertDialogDescription>
                      this will clear your encryption keys from memory. you'll
                      need to enter your password again to access synced data.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        await invoke("lock_sync");
                        await loadSyncData();
                      }}
                    >
                      lock
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    delete cloud data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>delete all cloud data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      this will permanently delete all your synced data from the
                      cloud. this action cannot be undone. your local data will
                      not be affected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteCloudData}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      delete forever
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </>
      )}

      {/* Password Dialog */}
      <AlertDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>set up cloud sync</AlertDialogTitle>
            <AlertDialogDescription>
              enter a password to encrypt your data. this password is used to
              derive encryption keys - we never see your password or your data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              type="password"
              placeholder="enter encryption password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleInitSync();
              }}
            />
            <p className="text-xs text-muted-foreground mt-2">
              ⚠️ if you forget this password, your cloud data cannot be recovered
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPassword("")}>
              cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleInitSync} disabled={isInitializing}>
              {isInitializing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Unlock className="h-4 w-4 mr-2" />
              )}
              {isInitializing ? "initializing..." : "enable sync"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
