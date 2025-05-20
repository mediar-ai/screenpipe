import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Power,
  Search,
  Trash2,
  RefreshCw,
  Download,
  Bell,
  HardDriveDownload,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import {
  PipeApi,
  PipeDownloadError,
  PurchaseHistoryItem,
} from "@/lib/api/store";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { listen } from "@tauri-apps/api/event";
import { InstalledPipe, PipeWithStatus } from "./pipe-store/types";
import { PipeDetails } from "./pipe-store/pipe-details";
import { PipeCard } from "./pipe-store/pipe-card";
import { AddPipeForm } from "./pipe-store/add-pipe-form";
import { useSettings } from "@/lib/hooks/use-settings";
import posthog from "posthog-js";
import { Progress } from "./ui/progress";
import { open } from "@tauri-apps/plugin-dialog";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { useStatusDialog } from "@/lib/hooks/use-status-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import localforage from "localforage";
import { useLoginDialog } from "./login-dialog";
import { PermissionButtons } from "./status/permission-buttons";
import { usePlatform } from "@/lib/hooks/use-platform";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { getAllWindows } from "@tauri-apps/api/window";
import * as Sentry from "@sentry/react";
import { defaultOptions } from "tauri-plugin-sentry-api";
import { ToastAction } from "./ui/toast";

const corePipes: string[] = [];

