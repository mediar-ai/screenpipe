import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, Puzzle, UserIcon, Loader2 } from "lucide-react";
import { PipeStoreMarkdown } from "@/components/pipe-store-markdown";
import { PipeWithStatus } from "./types";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "@/components/ui/use-toast";

interface PipeCardProps {
  pipe: PipeWithStatus;
  onInstall: (pipe: PipeWithStatus, onComplete: () => void) => Promise<any>;
  onPurchase: (pipe: PipeWithStatus, onComplete: () => void) => Promise<any>;
  onClick: (pipe: PipeWithStatus) => void;
  isLoadingPurchase?: boolean;
  isLoadingInstall?: boolean;
}

export const PipeCard: React.FC<PipeCardProps> = ({
  pipe,
  onInstall,
  onClick,
  onPurchase,
  isLoadingPurchase,
  isLoadingInstall,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const handleOpenWindow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (pipe.installed_config?.port) {
        await invoke("open_pipe_window", {
          port: pipe.installed_config.port,
          title: pipe.name, // atm we don't support pipes with same name
        });
      }
    } catch (err) {
      console.error("failed to open pipe window:", err);
      toast({
        title: "error opening pipe window",
        description: "please try again or check the logs",
        variant: "destructive",
      });
    }
  };

  return (
    <div
      className="group border rounded-xl p-5 hover:bg-muted/40 transition-all duration-200 cursor-pointer backdrop-blur-sm"
      onClick={() => onClick(pipe)}
    >
      <div className="flex flex-col h-full justify-between space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg tracking-tight">
                {pipe.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                <PipeStoreMarkdown
                  content={pipe.description?.substring(0, 90) || "" + "..."}
                  variant="compact"
                />
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pipe.is_installed ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenWindow}
                className="hover:bg-muted font-medium"
              >
                <CheckCircle className="h-3.5 w-3.5 mr-2" />
                installed
              </Button>
            ) : (
              <Button
                size="sm"
                variant={pipe.is_paid ? "default" : "outline"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (pipe.is_paid && !pipe.has_purchased) {
                    setIsLoading(true);
                    onPurchase(pipe, () => setIsLoading(false));
                  } else {
                    setIsLoading(true);
                    onInstall(pipe, () => setIsLoading(false));
                  }
                }}
                className="font-medium"
                disabled={isLoadingPurchase}
              >
                {isLoadingPurchase ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  </>
                ) : pipe.is_paid && !pipe.has_purchased ? (
                  `$${pipe.price}`
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5 mr-2" />
                    get
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
        {pipe.developer_accounts.developer_name && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
            <div className="flex items-center gap-1">
              <div className="size-6 rounded-full bg-muted flex items-center justify-center">
                <UserIcon className="size-3" />
              </div>
              {pipe.developer_accounts.developer_name}
            </div>
            {pipe.plugin_analytics.downloads_count != null && (
              <span className="flex items-center gap-1">
                <Download className="h-3 w-3" />
                {pipe.plugin_analytics.downloads_count}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
