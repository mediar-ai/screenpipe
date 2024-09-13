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
import { usePipes, Pipe } from "@/lib/hooks/use-pipes";
import { CodeBlock } from "@/components/ui/codeblock";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Skeleton } from "./ui/skeleton";
import { PrettyLink } from "@/components/pretty-link";
import { MeetingSummarizer } from "./meeting-summarized";
import { useSettings } from "@/lib/hooks/use-settings";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "./ui/use-toast";
import { Input } from "./ui/input";
import { Download, Plus, Trash2 } from "lucide-react";
import { FeatureRequestLink } from "./feature-request-link";
import PipeLogger from "./pipe-logger";
import { PipeConfigForm } from "./pipe-config-form";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import posthog from "posthog-js";
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const PipeDialog: React.FC = () => {
  const [newRepoUrl, setNewRepoUrl] = useState("");
  const { pipes, loading, error, addCustomPipe } = usePipes([
    // "https://github.com/different-ai/file-organizer-2000",
    // "https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-tagging-activity",
    // "https://github.com/mediar-ai/screenpipe/tree/pipe-logs/examples/typescript/pipe-stream-ocr-text",
  ]);
  // console.log("pipes", pipes);
  // console.log("newRepoUrl", newRepoUrl);
  const [selectedPipe, setSelectedPipe] = useState<Pipe | null>(null);
  const { settings, updateSettings } = useSettings();
  const [installedPipes, setInstalledPipes] = useState<string[]>([]);
  const { health } = useHealthCheck();
  useEffect(() => {
    fetchInstalledPipes();
  }, []);

  const handleResetAllPipes = async () => {
    try {
      await invoke("reset_all_pipes");
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
    }
  };
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
      setInstalledPipes(data.map((pipe: any) => pipe.id));
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
      // await fetchInstalledPipes();
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
        pipe_id: pipe.name,
        enabled: !pipe.enabled,
      });
      if (!pipe.enabled) {
        // Enable the pipe through API
        await fetch(`http://localhost:3030/pipes/enable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pipe_id: pipe.name }),
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
          body: JSON.stringify({ pipe_id: pipe.name }),
        });

        toast({
          title: "disabling pipe",
          description: "this may take a few moments...",
        });
      }

      // await new Promise((resolve) => setTimeout(resolve, 1000));

      // // Kill existing screenpipe processes
      // await invoke("kill_all_sreenpipes");

      // // Spawn new screenpipe process
      // await invoke("spawn_screenpipe");

      // Update local state
      const updatedPipe = { ...pipe, enabled: !pipe.enabled };
      const updatedInstalledPipes = settings.installedPipes.map((p) =>
        p.name === pipe.name ? updatedPipe : p
      );
      await updateSettings({ installedPipes: updatedInstalledPipes });

      setSelectedPipe(updatedPipe);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast({
        title: pipe.enabled ? "pipe disabled" : "pipe enabled",
        description:
          "screenpipe has been updated with the new configuration. please restart screenpipe now in status badge",
      });
    } catch (error) {
      console.error("Failed to toggle pipe:", error);
      toast({
        title: "error toggling pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
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
        await addCustomPipe(newRepoUrl);
        setNewRepoUrl("");
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
      }
    }
  };

  const handleConfigSave = async (config: Record<string, any>) => {
    if (selectedPipe) {
      const updatedPipe = { ...selectedPipe, config };
      const updatedInstalledPipes = settings.installedPipes.map((p) =>
        p.name === selectedPipe.name ? updatedPipe : p
      );
      await updateSettings({ installedPipes: updatedInstalledPipes });
      setSelectedPipe(updatedPipe);
      toast({
        title: "Configuration saved",
        description: "The pipe configuration has been updated.",
      });
    }
  };

  const formatUpdatedTime = (date: string) => {
    const now = new Date();
    const updated = new Date(date);
    const diffTime = Math.abs(now.getTime() - updated.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
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

    const isInstalled = installedPipes.includes(selectedPipe.name);
    // console.log("installedPipes", installedPipes);

    return (
      <>
        <h2 className="text-2xl font-bold mb-2">{selectedPipe.name}</h2>
        <div className="flex justify-between items-center mb-4">
          <div>
            {selectedPipe.downloads && (
              <p>downloads: {selectedPipe.downloads}</p>
            )}
            {selectedPipe.version && <p>version: {selectedPipe.version}</p>}
            {selectedPipe.author && (
              <p>
                by:{" "}
                {selectedPipe.authorLink ? (
                  <a
                    href={selectedPipe.authorLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    {selectedPipe.author}
                  </a>
                ) : (
                  selectedPipe.author
                )}
              </p>
            )}
            {selectedPipe.repository && (
              <p>
                repository:{" "}
                <a
                  href={selectedPipe.repository}
                  className="text-blue-500 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  link
                </a>
              </p>
            )}
            {selectedPipe.lastUpdate && (
              <p>
                last update:{" "}
                <span className="text-gray-500">
                  {formatDate(selectedPipe.lastUpdate)}
                </span>
              </p>
            )}
          </div>
        </div>
        {selectedPipe.description && (
          <p className="mb-4">{selectedPipe.description}</p>
        )}
        <div className="flex space-x-2 mb-4">
          {isInstalled ? (
            <Button
              onClick={() => handleToggleEnabled(selectedPipe)}
              variant={selectedPipe.enabled ? "default" : "outline"}
              disabled={health?.status === "error"}
            >
              {selectedPipe.enabled ? "disable" : "enable"}
            </Button>
          ) : (
            <Button
              onClick={() => handleDownloadPipe(selectedPipe.repository)}
              variant="outline"
              disabled={health?.status === "error"}
            >
              <Download className="mr-2" size={16} />
              Download
            </Button>
          )}
          <Button disabled variant="outline">
            copy share link
            <Badge variant="secondary" className="ml-2">
              soon
            </Badge>
          </Button>
          <Button disabled variant="outline">
            donate
            <Badge variant="secondary" className="ml-2">
              soon
            </Badge>
          </Button>
        </div>
        <Separator className="my-4" />

        {isInstalled && (
          <PipeConfigForm pipe={selectedPipe} onConfigSave={handleConfigSave} />
        )}

        <Separator className="my-4" />

        {selectedPipe.fullDescription && (
          <div className="mt-4">
            <h3 className="text-xl font-semibold mb-2">About this pipe</h3>
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
                img({ src, alt }) {
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

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost">pipe store</Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] w-full max-h-[90vh] h-full">
        <DialogHeader>
          {/* <div className=" flex flex-col items-start">
            <Button size="sm" onClick={handleResetAllPipes}>
              <Trash2 className="mr-2 h-4 w-4" />
              reset all pipes
            </Button>
            <span className="text-xs text-gray-500 mt-1">
              use this if running into issues with the pipe store
            </span>
          </div> */}
          <DialogTitle>
            pipe store
            <Badge variant="secondary" className="ml-2">
              experimental
            </Badge>
          </DialogTitle>

          <DialogDescription>
            screenpipe&apos;s store is a collection of plugins called
            &quot;pipes&quot; that are available to install.
            <br />
            it will process, annotate, help you search, automate in your
            screenpipe&apos;s data, or anything else you can imagine that help
            you get more out of your recordings.
            <br />
            {/* <a
              href="https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript"
              className="text-blue-500 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              check out more examples on github
            </a> */}
          </DialogDescription>

          {/* {selectedPipe && <FeatureRequestLink className="w-80" />} */}
        </DialogHeader>
        {/* center message in big */}
        <div className="flex flex-col justify-center items-center h-[500px]">
          <p className="text-center">
            currently you need to enable pipes through `screenpipe pipe`
            commands or `/pipes` api
            <br />
            we&apos;re going to make this nontechnical next week.
          </p>
          <br />
          <a
            href="https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript"
            className="text-blue-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            check out more examples on github
          </a>
        </div>

        <div className="flex h-[500px]">
          <div className="w-1/3 pr-4 overflow-y-auto">
            {/* {pipes.length === 0 &&
              Array(5)
                .fill(0)
                .map((_, index) => (
                  <div key={index} className="mb-2">
                    <Skeleton className="h-24 w-full" />
                  </div>
                ))} */}
            {/* {pipes.map((pipe: Pipe) => (
              <Card
                key={pipe.name}
                className="cursor-pointer hover:bg-gray-100 mb-2 p-2"
                onClick={() => setSelectedPipe(pipe)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-semibold">{pipe.name}</h3>
                    {pipe.author && (
                      <p className="text-xs text-gray-500">by {pipe.author}</p>
                    )}
                  </div>
                  {pipe.downloads && (
                    <div className="text-xs text-gray-500 flex items-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-3 w-3 mr-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      {pipe.downloads}
                    </div>
                  )}
                </div>
                {pipe.description && (
                  <p className="text-xs mt-1 line-clamp-2">
                    {pipe.description}
                  </p>
                )}
                {pipe.lastUpdate && (
                  <p className="text-xs text-gray-500 mt-1">
                    updated {formatUpdatedTime(pipe.lastUpdate)}
                  </p>
                )}
              </Card>
            ))} */}
            {/* <Card className="mb-2 p-2">
              <Input
                placeholder="Enter repo URL"
                value={newRepoUrl}
                onChange={(e) => setNewRepoUrl(e.target.value)}
              />
              <Button
                className="mt-2 w-full"
                onClick={handleAddOwnPipe}
                disabled={!newRepoUrl}
              >
                <Plus className="mr-2" size={16} />
                Add Your Own Pipe
              </Button>
            </Card> */}
          </div>
          {/* <div className="w-full pl-4 border-l overflow-y-auto">
            {renderPipeContent()}
          </div> */}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PipeDialog;
