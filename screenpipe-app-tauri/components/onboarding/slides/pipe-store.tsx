import React from "react";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import OnboardingNavigation from "./navigation";
import { toast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";
import posthog from "posthog-js";
import { PipeApi } from "@/lib/api/store";
import { useSettings } from "@/lib/hooks/use-settings";

interface OnboardingPipeStoreProps {
  className?: string;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

const OnboardingPipeStore: React.FC<OnboardingPipeStoreProps> = ({
  className = "",
  handlePrevSlide,
  handleNextSlide,
}) => {
  const [isLoading, setIsLoading] = React.useState(false);
  const [status, setStatus] = React.useState<string>("");
  const { settings } = useSettings();
  const handleOpenSearchPipe = async () => {
    setIsLoading(true);
    try {
      posthog.capture("open_search_pipe_from_onboarding");

      // Create initial toast
      const t = toast({
        title: "opening search pipe",
        description: "please wait...",
        duration: 5000,
      });

      // Check if screenpipe is running, if not spawn it
      try {
        await fetch("http://localhost:3030/health");
      } catch (error) {
        // Screenpipe not running, try to spawn it
        await invoke("stop_screenpipe");
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        await invoke("spawn_screenpipe");
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }

      // First check if pipe is installed by listing pipes
      const listResponse = await fetch("http://localhost:3030/pipes/list");
      const listData = await listResponse.json();
      const searchPipe = listData.data.find(
        (p: any) => p.config?.id === "search"
      );

      // If not installed, download it first
      if (!searchPipe) {
        setStatus("downloading search pipe... (~10s)");
        const pipeApi = await PipeApi.create(settings.user?.token!);
        const storePlugins = await pipeApi.listStorePlugins();
        const downloadData = await pipeApi.downloadPipe(
          storePlugins.find((p) => p.name === "search")?.id!
        );

        await fetch("http://localhost:3030/pipes/download-private", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pipe_name: "search",
            pipe_id: "search",
            url: downloadData.download_url,
          }),
        });

        // Wait for download to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Enable the search pipe
      setStatus("enabling search pipe... (~10s)");
      await fetch("http://localhost:3030/pipes/enable", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: "search" }),
      });

      // Wait for pipe to initialize
      setStatus("initializing search pipe... (~10s)");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get updated pipe info to find the port
      const response = await fetch("http://localhost:3030/pipes/list");
      const data = await response.json();
      const updatedSearchPipe = data.data.find(
        (p: any) => p.config?.id === "search"
      );

      if (!updatedSearchPipe?.config?.port) {
        throw new Error("search pipe not found or port not configured");
      }

      // Check if pipe is actually running
      try {
        await fetch(`http://localhost:${updatedSearchPipe.config.port}`, {
          mode: "no-cors",
        });
      } catch (error) {
        throw new Error("search pipe failed to start");
      }

      // Open the pipe window
      await invoke("open_pipe_window", {
        port: updatedSearchPipe.config.port,
        title: "search",
      });

      t.update({
        id: t.id,
        title: "search pipe ready",
        description: "you can now search through your recordings",
        duration: 2000,
      });
    } catch (error) {
      console.error("failed to open search pipe:", error);
      toast({
        title: "error opening search pipe",
        description: "please try again or check the logs",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setStatus("");
    }
  };

  return (
    <div
      className={`${className} w-full h-screen flex flex-col px-6 overflow-y-auto`}
    >
      <div className="flex-1 flex flex-col items-center">
        <div className="flex flex-col items-center mb-8">
          <img className="w-24 h-24" src="/128x128.png" alt="screenpipe-logo" />
          <h1 className="text-2xl font-bold mt-4">welcome to the pipe store</h1>
        </div>

        <div className="space-y-8 max-w-2xl mx-auto w-full">
          {/* Store preview image */}
          <img
            src="/pipe-store-preview.png"
            alt="pipe store interface"
            className="w-full rounded-lg border shadow-sm"
          />

          <div className="space-y-4 text-center">
            <p className="text-muted-foreground my-2">
              screenpipe records your screen and audio 24/7 and makes it easy
              for AI to search through your recordings. developers can create
              powerful apps on top of screenpipe. let&apos;s start with
              &quot;search&quot; to explore your recordings. once in the search
              pipe, you can use the &quot;search&quot; button to search through
              your recordings and ask a summary to AI.
            </p>

            <div className="flex flex-col items-center">
              <Button
                size="lg"
                className="gap-2 my-8"
                onClick={handleOpenSearchPipe}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {isLoading ? "opening search..." : "open search pipe"}
              </Button>
              {status && (
                <p className="text-sm text-muted-foreground mt-1">{status}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="my-8" />

      <OnboardingNavigation
        className="py-6"
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={handleNextSlide}
        prevBtnText="previous"
        nextBtnText="end"
      />
    </div>
  );
};

export default OnboardingPipeStore;
