import React, { useState } from "react";
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
import { getBuildStatus } from "./pipe-card";

interface PipeDetailsProps {
  pipe: PipeWithStatus;
  onClose: () => void;
  onToggle: (pipe: PipeWithStatus, onComplete: () => void) => void;
  onConfigSave: (config: Record<string, any>, onComplete: () => void) => void;
  onUpdate: (pipe: PipeWithStatus, onComplete: () => void) => void;
  onDelete: (pipe: PipeWithStatus, onComplete: () => void) => void;
  onRefreshFromDisk: (pipe: PipeWithStatus, onComplete: () => void) => void;
}

const buildStatusNotAllows = ["in_progress", "not_started"];

const isValidSource = (source?: string): boolean => {
  if (!source) return false;

  // github url pattern
  const githubPattern = /^https?:\/\/(?:www\.)?github\.com\/.+\/.+/i;

  // filesystem path patterns (unix and windows)
  const unixPattern = /^(?:\/|~\/)/;
  const windowsPattern = /^[a-zA-Z]:\\|^\\\\/;

  return (
    githubPattern.test(source) ||
    unixPattern.test(source) ||
    windowsPattern.test(source)
  );
};

export const PipeDetails: React.FC<PipeDetailsProps> = ({
  pipe,
  onClose,
  onToggle,
  onConfigSave,
  onUpdate,
  onDelete,
  onRefreshFromDisk,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  return (
    <div className="fixed inset-0 bg-background transform transition-transform duration-200 ease-in-out flex flex-col">
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
            by {pipe.developer_accounts.developer_name}
          </Badge>
          {pipe.has_update && (
            <Badge
              variant="default"
              className="bg-gray-800 text-xs animate-pulse"
            >
              update available
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {pipe.is_installed && (
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
                              setIsLoading(true);
                              onToggle(pipe, () => setIsLoading(false));
                            }}
                            variant={
                              pipe.installed_config?.enabled
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
                            {pipe.installed_config?.enabled
                              ? "disable"
                              : "enable"}{" "}
                            pipe
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <LogFileButton className="text-xs" />

                    {pipe.installed_config?.source &&
                    isValidSource(pipe.installed_config.source) ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() =>
                                onRefreshFromDisk(pipe, () =>
                                  setIsLoading(false),
                                )
                              }
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
                      </TooltipProvider>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => {
                                onUpdate(pipe, () => setIsLoading(false));
                              }}
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {pipe.has_update ? (
                              <p>update available! click to update pipe</p>
                            ) : (
                              <p>check for updates</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    <div className="flex items-center gap-2">
                      {/* Only show delete button for non-core pipes */}
                      {!pipe.is_core_pipe && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                onClick={() => {
                                  onDelete(pipe, () => setIsLoading(false));
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
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {pipe.installed_config?.enabled && (
                <div className="space-y-3 pt-4 border-t">
                  <PipeConfigForm
                    pipe={pipe}
                    onConfigSave={(config) => {
                      onConfigSave(config, () => setIsLoading(false));
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-8 ">
            {pipe.installed_config?.enabled &&
              !buildStatusNotAllows.includes(
                getBuildStatus(pipe.installed_config.buildStatus) ?? "",
              ) &&
              pipe.installed_config?.port && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          openUrl(
                            `http://localhost:${pipe.installed_config?.port}`,
                          )
                        }
                        disabled={!pipe.installed_config?.enabled}
                      >
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                        open in browser
                      </Button>
                      <Button
                        variant="default"
                        onClick={async () => {
                          try {
                            await invoke("open_pipe_window", {
                              port: pipe.installed_config!.port,
                              title: pipe.name,
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
                        disabled={!pipe.installed_config.enabled}
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
