import React from "react";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  Power,
  Puzzle,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { PipeStoreMarkdown } from "@/components/pipe-store-markdown";
import { PipeWithStatus } from "./types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { LogFileButton } from "../log-file-button";
import { toast } from "../ui/use-toast";
import { invoke } from "@tauri-apps/api/core";
import { PipeConfigForm } from "../pipe-config-form";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { Badge } from "../ui/badge";

interface PipeDetailsProps {
  pipe: PipeWithStatus;
  onClose: () => void;
}

export const PipeDetails: React.FC<PipeDetailsProps> = ({ pipe, onClose }) => {
  return (
    <div className="fixed inset-0 bg-background transform transition-transform duration-200 ease-in-out flex flex-col">
      {/* <CreditPurchaseDialog
        open={showCreditDialog}
        onOpenChange={setShowCreditDialog}
        requiredCredits={
          pipe !== null
            ? corePipes.find((cp) => cp.id === pipe.id)?.credits || 0
            : 0
        }
        currentCredits={user?.credits?.amount || 0}
        onCreditsUpdated={refreshUser}
      /> */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-medium">{pipe.name}</h2>
          <Badge variant={"outline"} className="font-mono text-xs">
            by {pipe.status}
          </Badge>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[320px] border-r bg-muted/10 flex-shrink-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            <div className="flex gap-2">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => {
                            // TODO: toggle enabled
                          }}
                          variant={
                            pipe.installedConfig?.enabled
                              ? "default"
                              : "outline"
                          }
                          size="icon"
                          className="h-8 w-8"
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {pipe.installedConfig?.enabled ? "disable" : "enable"}{" "}
                          pipe
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <LogFileButton className="text-xs" />

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => {
                            // TODO: update pipe
                          }}
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>update pipe</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* TODO: add refresh from disk */}
                  {/* <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => handleRefreshFromDisk(pipe)}
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>refresh the code from your local disk</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider> */}

                  <div className="flex items-center gap-2">
                    {/* Only show delete button for non-core pipes */}
                    {/* {!corePipes.some((cp) => cp.id === pipe.id) && ( */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => {
                              // TODO: delete pipe
                            }}
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>delete pipe</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {/* )} */}
                  </div>
                </div>
              </div>
            </div>

            {pipe.installedConfig?.enabled && (
              <div className="space-y-3 pt-4 border-t">
                <PipeConfigForm
                  pipe={pipe.installedConfig}
                  onConfigSave={() => {
                    // TODO: save config
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-8 ">
            {pipe.installedConfig?.enabled && pipe.installedConfig?.port && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        openUrl(
                          `http://localhost:${pipe.installedConfig?.port}`
                        )
                      }
                      disabled={!pipe.isRunning}
                    >
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      open in browser
                    </Button>
                    <Button
                      variant="default"
                      onClick={async () => {
                        try {
                          await invoke("open_pipe_window", {
                            port: pipe.installedConfig!.port,
                            title: pipe.id,
                          });
                        } catch (err) {
                          console.error("failed to open pipe window:", err);
                          toast({
                            title: "error opening pipe window",
                            description: "please try again or check the logs",
                            variant: "destructive",
                          });
                        }
                      }}
                      disabled={!pipe.isRunning}
                    >
                      <Puzzle className="mr-2 h-3.5 w-3.5" />
                      open as app
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {pipe.description && (
              <div>
                <h3 className="text-lg font-medium mb-4">about this pipe</h3>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <PipeStoreMarkdown content={pipe.description} />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
