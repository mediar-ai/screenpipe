import React, { useState, useEffect, useRef } from "react";
import { Check, HelpCircle, Video, ChevronDown } from "lucide-react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OnboardingNavigation from "@/components/onboarding/navigation";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../ui/tooltip";
import { useSettings } from "@/lib/hooks/use-settings";
import { Label } from "../ui/label";
import { LogFileButton } from "../log-file-button";
import { Separator } from "../ui/separator";
import { invoke } from "@tauri-apps/api/core";
import posthog from "posthog-js";
import { toast } from "@/components/ui/use-toast";
import { PermissionButtons } from "../status/permission-buttons";
import { usePlatform } from "@/lib/hooks/use-platform";
import { pipe } from "@screenpipe/browser";
import { VisionEvent } from "@screenpipe/browser";
import Image from "next/image";

interface OnboardingStatusProps {
  className?: string;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

const OnboardingStatus: React.FC<OnboardingStatusProps> = ({
  className = "",
  handlePrevSlide,
  handleNextSlide,
}) => {
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useChineseMirror, setUseChineseMirror] = useState(false);
  const { updateSettings } = useSettings();
  const { isMac: isMacOS } = usePlatform();
  const [stats, setStats] = useState<{
    screenshots: number;
    audioSeconds: number;
  } | null>(null);
  const [visionEvent, setVisionEvent] = useState<VisionEvent | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const screenshotsResponse = await fetch(
          "http://localhost:3030/raw_sql",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: `SELECT COUNT(*) as count FROM frames`,
            }),
          }
        );
        const screenshotsResult = await screenshotsResponse.json();

        const audioResponse = await fetch("http://localhost:3030/raw_sql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `
              SELECT 
                ROUND(SUM((end_time - start_time)), 2) as total_seconds
              FROM audio_transcriptions 
              WHERE start_time IS NOT NULL 
              AND end_time IS NOT NULL
            `,
          }),
        });
        const audioResult = await audioResponse.json();

        setStats({
          screenshots: screenshotsResult[0].count,
          audioSeconds: audioResult[0].total_seconds || 0,
        });
      } catch (error) {
        console.error("failed to fetch stats:", error);
      }
    };

    // initial fetch
    fetchStats();

    // set up interval for periodic updates
    const interval = setInterval(fetchStats, 1000); // refresh every second

    // cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  // Add effect for streaming screenshots when recording starts
  useEffect(() => {
    let isActive = false;

    const streamVision = async () => {
      if (status !== "ok" || isActive) return;

      isActive = true;
      try {
        console.log("starting vision stream");
        for await (const event of pipe.streamVision(true)) {
          setVisionEvent(event.data);
          console.log("vision event received");

          // Scroll to bottom when new vision event is received
          setTimeout(() => {
            if (containerRef.current) {
              // Only auto-scroll if already near the bottom
              const { scrollTop, scrollHeight, clientHeight } =
                containerRef.current;
              const isNearBottom =
                scrollHeight - scrollTop - clientHeight < 150;

              if (isNearBottom) {
                containerRef.current.scrollTo({
                  top: containerRef.current.scrollHeight,
                  behavior: "smooth",
                });
              } else if (!showScrollButton) {
                setShowScrollButton(true);
              }
            }
          }, 100);
        }
      } catch (error) {
        console.error("vision stream error:", error);
      } finally {
        isActive = false;
      }
    };

    streamVision();

    return () => {
      pipe.disconnect();
    };
  }, [status, showScrollButton]);

  // Add effect to scroll to bottom when status changes to "ok"
  useEffect(() => {
    if (status === "ok" && containerRef.current) {
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.scrollTo({
            top: containerRef.current.scrollHeight,
            behavior: "smooth",
          });
        }
      }, 500); // Give time for the UI to render
    }
  }, [status]);

  // Add scroll event listener to show/hide scroll button
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Show button if not at bottom (with some threshold)
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setShowScrollButton(!isAtBottom);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const handleStartScreenpipe = async () => {
    posthog.capture("screenpipe_setup_start");
    setIsLoading(true);
    const toastId = toast({
      title: "starting screenpipe",
      description:
        "please wait as we download AI models and start recording\nplease check logs if this is taking longer than expected (30s)",
      duration: Infinity,
    });
    try {
      await invoke("stop_screenpipe");
      await new Promise((resolve) => setTimeout(resolve, 1_000));

      await invoke("spawn_screenpipe", {
        overrideArgs: ["--enable-realtime-vision"],
      });
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      toastId.update({
        id: toastId.id,
        title: "screenpipe started",
        description: "screenpipe is now running.",
        duration: 3000,
      });
      setStatus("ok");
    } catch (error) {
      console.error("failed to start screenpipe:", error);
      toastId.update({
        id: toastId.id,
        title: "error",
        description: "failed to start screenpipe.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      toastId.dismiss();
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    setStatus(null);
    handleNextSlide();
  };

  const handlePrev = () => {
    setStatus(null);
    handlePrevSlide();
  };

  const handleChineseMirrorToggle = async (checked: boolean) => {
    setUseChineseMirror(checked);
    updateSettings({ useChineseMirror: checked });
  };

  return (
    <div
      ref={containerRef}
      className={`${className} w-full flex flex-col items-center overflow-y-auto max-h-[80vh] pb-4 relative`}
    >
      <DialogHeader className="flex flex-col px-2 justify-center items-center sticky top-0 bg-background z-10 w-full pt-4 pb-2">
        <img className="w-24 h-24" src="/128x128.png" alt="screenpipe-logo" />
        <DialogTitle className="text-center text-2xl">
          setting up screenpipe
        </DialogTitle>
        <p className="text-sm text-muted-foreground mt-2">
          100% local-first • your data never leaves your device
        </p>
      </DialogHeader>

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

      <Separator className="w-full my-2" />

      <div className="flex items-center space-x-2 mt-4">
        <Switch
          id="chinese-mirror-toggle"
          checked={useChineseMirror}
          onCheckedChange={handleChineseMirrorToggle}
        />
        <Label
          htmlFor="chinese-mirror-toggle"
          className="flex items-center space-x-2"
        >
          <span>i am currently in mainland china</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 cursor-default" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  enable this option to use a chinese cloud for
                  <br />
                  downloading AI models
                  <br />
                  which are blocked in mainland china.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
      </div>
      <div className="w-full flex flex-col items-center justify-center gap-2 my-1">
        {status === null ? (
          <Button
            onClick={handleStartScreenpipe}
            disabled={isLoading}
            className="mt-4"
          >
            {isLoading ? (
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
                xmlns="http://www.w3.org/2000/svg"
                className="size-5 animate-spin stroke-zinc-400 mr-2"
              >
                <path d="M12 3v3m6.366-.366-2.12 2.12M21 12h-3m.366 6.366-2.12-2.12M12 21v-3m-6.366.366 2.12-2.12M3 12h3m-.366-6.366 2.12 2.12"></path>
              </svg>
            ) : (
              <Video className="h-4 w-4 mr-2" />
            )}
            {isLoading ? "starting..." : "start recording"}
          </Button>
        ) : status === "ok" ? (
          <div className="flex flex-col items-center mt-4">
            <Check className="size-5 stroke-zinc-400" />
            <p className="text-sm text-zinc-600 mt-2 text-center">
              screenpipe setup complete. <br />
              AI models downloaded.
            </p>
          </div>
        ) : (
          <p className="text-center mt-4">{status}</p>
        )}

        <LogFileButton />
      </div>

      {/* Screenshot stream display */}
      {status === "ok" && (
        <div
          className="w-full mt-4 p-4 space-y-3 rounded-lg border bg-card text-card-foreground shadow-sm"
          id="screenshot-preview"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">live preview</h3>
            <span className="text-xs text-muted-foreground">
              {visionEvent ? "streaming..." : "waiting for stream..."}
            </span>
          </div>

          {visionEvent?.image ? (
            <div className="space-y-3">
              <div className="relative w-full h-[250px] overflow-hidden rounded-md">
                <Image
                  src={`data:image/jpeg;base64,${visionEvent.image}`}
                  alt="screen capture"
                  fill
                  style={{ objectFit: "contain" }}
                  className="rounded-md"
                  priority
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium">app:</span>{" "}
                  {visionEvent.app_name || "unknown"}
                </div>
                <div>
                  <span className="font-medium">window:</span>{" "}
                  {visionEvent.window_name || "unknown"}
                </div>
                <div>
                  <span className="font-medium">time:</span>{" "}
                  {new Date(visionEvent.timestamp).toLocaleTimeString()}
                </div>
                {visionEvent.browser_url && (
                  <div className="col-span-2 truncate">
                    <span className="font-medium">url:</span>{" "}
                    {visionEvent.browser_url}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="animate-pulse bg-gray-200 rounded-md w-full h-[250px]" />
          )}
        </div>
      )}

      {/* Stats display */}
      {stats && (
        <div className="w-full p-4 space-y-3 rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">screenshots</span>
            </div>
            <span className="font-mono text-sm">
              {stats.screenshots.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">audio</span>
            </div>
            <span className="font-mono text-sm">
              {Math.round(stats.audioSeconds / 60)}m
            </span>
          </div>
        </div>
      )}

      {/* Scroll to bottom button */}
      {showScrollButton && status === "ok" && visionEvent && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-16 right-4 bg-primary text-primary-foreground rounded-full p-2 shadow-md hover:bg-primary/90 transition-opacity z-20"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}

      <div className="sticky bottom-0 bg-background pt-2 pb-1 w-full">
        <OnboardingNavigation
          handlePrevSlide={handlePrev}
          handleNextSlide={handleNext}
          prevBtnText="previous"
          nextBtnText="next"
        />
      </div>
    </div>
  );
};

export default OnboardingStatus;
