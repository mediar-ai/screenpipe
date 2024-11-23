import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";
import { MemoizedReactMarkdown } from "@/components/markdown";
import { CodeBlock } from "@/components/ui/codeblock";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { toast } from "./ui/use-toast";
import { Input } from "./ui/input";
import {
  Download,
  Plus,
  Trash2,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  Power,
  Link,
  Heart,
  Puzzle,
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
import { homeDir, join } from "@tauri-apps/api/path";
import { convertHtmlToMarkdown } from "@/lib/utils";
import LogViewer from "./log-viewer-v2";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { LogFileButton } from "./log-file-button";

export interface Pipe {
  enabled: boolean;
  id: string;
  source: string;
  fullDescription: string;
  config?: Record<string, any>;
}

interface CorePipe {
  id: string;
  description: string;
  url: string;
}

const corePipes: CorePipe[] = [
  {
    id: "pipe-obsidian-time-logs",
    description:
      "continuously write logs of your days in an obsidian table using ollama+llama3.2",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-obsidian-time-logs",
  },
  {
    id: "pipe-post-questions-on-reddit",
    description:
      "get more followers, promote your content/product while being useful, without doing any work",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-post-questions-on-reddit",
  },
  {
    id: "pipe-phi3.5-engineering-team-logs",
    description:
      "continuously write logs of your days in a notion table using ollama+llama3.2",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-phi3.5-engineering-team-logs",
  },

];
const PipeDialog: React.FC = () => {
  const [newRepoUrl, setNewRepoUrl] = useState("");
  const [selectedPipe, setSelectedPipe] = useState<Pipe | null>(null);
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const { health } = useHealthCheck();

  useEffect(() => {
    fetchInstalledPipes();
  }, [health?.status]);

  const handleResetAllPipes = async () => {
    try {
      // reset pipes
      // await invoke("reset_all_pipes");
      // instead use screenpipe pipe purge -y
      const cmd = Command.sidecar("screenpipe", ["pipe", "purge", "-y"]);
      await cmd.execute();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast({
        title: "All pipes deleted",
        description: "The pipes folder has been reset.",
      });
      // Refresh the pipe list and installed pipes
      await fetchInstalledPipes();
      setSelectedPipe(null);
    } catch (error) {
      console.error("Failed to reset pipes:", error);
      toast({
        title: "Error resetting pipes",
        description: "Please try again or check the logs for more information.",
        variant: "destructive",
      });
    } finally {
      setSelectedPipe(null);
      setPipes([]);
    }
  };
  // console.log("pipes", pipes);
  const fetchInstalledPipes = async () => {
    if (!health || health?.status === "error") {
      return;
    }

    try {
      const response = await fetch("http://localhost:3030/pipes/list");

      if (!response.ok) {
        throw new Error("failed to fetch installed pipes");
      }
      const data = await response.json();
      for (const pipe of data) {
        // read the README.md file from disk and set the fullDescription
        const home = await homeDir();
        const pathToReadme = await join(
          home,
          ".screenpipe",
          "pipes",
          pipe.id,
          "README.md"
        );
        try {
          const readme = await readFile(pathToReadme);
          const readmeString = new TextDecoder().decode(readme);
          pipe.fullDescription = convertHtmlToMarkdown(readmeString);
        } catch (error) {
          console.warn(`no readme found for pipe ${pipe.id}`);
          pipe.fullDescription = "no description available for this pipe.";
        }
      }
      setPipes(data);
      // Update selectedPipe if it exists in the new data
      if (selectedPipe) {
        const updatedSelectedPipe = data.find(
          (pipe: Pipe) => pipe.id === selectedPipe.id
        );
        setSelectedPipe(updatedSelectedPipe || null);
      }
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
      const data = await response.json();
      toast({
        title: "pipe downloaded",
        // description: data.message,
      });
      // Refresh the pipe list
      // await addCustomPipe(url);
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
    try {
      posthog.capture("toggle_pipe", {
        pipe_id: pipe.id,
        enabled: !pipe.enabled,
      });
      if (!pipe.enabled) {
        // Enable the pipe through API
        await fetch(`http://localhost:3030/pipes/enable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pipe_id: pipe.id }),
        });

        toast({
          title: "enabling pipe",
          description: "this may take a few moments...",
        });
      } else {
        // Disable the pipe through API
        await fetch(`http://localhost:3030/pipes/disable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pipe_id: pipe.id }),
        });

        toast({
          title: "disabling pipe",
          description: "this may take a few moments...",
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast({
        title: pipe.enabled ? "pipe disabled" : "pipe enabled",
        description:
          "screenpipe has been updated with the new configuration. please restart screenpipe now in status badge",
      });

      // Update selectedPipe if it's the one being toggled
      if (selectedPipe && selectedPipe.id === pipe.id) {
        setSelectedPipe((prevPipe) =>
          prevPipe ? { ...prevPipe, enabled: !prevPipe.enabled } : null
        );
      }
    } catch (error) {
      console.error("Failed to toggle pipe:", error);
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
          title: "Adding custom pipe",
          description: "Please wait...",
        });
        // use /download endpoint to download the pipe
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
        const data = await response.json();
        // refresh the pipe list
        await fetchInstalledPipes();
        toast({
          title: "Custom pipe added",
          description:
            "Your pipe has been successfully added. Screenpipe will restart with the new pipe.",
        });
      } catch (error) {
        console.error("Failed to add custom pipe:", error);
        toast({
          title: "Error adding custom pipe",
          description: "Please check the URL and try again.",
          variant: "destructive",
        });
      } finally {
        setNewRepoUrl("");
        setSelectedPipe(null);
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
      fetch(`http://localhost:3030/pipes/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: selectedPipe.id, config }),
      });
      toast({
        title: "Configuration saved",
        description: "The pipe configuration has been updated.",
      });
    }
  };

  const renderPipeContent = () => {
    if (!selectedPipe) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-lg mb-4">no pipe selected</p>
          {/* <FeatureRequestLink /> */}
          {!health ||
            (health?.status === "error" && (
              <p className="mt-4 text-sm text-gray-500 text-center">
                screenpipe is not running.
                <br />
                please start screenpipe to use the pipe store.
              </p>
            ))}
        </div>
      );
    }

    return (
      <>
        <h2 className="text-2xl font-bold mb-2">{selectedPipe.id}</h2>

        <div className="flex space-x-2 mb-4">
          <Button
            onClick={() => handleToggleEnabled(selectedPipe)}
            variant={selectedPipe.enabled ? "default" : "outline"}
            disabled={health?.status === "error"}
          >
            <Power className="mr-2 h-4 w-4" />
            {selectedPipe.enabled ? "disable" : "enable"}
          </Button>

          {!selectedPipe.source?.startsWith("https://") && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => handleRefreshFromDisk(selectedPipe)}
                    variant="outline"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    refresh
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>refresh the code from your local disk</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {selectedPipe.source?.startsWith("http") && (
            <Button
              onClick={() => openUrl(selectedPipe.source)}
              variant="outline"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              view source
            </Button>
          )}
          <Button
            onClick={() =>
              openUrl(
                "https://twitter.com/intent/tweet?text=here's%20how%20i%20use%20@screen_pipe%20...%20%5Bscreenshot%5D%20an%20awesome%20tool%20for%20..."
              )
            }
            variant="outline"
          >
            <Heart className="mr-2 h-4 w-4" />
            support us
          </Button>
          <LogFileButton />
        </div>
        <Separator className="my-4" />

        {selectedPipe && selectedPipe.enabled && selectedPipe?.config?.port && (
          <div className="mt-4 h-[400px]">
            <h3 className="text-xl font-semibold mb-2">pipe ui</h3>
            <iframe
              src={`http://localhost:${selectedPipe.config.port}`}
              className="w-full h-full border-0"
            />
          </div>
        )}

        {selectedPipe.enabled && (
          <>
            {/* <Collapsible
              open={isLogOpen}
              onOpenChange={setIsLogOpen}
              className="w-full mt-4"
            >
              <div className="flex items-center justify-between w-full">
                <CollapsibleTrigger className="flex items-center justify-between p-2 flex-grow border-b border-gray-200">
                  screenpipe logs
                  <span>{isLogOpen ? "▲" : "▼"}</span>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <LogViewer className="mt-2" />
              </CollapsibleContent>
            </Collapsible>
            <Separator className="my-4" /> */}

            <PipeConfigForm
              pipe={selectedPipe}
              onConfigSave={handleConfigSave}
            />
          </>
        )}

        {selectedPipe.fullDescription && (
          <div className="mt-4">
            <h3 className="text-xl font-semibold mb-2">about this pipe</h3>
            <MemoizedReactMarkdown
              className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-full"
              remarkPlugins={[remarkGfm, remarkMath]}
              components={{
                p({ children }) {
                  return <p className="mb-2 last:mb-0">{children}</p>;
                },
                code({ node, className, children, ...props }) {
                  const content = String(children).replace(/\n$/, "");
                  const match = /language-(\w+)/.exec(className || "");

                  if (!match) {
                    return (
                      <code
                        className="py-0.5 rounded-sm font-mono text-sm"
                        {...props}
                      >
                        {content}
                      </code>
                    );
                  }

                  return (
                    <CodeBlock
                      key={Math.random()}
                      language={(match && match[1]) || ""}
                      value={content}
                      {...props}
                    />
                  );
                },
                a({ href, children }) {
                  console.log("Processing link:", href);
                  const isDirectVideo =
                    href?.match(/\.(mp4|webm|ogg)$/) ||
                    href?.includes("user-attachments/assets");
                  const youtubeMatch = href?.match(
                    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/
                  );

                  console.log("Is direct video:", isDirectVideo);
                  console.log("Is YouTube video:", !!youtubeMatch);

                  if (isDirectVideo) {
                    return (
                      <RetryableVideo
                        src={href}
                        maxRetries={3}
                        retryDelay={1000}
                      />
                    );
                  } else if (youtubeMatch) {
                    const videoId = youtubeMatch[1];
                    return (
                      <iframe
                        width="100%"
                        height="315"
                        src={`https://www.youtube.com/embed/${videoId}`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="max-w-full"
                        style={{ maxHeight: "400px" }}
                      ></iframe>
                    );
                  }

                  // If it's not recognized as a video, log this info
                  console.log(
                    "Link not recognized as video, rendering as normal link"
                  );
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  );
                },
                video({ src }) {
                  console.log("vid", src);
                  return (
                    <video
                      src={src}
                      className="max-w-full h-auto"
                      style={{ maxHeight: "400px" }}
                    />
                  );
                },
                img({ src, alt }) {
                  console.log("img", src);
                  return (
                    <img
                      src={src}
                      alt={alt}
                      className="max-w-full h-auto"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.onerror = null;
                        target.src = "path/to/fallback/image.png";
                      }}
                    />
                  );
                },
              }}
            >
              {selectedPipe.fullDescription.replace(/Â/g, "")}
            </MemoizedReactMarkdown>
          </div>
        )}
      </>
    );
  };

  // Add this function to handle refreshing from disk
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

  const renderCorePipes = () => (
    <div className="mb-3">
      <h3 className="text-lg font-semibold mb-2">try these pipes</h3>
      <div className="flex flex-col overflow-hidden">
        {corePipes.map((pipe) => (
          <Card key={pipe.id} className="p-4">
            <h4 className="font-medium text-lg mb-2">{pipe.id}</h4>
            <p className="text-sm text-gray-500 mb-4">{pipe.description}</p>
            <Button
              size="sm"
              className="w-full"
              onClick={() => handleDownloadPipe(pipe.url)}
            >
              <Download className="mr-2 h-4 w-4" />
              add pipe
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderContent = () => {
    if (!health || health?.status === "error") {
      return (
        <div className="flex flex-col items-center justify-center h-[500px]">
          <p className="text-lg mb-4 text-center">screenpipe is not running</p>
          <p className="text-sm text-gray-500 text-center">
            please start screenpipe to use the pipe store.
            <br />
            you can do this by clicking the status badge in the top right
            corner.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-[550px]">
        <div className="flex flex-1 overflow-hidden">
          <div className="w-3/5 pr-4 overflow-y-auto">
            {renderCorePipes()}
            <Separator className="my-4" />
            <h3 className="text-lg font-semibold mb-2">your pipes</h3>
            {pipes.map((pipe: Pipe) => (
              <Card
                key={pipe.id}
                className="cursor-pointer hover:bg-gray-100 mb-2 p-2"
                onClick={() => setSelectedPipe(pipe)}
              >
                <div className="flex justify-between items-start">
                  <h3>{pipe.id}</h3>
                </div>
              </Card>
            ))}
            <Card className="mb-2 p-2">
              <Input
                type="url"
                placeholder="enter repo url"
                value={newRepoUrl}
                onChange={(e) => setNewRepoUrl(e.target.value)}
              />
              <Button
                className="mt-2 w-full"
                onClick={handleAddOwnPipe}
                disabled={!newRepoUrl}
              >
                <Plus className="mr-2" size={16} />
                add your own pipe
              </Button>
              <Button
                className="mt-2 w-full"
                onClick={handleLoadFromLocalFolder}
                variant="outline"
              >
                <FolderOpen className="mr-2" size={16} />
                load from local folder
              </Button>
            </Card>
          </div>
          <div className="w-full pl-4 border-l overflow-y-auto">
            {renderPipeContent()}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" className="h-[20px] px-0 py-0">
          <Puzzle className="mr-2 h-4 w-4" />
          pipe store
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] w-full max-h-[90vh] h-full ">
        <DialogHeader>
          <DialogTitle>
            pipe store
            <Badge variant="secondary" className="ml-2">
              experimental
            </Badge>
          </DialogTitle>
          <div className="absolute top-4 right-20">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" onClick={handleResetAllPipes}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    reset all pipes
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>use this if running into issues with the pipe store</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <DialogDescription>
            screenpipe&apos;s store is a collection of plugins called
            &quot;pipes&quot; that are available to install.
            <br />
            it will process, annotate, help you search, automate in your
            screenpipe&apos;s data, or anything else you can imagine that help
            you get more out of your recordings.
            <br />
            make sure to restart screenpipe after changing a pipe&apos;s
            configuration.
            <a
              href="https://docs.screenpi.pe/docs/plugins"
              className="text-blue-500 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {" "}
              read the docs
            </a>
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
};

export default PipeDialog;

// Add this new component
const RetryableVideo = ({
  src,
  maxRetries = 3,
  retryDelay = 1000,
}: {
  src?: string;
  maxRetries?: number;
  retryDelay?: number;
}) => {
  const [retries, setRetries] = useState(0);
  const [key, setKey] = useState(0);

  const handleError = (e: any) => {
    console.error("Video loading error:", e);
    if (retries < maxRetries) {
      setTimeout(() => {
        setRetries(retries + 1);
        setKey(key + 1); // This forces a re-render of the video element
      }, retryDelay);
    }
  };

  return (
    <video
      key={key}
      src={src}
      controls
      className="max-w-full h-auto"
      style={{ maxHeight: "400px" }}
      onError={handleError}
      onLoadStart={() => console.log("Video load started:", src)}
      onLoadedData={() => console.log("Video data loaded:", src)}
    >
      your browser does not support the video tag.
    </video>
  );
};