export const PipeStore: React.FC = () => {
  const { health } = useHealthCheck();
  const [selectedPipe, setSelectedPipe] = useState<PipeWithStatus | null>(null);
  const { settings, updateSettings } = useSettings();
  const [pipes, setPipes] = useState<PipeWithStatus[]>([]);
  const [installedPipes, setInstalledPipes] = useState<InstalledPipe[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInstalledOnly, setShowInstalledOnly] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryItem[]>(
    [],
  );
  const { checkLogin } = useLoginDialog();
  const { open: openStatusDialog } = useStatusDialog();
  const [loadingPurchases, setLoadingPurchases] = useState<Set<string>>(
    new Set(),
  );
  const [loadingInstalls, setLoadingInstalls] = useState<Set<string>>(
    new Set(),
  );
  const { isMac: isMacOS } = usePlatform();
  const [isRestarting, setIsRestarting] = useState(false);
  const [availableUpdates, setAvailableUpdates] = useState<PipeWithStatus[]>(
    [],
  );
  const [updatePopoverOpen, setUpdatePopoverOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const filteredPipes = useMemo(() => {
    return pipes
      .filter(
        (pipe) =>
          pipe.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          (!showInstalledOnly || pipe.is_installed) &&
          !pipe.is_installing,
      )
      .sort((a, b) => {
        // Sort by downloads count first
        const downloadsA = a.plugin_analytics?.downloads_count || 0;
        const downloadsB = b.plugin_analytics?.downloads_count || 0;
        if (downloadsB !== downloadsA) {
          return downloadsB - downloadsA;
        }
        // Then by creation date
        return (
          new Date(b.created_at as string).getTime() -
          new Date(a.created_at as string).getTime()
        );
      });
  }, [pipes, searchQuery, showInstalledOnly]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [isPipeFunctionEnabled, setIsPipeFunctionEnabled] = useState(true);

  // Add debounced search tracking
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery) {
        posthog.capture("search_pipes", {
          query: searchQuery,
          results_count: filteredPipes.length,
        });
      }
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timeoutId);
  }, [searchQuery, filteredPipes.length]);

  const fetchStorePlugins = async () => {
    try {
      const pipeApi = await PipeApi.create(settings.user?.token!);
      const plugins = await pipeApi.listStorePlugins();

      // Create PipeWithStatus objects for store plugins
      const storePluginsWithStatus = await Promise.all(
        plugins.map(async (plugin) => {
          const installedPipe = installedPipes.find((p) => {
            return p.id?.replace("._temp", "") === plugin.name;
          });

          return {
            ...plugin,
            is_installed: !!installedPipe,
            installed_config: installedPipe?.config,
            has_purchased: purchaseHistory.some(
              (p) => p.plugin_id === plugin.id,
            ),
            is_core_pipe: corePipes.includes(plugin.name),
            is_enabled: installedPipe?.config?.enabled ?? false,
            has_update: false,
          };
        }),
      );

      const customPipes = installedPipes
        .filter(
          (p) =>
            !plugins.find(
              (plugin) => plugin.name === p.id?.replace("._temp", ""),
            ),
        )
        .map((p) => {
          const pluginName = p.config?.source?.split("/").pop();
          const is_local = p.id.endsWith("_local");
          return {
            id: p.id || "",
            name: pluginName || "",
            description: p.desc,
            version: p.config?.version || "0.0.0",
            is_paid: false,
            price: 0,
            status: "active",
            created_at: new Date().toISOString(),
            developer_accounts: { developer_name: "You" },
            plugin_analytics: { downloads_count: 0 },
            is_installed: true,
            installed_config: p.config,
            has_purchased: true,
            is_core_pipe: false,
            is_enabled: p.config?.enabled || false,
            source_code: p.config?.source || "",
            is_local,
          };
        });

      setPipes([...storePluginsWithStatus, ...customPipes]);
    } catch (error) {
      console.warn("Failed to fetch store plugins:", error);
    }
  };

  const fetchPurchaseHistory = async () => {
    if (!settings.user?.token) return;
    const pipeApi = await PipeApi.create(settings.user!.token!);
    const purchaseHistory = await pipeApi.getUserPurchaseHistory();
    setPurchaseHistory(purchaseHistory);
  };

  const handlePurchasePipe = async (
    pipe: PipeWithStatus,
    onComplete?: () => void,
  ) => {
    try {
      if (!checkLogin(settings.user)) return;

      setLoadingPurchases((prev) => new Set(prev).add(pipe.id));

      const pipeApi = await PipeApi.create(settings.user!.token!);
      const response = await pipeApi.purchasePipe(pipe.id);

      if (response.data.payment_successful) {
        await handleInstallPipe(pipe);
        toast({
          title: "purchase & install successful",
          description: "payment processed with saved card",
        });
      } else if (response.data.already_purchased) {
        await handleInstallPipe(pipe);
        toast({
          title: "pipe already purchased",
          description: "installing pipe...",
        });
      } else if (response.data.used_credits) {
        await handleInstallPipe(pipe);
        toast({
          title: "purchase & install successful",
          description: "your pipe has been purchased and installed",
        });
      } else if (response.data.checkout_url) {
        openUrl(response.data.checkout_url);
        toast({
          title: "redirecting to checkout",
          description: "you'll be able to install the pipe after purchase",
        });
      }
      onComplete?.();
    } catch (error) {
      console.error("error purchasing pipe:", error);
      toast({
        title: "error purchasing pipe",
        description: "please try again or check the logs",
        variant: "destructive",
      });
    } finally {
      setLoadingPurchases((prev) => {
        const next = new Set(prev);
        next.delete(pipe.id);
        return next;
      });
    }
  };

  const handleInstallSideload = async (url: string) => {
    posthog.capture("add_own_pipe", {
      newRepoUrl: url,
    });
    try {
      const t = toast({
        title: "adding custom pipe",
        description: (
          <div className="space-y-2">
            <Progress value={0} className="h-1" />
            <p className="text-xs">starting installation...</p>
          </div>
        ),
        duration: 100000,
      });
      let value = 0;

      const progressInterval = setInterval(() => {
        value += 3;
        t.update({
          id: t.id,
          title: "adding custom pipe",
          description: (
            <div className="space-y-2">
              <Progress value={value} className="h-1" />
              <p className="text-xs">installing dependencies...</p>
            </div>
          ),
          duration: 100000,
        });
      }, 500);

      const response = await fetch("http://localhost:3030/pipes/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: url }),
      });

      const data = await response.json();

      clearInterval(progressInterval);

      if (!data.success) {
        throw new Error(data.error || "Failed to download pipe");
      }

      t.update({
        id: t.id,
        title: "pipe added",
        description: (
          <div className="space-y-2">
            <Progress value={100} className="h-1" />
            <p className="text-xs">completed successfully</p>
          </div>
        ),
        duration: 2000,
      });

      await fetchInstalledPipes();

      t.dismiss();
    } catch (error) {
      console.error("failed to add custom pipe:", error);
      toast({
        title: "error adding custom pipe",
        description: "please check the url and try again.",
        variant: "destructive",
      });
    }
  };

  const handleInstallPipe = async (
    pipe: PipeWithStatus,
    onComplete?: () => void,
  ) => {
    try {
      if (!checkLogin(settings.user)) return;

      // Keep the pipe in its current position by updating its status
      setPipes((prevPipes) =>
        prevPipes.map((p) =>
          p.id === pipe.id ? { ...p, is_installing: true } : p,
        ),
      );

      setLoadingInstalls((prev) => new Set(prev).add(pipe.id));

      const t = toast({
        title: "creating pipe",
        description: (
          <div className="space-y-2">
            <Progress value={0} className="h-1" />
            <p className="text-xs">creating pipe...</p>
          </div>
        ),
        duration: 10000,
      });

      const pipeApi = await PipeApi.create(settings.user!.token!);
      const response = await pipeApi.downloadPipe(pipe.id);

      const downloadResponse = await fetch(
        "http://localhost:3030/pipes/download-private",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pipe_name: pipe.name,
            pipe_id: pipe.id,
            url: response.download_url,
          }),
        },
      );

      const data = await downloadResponse.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to download pipe");
      }

      await fetchInstalledPipes();

      // Update the pipe's status after successful installation
      setPipes((prevPipes) =>
        prevPipes.map((p) =>
          p.id === pipe.id
            ? {
                ...p,
                is_installed: true,
                is_installing: false,
              }
            : p,
        ),
      );

      onComplete?.();
      t.dismiss();

      setSelectedPipe(null);
    } catch (error) {
      // Reset the pipe's status on error
      setPipes((prevPipes) =>
        prevPipes.map((p) =>
          p.id === pipe.id ? { ...p, is_installing: false } : p,
        ),
      );
      if ((error as Error).cause === PipeDownloadError.PURCHASE_REQUIRED) {
        return toast({
          title: "paid pipe",
          description:
            "this pipe requires purchase. please visit screenpi.pe to buy credits.",
          variant: "destructive",
        });
      }
      toast({
        title: "error installing pipe",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoadingInstalls((prev) => {
        const next = new Set(prev);
        next.delete(pipe.id);
        return next;
      });
    }
  };

  const fetchInstalledPipes = async () => {
    if (!health || health?.status === "error") return;
    try {
      const response = await fetch("http://localhost:3030/pipes/list");
      const data = (await response.json()) as {
        data: InstalledPipe[];
        success: boolean;
      };

      // check if the pipe function is enabled
      if (response.status === 403) {
        console.log("pipe function is disabled", response.body)
        setIsPipeFunctionEnabled(false);
        toast({
          title: "pipe function is disabled",
          description: "please restart screenpipe to enable it",
          variant: "destructive",
        });
        return;
      }

      if (!data.success) throw new Error("Failed to fetch installed pipes");

      setInstalledPipes(data.data);
      return data.data;
    } catch (error) {
      console.error("Error fetching installed pipes:", error);
      toast({
        title: "error fetching installed pipes",
        description: "please try again or check the logs",
        variant: "destructive",
      });
    }
  };

  const handleResetAllPipes = async () => {
    setIsPurging(true);
    try {
      const t = toast({
        title: "resetting pipes",
        description: (
          <div className="space-y-2">
            <Progress value={0} className="h-1" />
            <p className="text-xs">deleting all pipes...</p>
          </div>
        ),
        duration: 100000,
      });

      const response = await fetch(`http://localhost:3030/pipes/purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        toast({
          title: "failed to purge pipes",
          description: `error: ${(await response.json()).error}...`,
          variant: "destructive",
        });
        return;
      }
      await fetchInstalledPipes();

      t.update({
        id: t.id,
        title: "pipes reset",
        description: (
          <div className="space-y-2">
            <Progress value={100} className="h-1" />
            <p className="text-xs">all pipes have been deleted</p>
          </div>
        ),
        duration: 2000,
      });
    } catch (error) {
      console.error("failed to reset pipes:", error);
      toast({
        title: "error resetting pipes",
        description: `error: ${(error as Error).message}...}`,
        variant: "destructive",
      });
    } finally {
      setIsPurging(false);
      setConfirmOpen(false);
    }
  };

  const handleUpdateAllPipes = async (delayToast: boolean = false) => {
    try {
      if (!checkLogin(settings.user)) return;

      let t;
      if (!delayToast) {
        t = toast({
          title: "checking for updates",
          description: (
            <div className="space-y-2">
              <Progress value={0} className="h-1" />
              <p className="text-xs">checking installed pipes...</p>
            </div>
          ),
          duration: 100000,
        });
      }

      // Filter installed pipes that have updates available
      const pipesToUpdate = availableUpdates;

      if (pipesToUpdate.length === 0) {
        if (t) {
          t.update({
            id: t.id,
            title: "no updates available",
            description: "all pipes are up to date",
            duration: 2000,
          });
        }
        return;
      }

      // Update progress message
      if (t) {
        t.update({
          id: t.id,
          title: `updating ${pipesToUpdate.length} pipes`,
          description: (
            <div className="space-y-2">
              <Progress value={0} className="h-1" />
              <p className="text-xs">starting updates...</p>
            </div>
          ),
          duration: 100000,
        });
      } else {
        t = toast({
          title: `updating ${pipesToUpdate.length} pipes`,
          description: (
            <div className="space-y-2">
              <Progress value={0} className="h-1" />
              <p className="text-xs">starting updates...</p>
            </div>
          ),
          duration: 100000,
        });
      }

      // Update each pipe sequentially
      for (let i = 0; i < pipesToUpdate.length; i++) {
        const pipe = pipesToUpdate[i];
        const progress = Math.round((i / pipesToUpdate.length) * 100);

        t.update({
          id: t.id,
          title: `updating pipes (${i + 1}/${pipesToUpdate.length})`,
          description: (
            <div className="space-y-2">
              <Progress value={progress} className="h-1" />
              <p className="text-xs">updating {pipe.name}...</p>
            </div>
          ),
          duration: 100000,
        });

        await handleUpdatePipe(pipe); // Set all pipes to be updated to "in_progress" status
        setPipes((prevPipes) =>
          prevPipes.map((p) => {
            if (
              pipesToUpdate.some((pipeToUpdate) => pipeToUpdate.id === p.id)
            ) {
              return {
                ...p,
                installed_config: {
                  ...p.installed_config!,
                  buildStatus: "in_progress",
                },
              };
            }
            return p;
          }),
        );
      }

      t.update({
        id: t.id,
        title: "all pipes updated",
        description: (
          <div className="space-y-2">
            <Progress value={100} className="h-1" />
            <p className="text-xs">completed successfully</p>
          </div>
        ),
        duration: 2000,
      });
    } catch (error) {
      console.error("failed to update all pipes:", error);
      toast({
        title: "error updating pipes",
        description: "please try again or check the logs",
        variant: "destructive",
      });
    }
  };

  const handleTogglePipe = async (
    pipe: PipeWithStatus,
    onComplete: () => void,
  ) => {
    try {
      const t = toast({
        title: "loading pipe",
        description: "please wait...",
        action: (
          <div className="flex items-center">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ),
        duration: 4000,
      });

      const endpoint = pipe.installed_config?.enabled ? "disable" : "enable";
      console.log("toggel", pipe, endpoint);

      const id = pipe.is_local ? pipe.id : pipe.name;
      const response = await fetch(`http://localhost:3030/pipes/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: id }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }

      toast({
        title: `pipe ${endpoint}d`,
      });
      const installedPipes = await fetchInstalledPipes();
      console.log("installed Pipes", installedPipes);
      const pp = installedPipes?.find((p) => p.config.id === pipe.id);
      const port = pp?.config.port;

      setSelectedPipe((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          installed_config: {
            port,
            ...prev.installed_config!,
            enabled: !pipe.installed_config?.enabled,
            buildStatus: "in_progress",
          },
        };
      });
      onComplete();
    } catch (error) {
      console.error(
        `Failed to ${
          pipe.installed_config?.enabled ? "disable" : "enable"
        } pipe:`,
        error,
      );
      toast({
        title: "error toggling pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const handleLoadFromLocalFolder = async (
    setNewRepoUrl: (url: string) => void,
  ) => {
    try {
      const selectedFolder = await open({
        directory: true,
        multiple: false,
      });

      if (selectedFolder) {
        console.log("loading from local folder", selectedFolder);
        // set in the bar
        setNewRepoUrl(selectedFolder);
      }
    } catch (error) {
      console.error("failed to load pipe from local folder:", error);
      toast({
        title: "error loading pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const handleConfigSave = async (config: Record<string, any>) => {
    if (selectedPipe) {
      try {
        const id = selectedPipe.is_local ? selectedPipe.id : selectedPipe.name;
        const response = await fetch("http://localhost:3030/pipes/update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pipe_id: id,
            config: config,
          }),
        });

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || "Failed to update pipe configuration");
        }

        toast({
          title: "Configuration saved",
          description: "The pipe configuration has been updated.",
        });

        setSelectedPipe({
          ...selectedPipe,
          installed_config: {
            ...selectedPipe.installed_config!,
            ...config,
          },
        });
      } catch (error) {
        console.error("Failed to save config:", error);
        toast({
          title: "error saving configuration",
          description:
            "please try again or check the logs for more information.",
          variant: "destructive",
        });
      }
    }
  };
  const handleDeletePipe = async (pipe: PipeWithStatus) => {
    try {
      toast({
        title: "deleting pipe",
        description: "please wait...",
      });
      setSelectedPipe(null);

      const id = pipe.is_local ? pipe.id : pipe.name;
      const response = await fetch("http://localhost:3030/pipes/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: id }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }

      // First unselect the pipe, then fetch the updated list
      await fetchInstalledPipes();

      toast({
        title: "pipe deleted",
        description: "the pipe has been successfully removed",
      });

      setSelectedPipe(null);
    } catch (error) {
      console.error("failed to delete pipe:", error);
      toast({
        title: "error deleting pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const handleRefreshFromDisk = async (pipe: PipeWithStatus) => {
    try {
      toast({
        title: "refreshing pipe",
        description: "please wait...",
      });

      const response = await fetch(`http://localhost:3030/pipes/download`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: pipe.installed_config?.source }),
      });
      if (!response.ok) {
        throw new Error("failed to refresh pipe");
      }

      await fetchInstalledPipes();
      toast({
        title: "pipe refreshed",
        description: "the pipe has been successfully refreshed from disk.",
      });
    } catch (error) {
      console.error("failed to refresh pipe from disk:", error);
      toast({
        title: "error refreshing pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    } finally {
      setSelectedPipe(null);
    }
  };

  const handleUpdatePipe = async (pipe: PipeWithStatus) => {
    try {
      if (!checkLogin(settings.user)) return;

      // Set the pipe status to in_progress so the user gets feedback in the UI
      setPipes((prevPipes) =>
        prevPipes.map((p) =>
          p.id === pipe.id
            ? {
                ...p,
                installed_config: {
                  ...p.installed_config!,
                  buildStatus: "in_progress",
                },
              }
            : p,
        ),
      );

      const currentVersion = pipe.installed_config?.version!;
      const storeApi = await PipeApi.create(settings.user!.token!);
      const update = await storeApi.checkUpdate(pipe.id, currentVersion);
      if (!update.has_update) {
        // Reset the status if no update is available
        setPipes((prevPipes) =>
          prevPipes.map((p) =>
            p.id === pipe.id
              ? {
                  ...p,
                  installed_config: {
                    ...p.installed_config!,
                    buildStatus: "success",
                  },
                }
              : p,
          ),
        );

        toast({
          title: "no update available",
          description: "the pipe is already up to date",
        });
        return;
      }

      const t = toast({
        title: "updating pipe",
        description: (
          <div className="space-y-2">
            <Progress value={25} className="h-1" />
            <p className="text-xs">checking for updates...</p>
          </div>
        ),
        duration: 100000,
      });

      // Update progress for download start
      t.update({
        id: t.id,
        description: (
          <div className="space-y-2">
            <Progress value={50} className="h-1" />
            <p className="text-xs">downloading update...</p>
          </div>
        ),
      });

      const responseDownload = await storeApi.downloadPipe(pipe.id);

      // Update progress for installation
      t.update({
        id: t.id,
        description: (
          <div className="space-y-2">
            <Progress value={75} className="h-1" />
            <p className="text-xs">installing update...</p>
          </div>
        ),
      });

      const windows = await getAllWindows();
      console.log("windows", windows, pipe);
      const window = windows.find((w) => w.label === pipe.name);
      console.log("window", window);
      if (window) {
        window.close();
      }

      const response = await fetch(
        `http://localhost:3030/pipes/update-version`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pipe_id: pipe.name,
            source: responseDownload.download_url,
          }),
        },
      );

      const data = await response.json();
      if (!data.success) {
        // Set status to error if update fails
        setPipes((prevPipes) =>
          prevPipes.map((p) =>
            p.id === pipe.id
              ? {
                  ...p,
                  installed_config: {
                    ...p.installed_config!,
                    buildStatus: "error",
                  },
                }
              : p,
          ),
        );
        throw new Error(data.error);
      }

      // Update progress for completion
      t.update({
        id: t.id,
        title: "pipe updated",
        description: (
          <div className="space-y-2">
            <Progress value={100} className="h-1" />
            <p className="text-xs">completed successfully</p>
          </div>
        ),
        duration: 2000,
      });

      await fetchInstalledPipes();

      // Update the available updates state
      setAvailableUpdates((prev) => prev.filter((p) => p.id !== pipe.id));

      t.dismiss();
    } catch (error) {
      console.error("failed to update pipe:", error);

      // Set status to error if update fails
      setPipes((prevPipes) =>
        prevPipes.map((p) =>
          p.id === pipe.id
            ? {
                ...p,
                installed_config: {
                  ...p.installed_config!,
                  buildStatus: "error",
                },
              }
            : p,
        ),
      );

      toast({
        title: "error updating pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const handleRestartScreenpipe = async () => {
    setIsRestarting(true);
    const toastId = toast({
      title: "restarting screenpipe",
      description: "please wait...",
      duration: Infinity,
    });

    try {
      // First stop
      await invoke("stop_screenpipe");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Then start
      await invoke("spawn_screenpipe");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      toastId.update({
        id: toastId.id,
        title: "screenpipe restarted",
        description: "screenpipe has been restarted successfully.",
        duration: 3000,
      });
    } catch (error) {
      console.error("failed to restart screenpipe:", error);
      toastId.update({
        id: toastId.id,
        title: "error",
        description: "failed to restart screenpipe.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      toastId.dismiss();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      setIsRestarting(false);
    }
  };

  // Define the checkForUpdates function before it's used
  const checkForUpdates = useCallback(
    async (silent: boolean = false) => {
      setIsUpdating(true);
      console.log(
        "[pipe-update] checkForUpdates called at",
        new Date().toISOString(),
      );

      if (!settings.user?.token) {
        console.log("[pipe-update] Update check skipped: No user token");
        toast({
          title: "error checking for updates",
          description: "please login to check for updates",
          variant: "destructive",
        });
		setIsUpdating(false)
        return;
      }
      // Get last check time from local storage
      const lastCheckTime =
        await localforage.getItem<number>("lastUpdateCheck");
      const now = Date.now();

      // Check if 5 minutes have passed since last check
      if (lastCheckTime && now - lastCheckTime < 5 * 60 * 1000 && !silent) {
        console.log(
          "[pipe-update] Skipping check - last check was less than 5 minutes ago",
          "Last check:",
          new Date(lastCheckTime).toISOString(),
          "Now:",
          new Date(now).toISOString(),
          "Diff (minutes):",
          (now - lastCheckTime) / (60 * 1000),
        );
		toast({
          title: "skipping update check",
          description: "last check was less than 5 minutes ago",
        });
        setIsUpdating(false);
        return;
      }

      // Store current time as last check
      await localforage.setItem("lastUpdateCheck", now);
      console.log("[pipe-update] Checking for updates...");

      const installedPipes = pipes.filter(
        (pipe) => pipe.is_installed && pipe.installed_config?.version,
      );

      // Skip if no pipes to check
      if (installedPipes.length === 0) {
        console.log("[pipe-update] No installed pipes to check");
        toast({
          title: "no installed pipes to check",
          description: "please install a pipe to check for updates",
        });
        setIsUpdating(false);
        return;
      }

      try {
        // Format pipes for batch update check
        const pluginsToCheck = installedPipes.map((pipe) => ({
          pipe_id: pipe.id,
          version: pipe.installed_config!.version!,
        }));

        console.log(
          "[pipe-update] Sending update check request:",
          pluginsToCheck,
        );

        const storeApi = await PipeApi.create(settings.user.token);
        const updates = await storeApi.checkUpdates(pluginsToCheck);

        console.log("[pipe-update] Update check response:", updates);

        // Process updates - only mark them as having updates, don't auto-update
        const pipesWithUpdates: PipeWithStatus[] = [];

        // Create a new array with updated pipe information
        const updatedPipes = pipes.map((pipe) => {
          const update = updates.results.find((u) => u.pipe_id === pipe.id);
          const hasUpdate =
            update && "has_update" in update && update.has_update;

          if (hasUpdate) {
            console.log(`[pipe-update] Update available for ${pipe.name}`);
            pipesWithUpdates.push(pipe);
            // Return a new object with has_update set to true
            return { ...pipe, has_update: true };
          }

          return pipe;
        });

        // Update the pipes state with the new information
        setPipes(updatedPipes);

        // Update the available updates state
        setAvailableUpdates(pipesWithUpdates);

        // If auto-update is enabled and there are updates, update all pipes
        console.log("autoUpdatePipes", settings.autoUpdatePipes);
        if (settings.autoUpdatePipes && pipesWithUpdates.length > 0) {
          console.log("autoUpdatePipes", settings.autoUpdatePipes);
          for (const pipe of pipesWithUpdates) {
            await handleUpdatePipe(pipe);
          }
        } else if (pipesWithUpdates.length > 0 && !silent) {
          // Show a notification to the user
          toast({
            title: "Updates available",
            description: `Updates are available for ${pipesWithUpdates.length} pipe${pipesWithUpdates.length > 1 ? "s" : ""}.`,
            duration: 5000,
          });
        }
        setIsUpdating(false);
      } catch (error) {
        console.error("[pipe-update] Error checking for updates:", error);
        setIsUpdating(false);
      }
    },
    [
      settings.user,
      pipes,
      setPipes,
      settings.autoUpdatePipes,
      handleUpdateAllPipes,
    ],
  );

  // Create a ref to store the latest version of checkForUpdates
  const checkForUpdatesRef = React.useRef(checkForUpdates);

  // Update the ref whenever checkForUpdates changes
  useEffect(() => {
    checkForUpdatesRef.current = checkForUpdates;
  }, [checkForUpdates]);

  useEffect(() => {
    fetchStorePlugins();
  }, [installedPipes, purchaseHistory]);

  useEffect(() => {
    fetchPurchaseHistory();
  }, [settings.user.token]);

  useEffect(() => {
    fetchInstalledPipes();
  }, [health]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchInstalledPipes();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Add periodic update check
  useEffect(() => {
    // Define the update check interval (5 minutes in milliseconds)
    const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000;

    // Run check immediately with a small delay to allow component to fully initialize
    const initialCheckTimeout = setTimeout(
      () => checkForUpdatesRef.current(),
      2000,
    );

    // Set up interval to check every 5 minutes
    const interval = setInterval(
      () => checkForUpdatesRef.current(),
      UPDATE_CHECK_INTERVAL,
    );

    console.log(
      `[pipe-update] Set up update check interval: ${UPDATE_CHECK_INTERVAL}ms (${UPDATE_CHECK_INTERVAL / (60 * 1000)} minutes)`,
    );

    return () => {
      clearTimeout(initialCheckTimeout);
      clearInterval(interval);
    };
  }, []); // Empty dependency array

  useEffect(() => {
    const setupDeepLink = async () => {
      const unsubscribeDeepLink = await onOpenUrl(async (urls) => {
        console.log("received deep link urls:", urls);
        for (const url of urls) {
          if (url.includes("purchase-successful")) {
            const urlObj = new URL(url);
            const pipeId = urlObj.searchParams.get("pipe_id");

            if (!pipeId) {
              toast({
                title: "purchase successful",
                description: "your purchase was successful",
              });
              return;
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));

            // First update purchase history to reflect the new purchase
            await fetchPurchaseHistory();

            // Find the pipe in the store
            const purchasedPipe = pipes.find((pipe) => pipe.id === pipeId);
            if (!purchasedPipe) {
              toast({
                title: "error installing pipe",
                description: "could not find the purchased pipe",
                variant: "destructive",
              });
              return;
            }

            // Install the pipe
            await handleInstallPipe(purchasedPipe);
          }
        }
      });
      return unsubscribeDeepLink;
    };

    let deepLinkUnsubscribe: (() => void) | undefined;

    setupDeepLink().then((unsubscribe) => {
      deepLinkUnsubscribe = unsubscribe;
    });
    return () => {
      if (deepLinkUnsubscribe) deepLinkUnsubscribe();
    };
  }, [pipes]);

  // Update the event listener effect to use the memoized functions
  useEffect(() => {
    const unsubscribePromise = listen("update-all-pipes", async () => {
      try {
        if (!checkLogin(settings.user, false)) return;

        // If auto-update is enabled, update all pipes
        if (settings.autoUpdatePipes) {
          // Filter pipes that need updates
          const pipesToUpdate = pipes.filter(
            (pipe) => pipe.is_installed && pipe.has_update,
          );

          if (pipesToUpdate.length === 0) {
            console.log("No updates available for any pipes");
            return;
          }

          console.log(`Found ${pipesToUpdate.length} pipes to update`);

          for (const pipe of pipesToUpdate) {
            try {
              await handleUpdatePipe(pipe);
            } catch (error) {
              console.error(`Failed to update pipe ${pipe.name}:`, error);
            }
          }

          await fetchInstalledPipes();
        } else {
          // Just check for updates but don't install them
          await checkForUpdatesRef.current(true);
        }
      } catch (error) {
        console.error("Error in update-all-pipes handler:", error);
      }
    });

    return () => {
      unsubscribePromise.then((unsubscribe) => unsubscribe());
    };
  }, [pipes, settings.user, settings.autoUpdatePipes, fetchInstalledPipes]);

  if (health?.status === "error" || !isPipeFunctionEnabled) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4 space-y-4">
        <div className="text-center space-y-4 max-w-md mx-auto justify-center items-center">
          <h3 className="text-lg font-medium">{isPipeFunctionEnabled ? "screenpipe is not recording" : "pipes are disabled"}</h3>
          <p className="text-sm text-muted-foreground">
            {isPipeFunctionEnabled ? "please start the screenpipe service to browse and manage pipes" : "please restart screenpipe to enable the pipes"}
          </p>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={handleRestartScreenpipe}
              disabled={isRestarting}
              className="gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRestarting ? "animate-spin" : ""}`}
              />
              {isRestarting ? "restarting..." : "restart screenpipe"}
            </Button>
            {isPipeFunctionEnabled && (
              <Button
                variant="outline"
                onClick={openStatusDialog}
                className="gap-2"
            >
                <Power className="h-4 w-4" />
                check service status
              </Button>
            )}
          </div>

          {isMacOS && (
            <div className="mt-6 pt-4 border-t w-full flex flex-col items-center">
              <h4 className="text-sm font-medium mb-3">check permissions</h4>
              <div className="space-y-2">
                <PermissionButtons type="screen" />
                <PermissionButtons type="audio" />
                <PermissionButtons type="accessibility" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (selectedPipe) {
    return (
      <PipeDetails
        pipe={selectedPipe}
        onClose={() => setSelectedPipe(null)}
        onToggle={handleTogglePipe}
        onConfigSave={handleConfigSave}
        onDelete={handleDeletePipe}
        onRefreshFromDisk={handleRefreshFromDisk}
        onUpdate={handleUpdatePipe}
        onInstall={handleInstallPipe}
        onPurchase={handlePurchasePipe}
        isLoadingPurchase={loadingPurchases.has(selectedPipe.id)}
        isLoadingInstall={loadingInstalls.has(selectedPipe.id)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full mt-5 p-5">
      <div className="flex flex-col md:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center space-x-2 flex-wrap gap-2">
          <Input
            placeholder="search pipes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64"
          />
          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setConfirmOpen(true)}
                    className="flex items-center gap-2"
                    disabled={isPurging}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>delete all pipes</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Dialog open={confirmOpen} onOpenChange={isPurging ? () => {} : setConfirmOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>confirm deletion of all pipes?</DialogTitle>
                  <DialogDescription>
                    are you sure you want to delete all pipes? <br/> you&apos;ll have to install them again
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-4">
                  <Button 
                    onClick={() => setConfirmOpen(false)} 
                    disabled={isPurging}
                    variant={"outline"}
                  >
                    cancel
                  </Button>
                  <Button 
                    onClick={handleResetAllPipes} 
                    disabled={isPurging}
                  >
                    {isPurging ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        deleting all pipes...
                      </>
                    ) : (
                        "confirm"
                      )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowInstalledOnly(!showInstalledOnly)}
                  >
                    <HardDriveDownload
                      className={cn(
                        "h-4 w-4",
                        showInstalledOnly && "text-green-500",
                      )}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {showInstalledOnly
                      ? "showing installed pipes only"
                      : "showing all pipes"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="flex items-center space-x-2 mt-2 sm:mt-0">
          {availableUpdates.length > 0 && (
            <Popover
              open={updatePopoverOpen}
              onOpenChange={setUpdatePopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button variant="outline" className="relative">
                  <Download className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Updates</span>
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                    {availableUpdates.length}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[90vw] sm:w-[500px]">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Available Updates</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        handleUpdateAllPipes();
                        setUpdatePopoverOpen(false);
                      }}
                    >
                      Update All
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {availableUpdates.map((pipe) => (
                      <div
                        key={pipe.id}
                        className="flex items-center justify-between border p-2 rounded"
                      >
                        <div>
                          <p className="font-medium">{pipe.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {pipe.installed_config?.version} → newer version
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            handleUpdatePipe(pipe);
                          }}
                        >
                          Update
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center pt-2 border-t">
                    <Switch
                      id="auto-update-toggle"
                      checked={settings.autoUpdatePipes}
                      onCheckedChange={(checked) => {
                        updateSettings({ autoUpdatePipes: checked });
                      }}
                      className="mr-2"
                    />
                    <label htmlFor="auto-update-toggle" className="text-sm">
                      Auto-update pipes
                    </label>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
          <Button
            onClick={async () => {
              const lastCheckTime =
                await localforage.getItem("lastUpdateCheck");
              if (lastCheckTime) {
                await localforage.removeItem("lastUpdateCheck");
              }
              checkForUpdates();
            }}
            variant="outline"
            className="whitespace-nowrap"
            disabled={isUpdating}
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-2", isUpdating && "animate-spin")}
            />
            <span className="hidden sm:inline">Check for Updates</span>
            <span className="inline sm:hidden">Check</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPipes.map((pipe) => (
            <PipeCard
              key={pipe.id}
              pipe={pipe}
              setPipe={(updatedPipe) => {
                setPipes((prevPipes) => {
                  return prevPipes.map((p) =>
                    p.id === updatedPipe.id ? updatedPipe : p,
                  );
                });
              }}
              onInstall={handleInstallPipe}
              onClick={setSelectedPipe}
              onPurchase={handlePurchasePipe}
              isLoadingPurchase={loadingPurchases.has(pipe.id)}
              isLoadingInstall={loadingInstalls.has(pipe.id)}
              onToggle={handleTogglePipe}
            />
          ))}
        </div>

        <div className="flex items-center justify-center my-4">
          <AddPipeForm
            onAddPipe={handleInstallSideload}
            isHealthy={health?.status !== "error"}
            onLoadFromLocalFolder={handleLoadFromLocalFolder}
          />
        </div>
      </div>
    </div>
  );
};
