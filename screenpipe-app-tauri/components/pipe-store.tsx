import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "./ui/use-toast";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import {
  Download,
  Plus,
  Trash2,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  Search,
  Power,
  Puzzle,
  X,
} from "lucide-react";
import { PipeConfigForm } from "./pipe-config-form";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import posthog from "posthog-js";
import { open } from "@tauri-apps/plugin-dialog";
import { Command, open as openUrl } from "@tauri-apps/plugin-shell";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { readFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertHtmlToMarkdown } from "@/lib/utils";
import { LogFileButton } from "./log-file-button";
import { useSettings } from "@/lib/hooks/use-settings";
import { StripeSubscriptionButton } from "./stripe-subscription-button";
import { useUser } from "@/lib/hooks/use-user";
import { PipeStoreMarkdown } from "@/components/pipe-store-markdown";

export interface Pipe {
  enabled: boolean;
  id: string;
  source: string;
  fullDescription: string;
  config?: Record<string, any>;
  author?: string;
}

interface CorePipe {
  id: string;
  description: string;
  url: string;
}

const corePipes: CorePipe[] = [
  {
    id: "pipe-for-loom",
    description: "generate looms from your screenpipe data",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/pipe-for-loom",
  },
  {
    id: "pipe-obsidian-time-logs",
    description:
      "continuously write logs of your days in an obsidian table using ollama+llama3.2",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/pipe-obsidian-time-logs",
  },
  {
    id: "pipe-post-questions-on-reddit",
    description:
      "get more followers, promote your content/product while being useful, without doing any work",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/pipe-post-questions-on-reddit",
  },
  {
    id: "pipe-notion-table-logs",
    description:
      "continuously write logs of your days in a notion table using ollama",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/pipe-notion-table-logs",
  },
  {
    id: "pipe-simple-nextjs",
    description: "show most used keywords",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/pipe-simple-nextjs",
  },
];

const getAuthorFromSource = (source: string): string => {
  if (!source) return "Unknown";
  if (!source.startsWith("http")) return "Local";

  try {
    // Extract author from GitHub URL
    // Format: https://github.com/author/repo/...
    const match = source.match(/github\.com\/([^\/]+)/);
    return match ? match[1] : "Unknown";
  } catch {
    return "Unknown";
  }
};

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

