import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Sparkles, Clock } from "lucide-react";
import { create } from "zustand";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { useToast } from "@/components/ui/use-toast";

interface UpdateInfo {
  version: string;
  body: string;
}

interface UpdateDialogState {
  isOpen: boolean;
  updateInfo: UpdateInfo | null;
  isInstalling: boolean;
  setIsOpen: (open: boolean) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setIsInstalling: (installing: boolean) => void;
}

export const useUpdateDialog = create<UpdateDialogState>((set) => ({
  isOpen: false,
  updateInfo: null,
  isInstalling: false,
  setIsOpen: (open) => set({ isOpen: open }),
  setUpdateInfo: (info) => set({ updateInfo: info }),
  setIsInstalling: (installing) => set({ isInstalling: installing }),
}));

export function UpdateDialog() {
  const { isOpen, setIsOpen, updateInfo, isInstalling, setIsInstalling } = useUpdateDialog();
  const { toast } = useToast();

  const handleUpdate = async () => {
    setIsInstalling(true);
    toast({
      title: "installing update...",
      description: "screenpipe will restart automatically",
      duration: 10000,
    });
    
    // The update is already downloaded on macOS/Linux
    // Trigger restart to apply it
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

  const handleLater = () => {
    setIsOpen(false);
    toast({
      title: "update available",
      description: "click the tray icon to update when ready",
      duration: 5000,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            update available
          </DialogTitle>
          <DialogDescription>
            screenpipe {updateInfo?.version} is ready to install
          </DialogDescription>
        </DialogHeader>

        {updateInfo?.body && (
          <div className="max-h-48 overflow-y-auto rounded-md bg-muted p-3 text-sm">
            <p className="font-medium mb-2">what's new:</p>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {updateInfo.body.slice(0, 500)}
              {updateInfo.body.length > 500 && "..."}
            </p>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button
            variant="ghost"
            onClick={handleLater}
            disabled={isInstalling}
            className="gap-2"
          >
            <Clock className="h-4 w-4" />
            later
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={isInstalling}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {isInstalling ? "installing..." : "update now"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to listen for update events from Rust
export function useUpdateListener() {
  const { setIsOpen, setUpdateInfo } = useUpdateDialog();

  useEffect(() => {
    const setupListeners = async () => {
      // Listen for update available event
      const unlistenAvailable = await listen<UpdateInfo>("update-available", (event) => {
        setUpdateInfo(event.payload);
        setIsOpen(true);
      });

      // Listen for tray menu click
      const unlistenClick = await listen("update-now-clicked", () => {
        setIsOpen(true);
      });

      return () => {
        unlistenAvailable();
        unlistenClick();
      };
    };

    setupListeners();
  }, [setIsOpen, setUpdateInfo]);
}
