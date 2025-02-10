import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Power, Search, Trash2, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { Command } from "@tauri-apps/plugin-shell";
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
import { LoginDialog, useLoginCheck } from "./login-dialog";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { useStatusDialog } from "@/lib/hooks/use-status-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const corePipes: string[] = ["data-table", "search"];

export const PipeStore: React.FC = () => {
  const { health } = useHealthCheck();
  const [selectedPipe, setSelectedPipe] = useState<PipeWithStatus | null>(null);
  const { settings } = useSettings();
  const [pipes, setPipes] = useState<PipeWithStatus[]>([]);
  const [installedPipes, setInstalledPipes] = useState<InstalledPipe[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInstalledOnly, setShowInstalledOnly] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryItem[]>(
    []
  );
  const { showLoginDialog, setShowLoginDialog, checkLogin } = useLoginCheck();
  const { open: openStatusDialog } = useStatusDialog();
  const [loadingPurchases, setLoadingPurchases] = useState<Set<string>>(
    new Set()
  );
  const [loadingInstalls, setLoadingInstalls] = useState<Set<string>>(
    new Set()
  );

  const filteredPipes = pipes
    .filter(
      (pipe) =>
        pipe.id.toLowerCase().includes(searchQuery.toLowerCase()) &&
        (!showInstalledOnly || pipe.is_installed) &&
        !pipe.is_installing
    )
    .sort((a, b) => Number(b.is_paid) - Number(a.is_paid));

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
  }, [searchQuery, filteredPipes.length])

  listen("update-all-pipes", async () => {    
    if (!checkLogin(settings.user, false)) return;
    await handleUpdateAllPipes(true)
  });

  const fetchStorePlugins = async () => {
    try {
      const pipeApi = await PipeApi.create(settings.user?.token!);
      const plugins = await pipeApi.listStorePlugins();

      // Create PipeWithStatus objects for store plugins
      const storePluginsWithStatus = await Promise.all(
        plugins.map(async (plugin) => {
          const installedPipe = installedPipes.find(
            (p) => p.config?.id === plugin.id
          );
          const currentVersion = installedPipe?.config?.version;

          let has_update = false;
          if (currentVersion) {
            try {
              const updateCheck = await pipeApi.checkUpdate(
                plugin.id,
                currentVersion
              );
              has_update = updateCheck.has_update;
            } catch (error) {
              console.error(`Failed to check updates for ${plugin.id}:`, error);
            }
          }

          return {
            ...plugin,
            is_installed: !!installedPipe,
            installed_config: installedPipe?.config,
            has_purchased: purchaseHistory.some(
              (p) => p.plugin_id === plugin.id
            ),
            is_core_pipe: corePipes.includes(plugin.name),
            is_enabled: installedPipe?.config?.enabled ?? false,
            has_update,
          };
        })
      );

      const customPipes = installedPipes
        .filter((p) => !plugins.some((plugin) => plugin.id === p.config?.id))
        .map((p) => {
          console.log(p.config);

          const pluginName = p.config?.source?.split("/").pop();
          return {
            id: p.config?.id || "",
            name: pluginName || "",
            description: "",
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
    onComplete?: () => void
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
    onComplete?: () => void
  ) => {
    try {
      if (!checkLogin(settings.user)) return;

      // Keep the pipe in its current position by updating its status
      setPipes((prevPipes) =>
        prevPipes.map((p) =>
          p.id === pipe.id ? { ...p, is_installing: true } : p
        )
      );

      setLoadingInstalls((prev) => new Set(prev).add(pipe.id));

      const t = toast({
        title: "downloading pipe",
        description: (
          <div className="space-y-2">
            <Progress value={0} className="h-1" />
            <p className="text-xs">downloading from server...</p>
          </div>
        ),
        duration: 100000,
      });

      const pipeApi = await PipeApi.create(settings.user!.token!);
      const response = await pipeApi.downloadPipe(pipe.id);

      t.update({
        id: t.id,
        title: "installing pipe",
        description: (
          <div className="space-y-2">
            <Progress value={50} className="h-1" />
            <p className="text-xs">installing dependencies...</p>
          </div>
        ),
        duration: 100000,
      });

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
        }
      );

      const data = await downloadResponse.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to download pipe");
      }

      await fetchInstalledPipes();

      t.update({
        id: t.id,
        title: "pipe installed",
        description: (
          <div className="space-y-2">
            <Progress value={100} className="h-1" />
            <p className="text-xs">completed successfully</p>
          </div>
        ),
        duration: 2000,
      });

      // Update the pipe's status after successful installation
      setPipes((prevPipes) =>
        prevPipes.map((p) =>
          p.id === pipe.id
            ? { ...p, is_installed: true, is_installing: false }
            : p
        )
      );

      onComplete?.();
      t.dismiss();
    } catch (error) {
      // Reset the pipe's status on error
      setPipes((prevPipes) =>
        prevPipes.map((p) =>
          p.id === pipe.id ? { ...p, is_installing: false } : p
        )
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

      const cmd = Command.sidecar("screenpipe", ["pipe", "purge", "-y"]);
      await cmd.execute();
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
        description: "please try again or check the logs",
        variant: "destructive",
      });
    }
  };

  const handleUpdateAllPipes = async (delayToast: boolean = false) => {
    try {
      if (!checkLogin(settings.user)) return;

      posthog.capture("update_all_pipes", {});

      let t
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
      const pipesToUpdate = pipes.filter(
        (pipe) => pipe.is_installed && pipe.has_update
      );

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

        await handleUpdatePipe(pipe);
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
    onComplete: () => void
  ) => {
    try {
      posthog.capture("toggle_pipe", {
        pipe_id: pipe.id,
        enabled: !pipe.installed_config?.enabled,
      });

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

      const response = await fetch(`http://localhost:3030/pipes/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: pipe.name }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }

      toast({
        title: `pipe ${endpoint}d`,
      });
      const installedPipes = await fetchInstalledPipes();

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
          },
        };
      });
      onComplete();
    } catch (error) {
      console.error(
        `Failed to ${
          pipe.installed_config?.enabled ? "disable" : "enable"
        } pipe:`,
        error
      );
      toast({
        title: "error toggling pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const handleLoadFromLocalFolder = async (
    setNewRepoUrl: (url: string) => void
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
        const response = await fetch("http://localhost:3030/pipes/update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pipe_id: selectedPipe.name,
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
      posthog.capture("delete_pipe", {
        pipe_id: pipe.id,
      });
      toast({
        title: "deleting pipe",
        description: "please wait...",
      });
      setSelectedPipe(null);

      const response = await fetch("http://localhost:3030/pipes/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: pipe.name }),
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
      posthog.capture("refresh_pipe_from_disk", {
        pipe_id: pipe.name,
      });

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

      posthog.capture("update_pipe", {
        pipe_id: pipe.name,
      });

      const currentVersion = pipe.installed_config?.version!;
      const storeApi = await PipeApi.create(settings.user!.token!);
      const update = await storeApi.checkUpdate(pipe.id, currentVersion);
      if (!update.has_update) {
        toast({
          title: "no update available",
          description: "the pipe is already up to date",
        });
        return;
      }

      // Create initial toast with progress bar
      const t = toast({
        title: "updating pipe",
        description: (
          <div className="space-y-2">
            <Progress value={0} className="h-1" />
            <p className="text-xs">deleting old version...</p>
          </div>
        ),
        duration: 100000,
      });

      // First delete the pipe
      await handleDeletePipe(pipe);

      // Then download the new version
      if (pipe.installed_config?.source) {
        t.update({
          id: t.id,
          title: "updating pipe",
          description: (
            <div className="space-y-2">
              <Progress value={50} className="h-1" />
              <p className="text-xs">downloading new version...</p>
            </div>
          ),
          duration: 100000,
        });

        await handleInstallPipe(pipe);

        // Enable the pipe after installation
        const response = await fetch(`http://localhost:3030/pipes/enable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pipe_id: pipe.name }),
        });

        const data = await response.json();
        if (!data.success) {
          console.warn("failed to enable pipe:", data.error);
        }
      }

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

      // Refresh the pipe list
      await fetchInstalledPipes();

      t.dismiss();
    } catch (error) {
      console.error("failed to update pipe:", error);
      toast({
        title: "error updating pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchStorePlugins();
  }, [installedPipes, purchaseHistory]);

  useEffect(() => {
    fetchPurchaseHistory();
  }, [settings.user]);

  useEffect(() => {
    fetchInstalledPipes();
  }, [health]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchInstalledPipes();
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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

  if (health?.status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4 space-y-4">
        <div className="text-center space-y-4">
          <h3 className="text-lg font-medium">screenpipe is not recording</h3>
          <p className="text-sm text-muted-foreground">
            please start the screenpipe service to browse and manage pipes
          </p>
          <Button
            variant="outline"
            onClick={openStatusDialog}
            className="gap-2"
          >
            <Power className="h-4 w-4" />
            check service status
          </Button>
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
      />
    );
  }

  return (
    <div className="overflow-hidden flex flex-col space-y-4 min-w-[800px]">
      <div className="flex flex-col flex-1 overflow-hidden space-y-4 p-4 min-w-[800px]">
        <div className="space-y-4 min-w-[800px]">
          <div className="flex flex-col gap-4 w-[50%]">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="search community pipes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoCorrect="off"
                autoComplete="off"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">show installed only</span>
              <Switch
                checked={showInstalledOnly}
                onCheckedChange={setShowInstalledOnly}
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleResetAllPipes}
                      className="flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>reset all pipes</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleUpdateAllPipes()}
                      className="flex items-center gap-2"
                      disabled={
                        !pipes.some(
                          (pipe) => pipe.is_installed && pipe.has_update
                        )
                      }
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>update all pipes</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            {filteredPipes.map((pipe) => (
              <PipeCard
                key={pipe.id}
                pipe={pipe}
                onInstall={handleInstallPipe}
                onClick={setSelectedPipe}
                onPurchase={handlePurchasePipe}
                isLoadingPurchase={loadingPurchases.has(pipe.id)}
                isLoadingInstall={loadingInstalls.has(pipe.id)}
                onToggle={handleTogglePipe}
              />
            ))}
          </div>
        </div>

        <AddPipeForm
          onAddPipe={handleInstallSideload}
          isHealthy={health?.status !== "error"}
          onLoadFromLocalFolder={handleLoadFromLocalFolder}
        />
      </div>
      <LoginDialog open={showLoginDialog} onOpenChange={setShowLoginDialog} />
    </div>
  );
};
