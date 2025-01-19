import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { Command } from "@tauri-apps/plugin-shell";
import {
  PipeApi,
  PipeDownloadError,
  PurchaseHistoryItem,
} from "@/lib/api/store";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { BrokenPipe, InstalledPipe, PipeWithStatus } from "./pipe-store/types";
import { PipeDetails } from "./pipe-store/pipe-details";
import { PipeCard } from "./pipe-store/pipe-card";
import { AddPipeForm } from "./pipe-store/add-pipe-form";
import { useSettings } from "@/lib/hooks/use-settings";
import { useUser } from "@/lib/hooks/use-user";
import posthog from "posthog-js";
import { Progress } from "./ui/progress";
import { open } from "@tauri-apps/plugin-dialog";


const corePipes: string[] = ["auto-pay","linkedin-ai-assistant","memories","data-table","search","timeline","identify-speakers","obsidian","meeting","pipe-for-loom","pipe-simple-nextjs","reddit-auto-posts",];


export const PipeStore: React.FC = () => {
  const { health } = useHealthCheck();
  const [selectedPipe, setSelectedPipe] = useState<PipeWithStatus | null>(null);
  const { settings } = useSettings();
  const { user } = useUser();
  const [pipes, setPipes] = useState<PipeWithStatus[]>([]);
  const [installedPipes, setInstalledPipes] = useState<InstalledPipe[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInstalledOnly, setShowInstalledOnly] = useState(false);
  const [brokenPipes, setBrokenPipes] = useState<BrokenPipe[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryItem[]>(
    []
  );

  useEffect(() => {
    const fetchStorePlugins = async () => {
      try {
        const pipeApi = await PipeApi.create(user?.token ?? "");
        const plugins = await pipeApi.listStorePlugins();
        console.log(installedPipes, "installedPipes");
        const withStatus = plugins.map((plugin) => ({
          ...plugin,
          is_installed: installedPipes.some((p) => p.id === plugin.name),
          installed_config: installedPipes.find((p) => p.id === plugin.name)?.config,
          has_purchased: purchaseHistory.some((p) => p.plugins.id === plugin.id),
          is_core_pipe: corePipes.includes(plugin.name),
        }));
        setPipes(withStatus);
      } catch (error) {
        console.error("Failed to fetch store plugins:", error);
        toast({
          title: "error loading store",
          description: "failed to fetch available pipes",
          variant: "destructive",
        });
      }
    };

    fetchStorePlugins();
  }, [installedPipes, purchaseHistory]);

  useEffect(() => {
    const fetchPurchaseHistory = async () => {
      if (!user?.token) return;
      const pipeApi = await PipeApi.create(user.token);
      const purchaseHistory = await pipeApi.getUserPurchaseHistory();
      console.log(purchaseHistory);
      setPurchaseHistory(purchaseHistory);
    };

    fetchPurchaseHistory();
  }, [user]);

  const handlePurchasePipe = async (pipe: PipeWithStatus) => {
    try {
      if (!user?.token) {
        return toast({
          title: "error installing pipe",
          description:
            "please login to install pipes by going to the settings page account section",
          variant: "destructive",
        });
      }
      const pipeApi = await PipeApi.create(user?.token ?? "");
      const response = await pipeApi.purchasePipe(pipe.id);
      openUrl(response.data.checkout_url);
    } catch (error) {
      console.error("error purchasing pipe:", error);
      toast({
        title: "error purchasing pipe",
        description: "please try again or check the logs",
        variant: "destructive",
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

  const handleInstallPipe = async (pipe: PipeWithStatus) => {
    try {
      if (!user?.token) {
        return toast({
          title: "error installing pipe",
          description:
            "please login to install pipes by going to the settings page account section",
          variant: "destructive",
        });
      }

      toast({
        title: "downloading pipe",
        description: "downloading pipe from server",
      });

      const pipeApi = await PipeApi.create(user.token);
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
            url: response.download_url,
          }),
        }
      );

      const data = await downloadResponse.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to download pipe");
      }

      await fetchInstalledPipes();
      toast({
        title: "pipe installed",
        description: "installation completed successfully",
      });
    } catch (error) {
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
    }
  };

  const fetchInstalledPipes = async () => {
    console.log(health, "health");

    if (!health || health?.status === "error") return;
    try {
      const response = await fetch("http://localhost:3030/pipes/list");
      const data = (await response.json()) as {
        data: InstalledPipe[];
        success: boolean;
      };

      if (!data.success) throw new Error("Failed to fetch installed pipes");
      console.log(data.data, "data.data");

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
      const cmd = Command.sidecar("screenpipe", ["pipe", "purge", "-y"]);
      await cmd.execute();
      await fetchInstalledPipes();
      toast({
        title: "all pipes deleted",
        description: "the pipes folder has been reset.",
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

  const handleTogglePipe = async (pipe: PipeWithStatus, onComplete: () => void) => {
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
      setSelectedPipe(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          installed_config: {
            ...prev.installed_config!,
            enabled: !pipe.installed_config?.enabled,
          }
        };
      });
      onComplete();
    } catch (error) {
      console.error(
        `Failed to ${pipe.installed_config?.enabled ? "disable" : "enable"} pipe:`,
        error
      );
      toast({
        title: "error toggling pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const handleLoadFromLocalFolder = async (setNewRepoUrl: (url: string) => void) => {
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
        console.log(config, "new config");
        
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

        setSelectedPipe({ ...selectedPipe, installed_config: {
          ...selectedPipe.installed_config!,
          ...config,
         } });
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
      posthog.capture("update_pipe", {
        pipe_id: pipe.name,
      });

      // TODO: check if an update is available

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


  const filteredPipes = pipes
    .filter(
      (pipe) =>
        pipe.id.toLowerCase().includes(searchQuery.toLowerCase()) &&
        (!showInstalledOnly || pipe.is_installed)
    )
    .sort((a, b) => Number(b.is_paid) - Number(a.is_paid));

  useEffect(() => {
    fetchInstalledPipes();
  }, [health]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchInstalledPipes();
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (health?.status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4 space-y-4">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-medium">screenpipe is not running</h3>
          <p className="text-sm text-muted-foreground">
            please start the screenpipe service to browse and manage pipes
          </p>
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
              <Button
                variant="outline"
                size="icon"
                onClick={handleResetAllPipes}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
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
    </div>
  );
};