const PipeStore: React.FC = () => {
  const [newRepoUrl, setNewRepoUrl] = useState("");
  const [selectedPipe, setSelectedPipe] = useState<Pipe | null>(null);
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInstalledOnly, setShowInstalledOnly] = useState(false);
  const { health } = useHealthCheck();
  const { getDataDir } = useSettings();
  const { user, checkLoomSubscription } = useUser();
  const [hasLoomSubscription, setHasLoomSubscription] = useState(false);

  useEffect(() => {
    if (user) {
      checkLoomSubscription().then(setHasLoomSubscription);
    }
  }, []);

  useEffect(() => {
    fetchInstalledPipes();
  }, [health?.status]);

  const handleResetAllPipes = async () => {
    try {
      const cmd = Command.sidecar("screenpipe", ["pipe", "purge", "-y"]);
      await cmd.execute();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast({
        title: "all pipes deleted",
        description: "the pipes folder has been reset.",
      });
      // Refresh the pipe list and installed pipes
      await fetchInstalledPipes();
    } catch (error) {
      console.error("failed to reset pipes:", error);
      toast({
        title: "error resetting pipes",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    } finally {
      setPipes([]);
    }
  };

  const fetchInstalledPipes = async () => {
    if (!health || health?.status === "error") return;

    const dataDir = await getDataDir();
    try {
      const response = await fetch("http://localhost:3030/pipes/list");
      if (!response.ok) throw new Error("failed to fetch installed pipes");

      const data = (await response.json()).data;
      for (const pipe of data) {
        const pathToReadme = await join(dataDir, "pipes", pipe.id, "README.md");
        try {
          const readme = await readFile(pathToReadme);
          pipe.fullDescription = convertHtmlToMarkdown(
            new TextDecoder().decode(readme)
          );
        } catch (error) {
          pipe.fullDescription = "no description available for this pipe.";
        }
      }
      setPipes(data);
    } catch (error) {
      console.error("Error fetching installed pipes:", error);
      toast({
        title: "error fetching installed pipes",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadPipe = async (url: string) => {
    try {
      posthog.capture("download_pipe", {
        pipe_id: url,
      });
      toast({
        title: "downloading pipe",
        description: "please wait...",
      });

      const response = await fetch(`http://localhost:3030/pipes/download`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        throw new Error("failed to download pipe");
      }
      await response.json();

      toast({
        title: "pipe downloaded",
      });
      await fetchInstalledPipes();
    } catch (error) {
      console.error("Failed to download pipe:", error);
      toast({
        title: "error downloading pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const handleToggleEnabled = async (pipe: Pipe) => {
    if (pipe.id === "pipe-for-loom" && !pipe.enabled) {
      const hasLoomSubscription = await checkLoomSubscription();
      if (!hasLoomSubscription) {
        toast({
          title: "subscription required",
          description: "please subscribe to use the loom pipe",
        });
        return;
      }
    }

    try {
      posthog.capture("toggle_pipe", {
        pipe_id: pipe.id,
        enabled: !pipe.enabled,
      });

      const endpoint = pipe.enabled ? "disable" : "enable";
      const response = await fetch(`http://localhost:3030/pipes/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: pipe.id }),
      });

      if (!response.ok) throw new Error(`failed to ${endpoint} pipe`);

      toast({
        title: `${endpoint}ing pipe`,
        description: "this may take a few moments...",
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
      await fetchInstalledPipes();
    } catch (error) {
      console.error(
        `Failed to ${pipe.enabled ? "disable" : "enable"} pipe:`,
        error
      );
      toast({
        title: "error toggling pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    } finally {
      await fetchInstalledPipes();
    }
  };

  const handleAddOwnPipe = async () => {
    posthog.capture("add_own_pipe", {
      newRepoUrl,
    });
    if (newRepoUrl) {
      try {
        toast({
          title: "adding custom pipe",
          description: "please wait...",
        });

        const response = await fetch(`http://localhost:3030/pipes/download`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: newRepoUrl }),
        });

        if (!response.ok) {
          throw new Error("failed to download pipe");
        }

        // refresh the pipe list
        await fetchInstalledPipes();

        toast({
          title: "custom pipe added",
          description: "your pipe has been successfully added.",
        });
      } catch (error) {
        console.error("failed to add custom pipe:", error);
        toast({
          title: "error adding custom pipe",
          description: "please check the url and try again.",
          variant: "destructive",
        });
      } finally {
        setNewRepoUrl("");
      }
    }
  };

  const handleLoadFromLocalFolder = async () => {
    try {
      const selectedFolder = await open({
        directory: true,
        multiple: false,
      });

      if (selectedFolder) {
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
        const response = await fetch(`http://localhost:3030/pipes/update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pipe_id: selectedPipe.id, config }),
        });
        if (!response.ok) {
          throw new Error("failed to update pipe config");
        }
        toast({
          title: "Configuration saved",
          description: "The pipe configuration has been updated.",
        });
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
  const handleDeletePipe = async (pipe: Pipe) => {
    try {
      posthog.capture("delete_pipe", {
        pipe_id: pipe.id,
      });
      toast({
        title: "deleting pipe",
        description: "please wait...",
      });

      const response = await fetch(`http://localhost:3030/pipes/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: pipe.id }),
      });

      if (!response.ok) {
        throw new Error("failed to delete pipe");
      }

      await fetchInstalledPipes();

      toast({
        title: "pipe deleted",
        description: "the pipe has been successfully removed",
      });
    } catch (error) {
      console.error("failed to delete pipe:", error);
      toast({
        title: "error deleting pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const allPipes = [
    ...pipes,
    ...corePipes
      .filter((cp) => !pipes.some((p) => p.id === cp.id))
      .map((cp) => ({
        id: cp.id,
        fullDescription: cp.description,
        source: cp.url,
        enabled: false,
      })),
  ];

  const filteredPipes = allPipes.filter(
    (pipe) =>
      pipe.id.toLowerCase().includes(searchQuery.toLowerCase()) &&
      (!showInstalledOnly || pipe.enabled)
  );

  const handleCloseDetails = async () => {
    setSelectedPipe(null);
    window.location.reload(); // dirty hack
  };

  const renderPipeDetails = () => {
    if (!selectedPipe) return null;

    return (
      <div className="fixed inset-0 bg-background transform transition-transform duration-200 ease-in-out flex flex-col">
        <div className="flex items-center justify-between p-4 border-b bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseDetails}
              className="hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-medium">{selectedPipe.id}</h2>
            <Badge variant="outline" className="font-mono text-xs">
              by {getAuthorFromSource(selectedPipe.source)}
            </Badge>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-[320px] border-r bg-muted/10 flex-shrink-0 overflow-y-auto">
            <div className="p-4 space-y-4">
              <div className="flex gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {selectedPipe.id === "pipe-for-loom" &&
                      !selectedPipe.enabled &&
                      !hasLoomSubscription ? (
                        <StripeSubscriptionButton
                          onSubscriptionComplete={() =>
                            handleToggleEnabled(selectedPipe)
                          }
                        />
                      ) : (
                        <Button
                          onClick={() => handleToggleEnabled(selectedPipe)}
                          variant={selectedPipe.enabled ? "default" : "outline"}
                          disabled={health?.status === "error"}
                          size="icon"
                          className="h-8 w-8"
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      )}
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{selectedPipe.enabled ? "disable" : "enable"} pipe</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <LogFileButton className="text-xs" />

                {selectedPipe.source?.startsWith("http") && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => openUrl(selectedPipe.source)}
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>view source code</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => handleDeletePipe(selectedPipe)}
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
              </div>

              <div className="space-y-2">
                {!selectedPipe.source?.startsWith("https://") && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => handleRefreshFromDisk(selectedPipe)}
                          variant="outline"
                          size="sm"
                          className="w-full"
                        >
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          refresh
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>refresh the code from your local disk</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              {selectedPipe.enabled && (
                <div className="space-y-3 pt-4 border-t">
                  <PipeConfigForm
                    pipe={selectedPipe}
                    onConfigSave={handleConfigSave}
                  />
                </div>
              )}
            </div>
          </div>

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto p-8">
              {selectedPipe.enabled && selectedPipe?.config?.port && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">pipe ui</h3>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        openUrl(`http://localhost:${selectedPipe.config!.port}`)
                      }
                    >
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      open in browser
                    </Button>
                  </div>
                  <div className="rounded-lg border overflow-hidden bg-background">
                    <iframe
                      src={`http://localhost:${selectedPipe.config.port}`}
                      className="w-full h-[600px] border-0"
                    />
                  </div>
                </div>
              )}

              {selectedPipe.fullDescription && (
                <div>
                  <h3 className="text-lg font-medium mb-4">about this pipe</h3>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <PipeStoreMarkdown content={selectedPipe.fullDescription} />
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    );
  };

  const handleRefreshFromDisk = async (pipe: Pipe) => {
    try {
      posthog.capture("refresh_pipe_from_disk", {
        pipe_id: pipe.id,
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
        body: JSON.stringify({ url: pipe.source }),
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

  const handleCardClick = async (pipe: Pipe) => {
    if (!pipe.enabled && pipe.source) {
      // If pipe is not installed, download it first
      await handleDownloadPipe(pipe.source);
      // Fetch the updated pipe data after download
      await fetchInstalledPipes();
      // Find the newly downloaded pipe in the updated list
      const updatedPipes = [
        ...pipes,
        ...corePipes
          .filter((cp) => !pipes.some((p) => p.id === cp.id))
          .map((cp) => ({
            id: cp.id,
            fullDescription: cp.description,
            source: cp.url,
            enabled: false,
          })),
      ];
      const updatedPipe = updatedPipes.find((p) => p.id === pipe.id);
      if (updatedPipe) {
        setSelectedPipe(updatedPipe);
      }
    } else {
      // If pipe is already installed, just show the details
      setSelectedPipe(pipe);
    }
  };

  console.log("selectedPipe", selectedPipe);

  if (selectedPipe) {
    return renderPipeDetails();
  }

  return (
    <div className="overflow-hidden flex flex-col space-y-4">
      <div className="flex flex-col flex-1 overflow-hidden space-y-4 p-4">
        <div className="space-y-4">
          <div className="flex flex-col  gap-4  w-[50%]">
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleResetAllPipes}
                      className="flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>remove all pipes and start fresh</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          <div className="text-sm text-gray-500">
            showing {filteredPipes.length} pipes:
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {filteredPipes.map((pipe) => (
                <div
                  key={pipe.id}
                  className="border rounded-lg p-4 hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => handleCardClick(pipe)}
                >
                  <div className="flex flex-col h-full">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{pipe.id}</h3>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate">
                            by {getAuthorFromSource(pipe.source)}
                          </span>
                          {pipe.source?.startsWith("http") ? (
                            <ExternalLink
                              className="h-3 w-3 flex-shrink-0 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                openUrl(pipe.source);
                              }}
                            />
                          ) : (
                            <FolderOpen className="h-3 w-3 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {pipe.enabled ? (
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleEnabled(pipe);
                            }}
                          >
                            <Power className="h-3.5 w-3.5 " />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadPipe(pipe.source);
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground mt-2 flex-1 line-clamp-3">
                      <PipeStoreMarkdown
                        content={truncateDescription(
                          pipe.fullDescription || ""
                        )}
                        variant="compact"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Updated recently
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border rounded-lg p-4 space-y-3 w-[50%] mx-auto">
              <h3 className="text-lg font-medium">add your own pipe</h3>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    type="url"
                    placeholder="enter github url or local path"
                    value={newRepoUrl}
                    onChange={(e) => setNewRepoUrl(e.target.value)}
                    autoCorrect="off"
                    autoComplete="off"
                  />
                </div>
                <Button
                  onClick={handleAddOwnPipe}
                  disabled={!newRepoUrl}
                  size="icon"
                  className="h-10 w-10"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  onClick={handleLoadFromLocalFolder}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                <a 
                  href="https://docs.screenpi.pe/docs/plugins" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:underline flex items-center gap-1"
                >
                  <Puzzle className="h-3 w-3" />
                  learn how to create your own pipe
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PipeStore;
