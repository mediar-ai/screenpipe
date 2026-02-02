"use client";

import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import { create } from "zustand";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface UpdateInfo {
  version: string;
  body: string;
}

interface UpdateBannerState {
  isVisible: boolean;
  updateInfo: UpdateInfo | null;
  isInstalling: boolean;
  setIsVisible: (visible: boolean) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setIsInstalling: (installing: boolean) => void;
}

export const useUpdateBanner = create<UpdateBannerState>((set) => ({
  isVisible: false,
  updateInfo: null,
  isInstalling: false,
  setIsVisible: (visible) => set({ isVisible: visible }),
  setUpdateInfo: (info) => set({ updateInfo: info }),
  setIsInstalling: (installing) => set({ isInstalling: installing }),
}));

interface UpdateBannerProps {
  className?: string;
  compact?: boolean;
}

export function UpdateBanner({ className, compact = false }: UpdateBannerProps) {
  const { isVisible, updateInfo, isInstalling, setIsVisible, setIsInstalling } = useUpdateBanner();
  const { toast } = useToast();

  const handleUpdate = async () => {
    setIsInstalling(true);
    toast({
      title: "installing update...",
      description: "screenpipe will restart automatically",
      duration: 10000,
    });
    
    try {
      await relaunch();
    } catch (error) {
      console.error("failed to relaunch:", error);
      setIsInstalling(false);
      toast({
        title: "update failed",
        description: "please try again or download manually",
        variant: "destructive",
      });
    }
  };

  if (!isVisible || !updateInfo) return null;

  if (compact) {
    return (
      <div className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground",
        className
      )}>
        <Sparkles className="h-3 w-3 text-primary" />
        <span>v{updateInfo.version} available</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-2 text-xs"
          onClick={handleUpdate}
          disabled={isInstalling}
        >
          {isInstalling ? "..." : "update"}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center justify-between gap-3 px-3 py-2 bg-muted/50 border-b text-sm",
      className
    )}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span>
          screenpipe <span className="font-medium">v{updateInfo.version}</span> is available
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={handleUpdate}
          disabled={isInstalling}
        >
          {isInstalling ? "installing..." : "update now"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setIsVisible(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Hook to listen for update events from Rust
export function useUpdateListener() {
  const { setIsVisible, setUpdateInfo } = useUpdateBanner();

  useEffect(() => {
    let unlistenAvailable: (() => void) | undefined;
    let unlistenClick: (() => void) | undefined;

    const setupListeners = async () => {
      // Listen for update available event
      unlistenAvailable = await listen<UpdateInfo>("update-available", (event) => {
        setUpdateInfo(event.payload);
        setIsVisible(true);
      });

      // Listen for tray menu click
      unlistenClick = await listen("update-now-clicked", () => {
        setIsVisible(true);
      });
    };

    setupListeners();

    return () => {
      unlistenAvailable?.();
      unlistenClick?.();
    };
  }, [setIsVisible, setUpdateInfo]);
}
