import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, Puzzle, UserIcon } from "lucide-react";
import { PipeStoreMarkdown } from "@/components/pipe-store-markdown";
import { PipeWithStatus } from "./types";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "@/components/ui/use-toast";

interface PipeCardProps {
  pipe: PipeWithStatus;
  onInstall: (pipe: PipeWithStatus, onComplete: () => void) => Promise<any>;
  onPurchase: (pipe: PipeWithStatus, onComplete: () => void) => Promise<any>;
  onClick: (pipe: PipeWithStatus) => void;
}

const truncateDescription = (description: string, maxLines: number = 4) => {
  if (!description) return "";
  const cleaned = description.replace(/Â/g, "").trim();

  // Split into lines and track codeblock state
  const lines = cleaned.split(/\r?\n/);
  let inCodeBlock = false;
  let visibleLines: string[] = [];
  let lineCount = 0;

  for (const line of lines) {
    // Check for codeblock markers
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      visibleLines.push(line);
      continue;
    }

    // If we're in a codeblock, include the line
    if (inCodeBlock) {
      visibleLines.push(line);
      continue;
    }

    // For non-codeblock content, count lines normally
    if (lineCount < maxLines) {
      visibleLines.push(line);
      if (line.trim()) lineCount++;
    }
  }

  // If we ended inside a codeblock, close it
  if (inCodeBlock) {
    visibleLines.push("```");
  }

  const result = visibleLines.join("\n");
  return lineCount >= maxLines ? result + "..." : result;
};

export const PipeCard: React.FC<PipeCardProps> = ({
  pipe,
  onInstall,
  onPurchase,
  onClick,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const handleOpenWindow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (pipe.installed_config?.port) {
        await invoke("open_pipe_window", {
          port: pipe.installed_config.port,
          title: pipe.id,
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
      <div className="flex flex-col h-full space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-[20%] bg-muted flex items-center justify-center overflow-hidden">
              <Puzzle className="size-4 text-muted-foreground" />
            </div>
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
              >
                {pipe.is_paid && !pipe.has_purchased ? (
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
        {pipe.installed_config?.source === "store" && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
