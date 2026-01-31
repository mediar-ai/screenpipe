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
  Shield,
  Zap,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Sparkles,
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
import { useSettings } from "@/lib/hooks/use-settings";
import { motion } from "framer-motion";
import Lottie from "lottie-react";
import cloudSyncAnimation from "@/public/animations/cloud-sync.json";

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

interface SubscriptionStatus {
  hasSubscription: boolean;
  tier: string | null;
  status: string | null;
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

// Cloud animation component using Lottie
function CloudSyncAnimation() {
  return (
    <div className="w-72 h-40 mx-auto">
      <Lottie
        animationData={cloudSyncAnimation}
        loop={true}
        autoplay={true}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

// Benefits section
function SyncBenefits() {
  const benefits = [
    {
      icon: <Shield className="w-5 h-5" />,
      title: "zero-knowledge encryption",
      description: "your data is encrypted before it leaves your device. we can never see your data.",
    },
    {
      icon: <Smartphone className="w-5 h-5" />,
      title: "access anywhere",
      description: "search and access your memory from any device - desktop, phone, or web.",
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: "automatic backup",
      description: "never lose your data. continuous sync keeps everything safe in the cloud.",
    },
  ];

  return (
    <div className="grid gap-4 mt-6">
      {benefits.map((benefit, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="flex items-start gap-3"
        >
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            {benefit.icon}
          </div>
          <div>
            <h4 className="text-sm font-medium">{benefit.title}</h4>
            <p className="text-xs text-muted-foreground">{benefit.description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// Onboarding/upgrade prompt
function SyncOnboarding({ onSubscribe, isLoading }: { onSubscribe: () => void; isLoading: boolean }) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <CloudSyncAnimation />
        <h3 className="text-xl font-semibold mt-4">cloud sync</h3>
        <p className="text-sm text-muted-foreground mt-2">
          sync your screenpipe data across all your devices with end-to-end encryption
        </p>
      </div>

      <SyncBenefits />

      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="font-medium">screenpipe pro</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              50GB storage • 3 devices • priority support
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">$49<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
            <div className="text-xs text-muted-foreground">or $399/year</div>
          </div>
        </div>
        <Button
          className="w-full mt-4"
          onClick={onSubscribe}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : null}
          get cloud sync
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <a
          href={`https://chatgpt.com/?hints=search&q=${encodeURIComponent("analyze this encryption code and verify it's true end-to-end encryption where the server cannot see user data: https://github.com/mediar-ai/screenpipe/blob/main/screenpipe-app-tauri/src-tauri/src/sync.rs")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-center text-muted-foreground mt-2 block hover:text-primary underline"
        >
          ask chatgpt about the encryption source code
        </a>
      </Card>
    </div>
  );
}

// Password setup step
function PasswordSetup({ onSubmit, isLoading, backendReady = true }: { onSubmit: (password: string) => void; isLoading: boolean; backendReady?: boolean }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = () => {
    if (password !== confirmPassword) {
      toast({
        title: "passwords don't match",
        description: "please make sure your passwords match",
        variant: "destructive",
      });
      return;
    }
    if (password.length < 8) {
      toast({
        title: "password too short",
        description: "password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }
    onSubmit(password);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <CloudSyncAnimation />
        <h3 className="text-xl font-semibold mt-4">set your encryption password</h3>
        <p className="text-sm text-muted-foreground mt-2">
          this password encrypts your data locally before syncing.
          we never see your password or your data.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">encryption password</Label>
          <Input
            id="password"
            type="password"
            placeholder="enter a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">confirm password</Label>
          <Input
            id="confirm-password"
            type="password"
            placeholder="confirm your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />
        </div>
      </div>

      <Card className="p-3 bg-yellow-500/10 border-yellow-500/20">
        <div className="flex gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            <strong>important:</strong> if you forget this password, your cloud data cannot be recovered.
            consider using a password manager.
          </p>
        </div>
      </Card>

      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={isLoading || !password || !confirmPassword}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : (
          <Unlock className="w-4 h-4 mr-2" />
        )}
        {isLoading ? "setting up..." : "enable cloud sync"}
      </Button>
    </div>
  );
}

// Main sync settings (shown when subscribed and initialized)
function ActiveSyncSettings({
  status,
  config,
  devices,
  onToggleSync,
  onTriggerSync,
  onUpdateConfig,
  onRemoveDevice,
  onDeleteCloudData,
  onLockSync,
  isSyncing,
}: {
  status: SyncStatus;
  config: SyncConfig;
  devices: SyncDevice[];
  onToggleSync: (enabled: boolean) => void;
  onTriggerSync: () => void;
  onUpdateConfig: (updates: Partial<SyncConfig>) => void;
  onRemoveDevice: (deviceId: string) => void;
  onDeleteCloudData: () => void;
  onLockSync: () => void;
  isSyncing: boolean;
}) {
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
          onCheckedChange={onToggleSync}
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
                onClick={onTriggerSync}
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
                    onUpdateConfig({ syncTranscripts: checked })
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
                    onUpdateConfig({ syncOcr: checked })
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
                    onUpdateConfig({ syncAudio: checked })
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
                    onUpdateConfig({ syncFrames: checked })
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
                  onUpdateConfig({ syncIntervalMinutes: parseInt(value) })
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
                          onClick={() => onRemoveDevice(device.deviceId)}
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
                    <AlertDialogAction onClick={onLockSync}>
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
                      onClick={onDeleteCloudData}
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
    </div>
  );
}

export function SyncSettings() {
  const { settings, isSettingsLoaded } = useSettings();
  const [step, setStep] = useState<"loading" | "onboarding" | "password" | "active">("loading");
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [backendReady, setBackendReady] = useState(true);

  useEffect(() => {
    // Wait for settings to be fully loaded before checking subscription
    if (isSettingsLoaded) {
      checkSubscriptionAndLoad();
    }
  }, [isSettingsLoaded]);

  const checkSubscriptionAndLoad = async () => {
    try {
      // Check subscription status via API
      const token = settings.user?.token;
      const userId = settings.user?.id;

      // Must have both token and userId to check subscription
      if (!token || !userId) {
        console.log("no token or userId, showing onboarding");
        setStep("onboarding");
        return;
      }

      const response = await fetch("https://screenpi.pe/api/cloud-sync/checkout?userId=" + userId, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log("cloud sync subscription check:", data);
        setSubscription({
          hasSubscription: data.hasSubscription,
          tier: data.subscription?.tier || null,
          status: data.subscription?.status || null,
        });

        if (data.hasSubscription) {
          // Try to load sync data from backend
          try {
            const [statusResult, configResult, devicesResult] = await Promise.all([
              invoke<SyncStatus>("get_sync_status"),
              invoke<SyncConfig>("get_sync_config"),
              invoke<SyncDevice[]>("get_sync_devices"),
            ]);
            setStatus(statusResult);
            setConfig(configResult);
            setDevices(devicesResult);

            // If sync is already enabled, show active view
            // Otherwise show password setup
            if (statusResult.enabled) {
              setStep("active");
            } else {
              setStep("password");
            }
          } catch (backendError) {
            // Backend sync commands not available yet - show password setup
            console.error("sync backend not ready:", backendError);
            setBackendReady(false);
            setStep("password");
          }
        } else {
          setStep("onboarding");
        }
      } else {
        console.log("subscription API returned non-ok status:", response.status);
        setStep("onboarding");
      }
    } catch (error) {
      console.error("failed to check subscription:", error);
      setStep("onboarding");
    }
  };

  const handleSubscribe = async () => {
    try {
      setIsLoading(true);
      const token = settings.user?.token;
      const userId = settings.user?.id;

      if (!token || !userId) {
        toast({
          title: "please log in first",
          description: "you need to be logged in to subscribe",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch("https://screenpi.pe/api/cloud-sync/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          tier: "pro",
          billingPeriod: "monthly",
          userId,
          email: settings.user?.email,
        }),
      });

      const data = await response.json();

      if (data.url) {
        // Open Stripe checkout
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(data.url);

        toast({
          title: "checkout opened",
          description: "complete your purchase in the browser, then return here",
        });

        // Poll for subscription status
        const checkInterval = setInterval(async () => {
          await checkSubscriptionAndLoad();
          if (subscription?.hasSubscription) {
            clearInterval(checkInterval);
          }
        }, 3000);

        // Stop polling after 5 minutes
        setTimeout(() => clearInterval(checkInterval), 300000);
      } else {
        throw new Error(data.error || "failed to create checkout");
      }
    } catch (error) {
      toast({
        title: "failed to start checkout",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    try {
      setIsLoading(true);
      await invoke<boolean>("init_sync", { password });

      toast({
        title: "cloud sync enabled",
        description: "your data is now syncing securely",
      });

      await checkSubscriptionAndLoad();
      setStep("active");
    } catch (error) {
      toast({
        title: "failed to initialize sync",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSync = async (enabled: boolean) => {
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

  const handleTriggerSync = async () => {
    try {
      setIsSyncing(true);
      await invoke("trigger_sync");
      toast({
        title: "sync started",
        description: "syncing your data to the cloud",
      });

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
      await checkSubscriptionAndLoad();
    } catch (error) {
      toast({
        title: "failed to delete data",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleLockSync = async () => {
    await invoke("lock_sync");
    await checkSubscriptionAndLoad();
  };

  if (step === "loading") {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (step === "onboarding") {
    return <SyncOnboarding onSubscribe={handleSubscribe} isLoading={isLoading} />;
  }

  if (step === "password") {
    return <PasswordSetup onSubmit={handlePasswordSubmit} isLoading={isLoading} backendReady={backendReady} />;
  }

  if (step === "active" && status && config) {
    return (
      <ActiveSyncSettings
        status={status}
        config={config}
        devices={devices}
        onToggleSync={handleToggleSync}
        onTriggerSync={handleTriggerSync}
        onUpdateConfig={handleUpdateConfig}
        onRemoveDevice={handleRemoveDevice}
        onDeleteCloudData={handleDeleteCloudData}
        onLockSync={handleLockSync}
        isSyncing={isSyncing}
      />
    );
  }

  return null;
}
