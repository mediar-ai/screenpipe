import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Search, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { Command } from "@tauri-apps/plugin-shell";
import { PipeApi, PipeDownloadError, PipeStorePlugin } from "@/lib/api/store";

import localforage from "localforage";
import { BrokenPipe, InstalledPipe, PipeWithStatus } from "./pipe-store/types";
import { PipeDetails } from "./pipe-store/pipe-details";
import { PipeCard } from "./pipe-store/pipe-card";
import { AddPipeForm } from "./pipe-store/add-pipe-form";
import { useSettings } from "@/lib/hooks/use-settings";
import { useUser } from "@/lib/hooks/use-user";

const BROKEN_PIPES_KEY = "broken_pipes";
const DEFAULT_PIPES = [
  "memories",
  "data-table",
  "search",
  "timeline",
  "identify-speakers",
];

export const PipeStore: React.FC = () => {
  const [selectedPipe, setSelectedPipe] = useState<PipeWithStatus | null>(null);
  const { settings } = useSettings();
  const { user } = useUser();
  const [pipes, setPipes] = useState<PipeWithStatus[]>([]);
  const [installedPipes, setInstalledPipes] = useState<InstalledPipe[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInstalledOnly, setShowInstalledOnly] = useState(false);
  const [brokenPipes, setBrokenPipes] = useState<BrokenPipe[]>([]);
  const { health } = useHealthCheck();

  useEffect(() => {
    const fetchStorePlugins = async () => {
      try {
        const pipeApi = await PipeApi.create(user?.token ?? "");
        const plugins = await pipeApi.listStorePlugins();
        const withStatus = plugins.map((plugin) => ({
          ...plugin,
          isInstalled: installedPipes.some((p) => p.id === plugin.id),
          isRunning: false,
          installedConfig: installedPipes.find((p) => p.id === plugin.id),
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
  }, [installedPipes]);

  const handleInstallPipe = async (pipe: PipeWithStatus) => {
    try {

      if (!user?.token) {
        return toast({
          title: "error installing pipe",
          description: "please login to install pipes by going to the settings page account section",
          variant: "destructive",
        });
      }
      const pipeApi = await PipeApi.create(user.token);
      const response = await pipeApi.downloadPipe(pipe.id);

      const downloadResponse = await fetch('http://localhost:3030/pipes/download-private', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pipe_name: pipe.id, url: response.download_url }),
      });

      const data = await downloadResponse.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to download pipe');
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

  const filteredPipes = pipes
    .filter(
      (pipe) =>
        pipe.id.toLowerCase().includes(searchQuery.toLowerCase()) &&
        (!showInstalledOnly || pipe.isInstalled)
    )
    .sort((a, b) => Number(b.is_paid) - Number(a.is_paid));

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
      <PipeDetails pipe={selectedPipe} onClose={() => setSelectedPipe(null)} />
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
              />
            ))}
          </div>
        </div>

        <AddPipeForm
          onAddPipe={handleInstallPipe}
          isHealthy={health?.status !== "error"}
          selectedPipe={selectedPipe}
        />
      </div>
    </div>
  );
};
