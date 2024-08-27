import React, { useState } from "react";
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
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const FeatureRequestLink: React.FC<{ className?: string }> = ({
  className,
}) => (
  <PrettyLink
    className={className}
    variant="outline"
    href="mailto:louis@screenpi.pe?subject=Screenpipe%20Pipe%20Store%20Feature&body=yo%20louis%2C%0A%0Ai'd%20like%20to%20be%20featured%20in%20the%20Pipe%20Store.%20I've%20got%20an%20awesome%20product%20that%20use%20screenpipe%20and%20would%20get%20some%20more%20users%20by%20being%20listed%20here.%0A%0A%3Cmy%20product%20does%20x%2C%20y%2C%20z%3E%0A%3Cthis%20is%20my%20twitter%20tag%20or%20linkedin%3E%20-%3C%20will%20interact%20with%20your%20post%20for%20maximum%20cross%20marketing%0A%0Alet's%20chat%20about%20how%20we%20can%20collaborate%0A%0Alooking%20forward%20to%20connecting!%0A%0A%3Cps%20book%20call%20here%20https%3A%2F%2Fcal.com%2Flouis030195%2Fscreenpipe%3E"
  >
    <span className="mr-2">want to be featured here? reach out</span>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  </PrettyLink>
);

const PipeDialog: React.FC = () => {
  const { pipes, loading, error } = usePipes([
    "https://github.com/different-ai/file-organizer-2000",
    "https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-tagging-activity",
  ]);
  const [selectedPipe, setSelectedPipe] = useState<Pipe | null>(null);
  const { settings, updateSettings } = useSettings();

  const formatUpdatedTime = (date: string) => {
    const now = new Date();
    const updated = new Date(date);
    const diffTime = Math.abs(now.getTime() - updated.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  };

  const handleInstall = async (pipe: Pipe) => {
    // if its file organizer, just open the github url in new tab
    if (pipe.repository.includes("file-organizer")) {
      console.log("opening file organizer", pipe.repository);
      open(pipe.repository);
      return;
    }

    try {
      toast({
        title: "Installing pipe",
        description: "This may take a few moments...",
      });

      // Update installed pipes in settings
      const updatedInstalledPipes = [...settings.installedPipes, pipe];
      await updateSettings({ installedPipes: updatedInstalledPipes });

      // Kill existing screenpipe processes
      await invoke("kill_all_sreenpipes");

      // Spawn new screenpipe process with the pipe
      await invoke("spawn_screenpipe");

      toast({
        title: "Pipe installed successfully",
        description: "Screenpipe has been restarted with the new pipe.",
      });

      setSelectedPipe({ ...pipe });
    } catch (error) {
      console.error("Failed to install pipe:", error);
      toast({
        title: "Error installing pipe",
        description: "Please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const handleUninstall = async (pipe: Pipe) => {
    try {
      toast({
        title: "Uninstalling pipe",
        description: "This may take a few moments...",
      });

      // Update installed pipes in settings
      const updatedInstalledPipes = settings.installedPipes.filter(
        (p) => p.name !== pipe.name
      );
      await updateSettings({ installedPipes: updatedInstalledPipes });

      // restart screenpipe with no pipe
      await invoke("kill_all_sreenpipes");
      await invoke("spawn_screenpipe");

      toast({
        title: "Pipe uninstalled successfully",
        description: "Screenpipe has been restarted without the pipe.",
      });

      setSelectedPipe({ ...pipe });
    } catch (error) {
      console.error("Failed to uninstall pipe:", error);
      toast({
        title: "Error uninstalling pipe",
        description: "Please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const renderPipeContent = () => {
    if (!selectedPipe) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-lg mb-4">no pipe selected</p>
          <FeatureRequestLink />
        </div>
      );
    }

    const isInstalled =
      settings.installedPipes.find((p) => p.name === selectedPipe.name) !==
      undefined;

    return (
      <>
        <h2 className="text-2xl font-bold mb-2">{selectedPipe.name}</h2>
        <div className="flex justify-between items-center mb-4">
          <div>
            <p>downloads: {selectedPipe.downloads}</p>
            <p>version: {selectedPipe.version}</p>
            <p>
              by:{" "}
              <a
                href={selectedPipe.authorLink}
                className="text-blue-500 hover:underline"
              >
                {selectedPipe.author}
              </a>
            </p>
            <p>
              repository:{" "}
              <a
                href={selectedPipe.repository}
                className="text-blue-500 hover:underline"
              >
                link
              </a>
            </p>
            <p>
              last update:{" "}
              <a
                href={selectedPipe.repository}
                className="text-blue-500 hover:underline"
              >
                {formatDate(selectedPipe.lastUpdate)}
              </a>
            </p>
          </div>
        </div>
        <p className="mb-4">{selectedPipe.description}</p>
        <div className="flex space-x-2 mb-4">
          {isInstalled ? (
            <Button onClick={() => handleUninstall(selectedPipe)}>
              Uninstall
            </Button>
          ) : (
            <Button onClick={() => handleInstall(selectedPipe)}>Install</Button>
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
        {isInstalled ? (
          <div className="mt-4">
            <h3 className="text-xl font-semibold mb-2">Controls</h3>
            {/* Add controls for the installed pipe here */}
            <p>Pipe controls will be displayed here.</p>
          </div>
        ) : (
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
                        className="py-0.5 rounded-sm  font-mono text-sm"
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
                    /* eslint-disable @next/next/no-img-element */
                    <img
                      src={src}
                      alt={alt}
                      className="max-w-full h-auto"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.onerror = null;
                        target.src = "path/to/fallback/image.png"; // Replace with your fallback image
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
        <Button variant="ghost">Pipe Store</Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] w-full max-h-[90vh] h-full">
        <DialogHeader>
          <DialogTitle>Pipe Store</DialogTitle>
          <DialogDescription>
            Screenpipe&apos;s store is a collection of app, scripts, prompts
            that are available to install.
            <br />
            It will process, annotate, help you search, or automate in your
            screenpipe&apos;s data.
            <br />
            <a
              href="https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript"
              className="text-blue-500 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Check out more examples on GitHub
            </a>
          </DialogDescription>

          {selectedPipe && <FeatureRequestLink className="w-80" />}
        </DialogHeader>
        <div className="flex h-[500px]">
          <div className="w-1/3 pr-4 overflow-y-auto">
            {loading &&
              Array(5)
                .fill(0)
                .map((_, index) => (
                  <div key={index} className="mb-2">
                    <Skeleton className="h-24 w-full" />
                  </div>
                ))}
            {error && <p>error: {error}</p>}
            {pipes.map((pipe: Pipe) => (
              <Card
                key={pipe.name}
                className="cursor-pointer hover:bg-gray-100 mb-2 p-2"
                onClick={() => setSelectedPipe(pipe)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-semibold">{pipe.name}</h3>
                    <p className="text-xs text-gray-500">by {pipe.author}</p>
                  </div>
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
                </div>
                <p className="text-xs mt-1 line-clamp-2">{pipe.description}</p>
                <p className="text-xs text-gray-500 mt-1">
                  updated {formatUpdatedTime(pipe.lastUpdate)}
                </p>
              </Card>
            ))}
          </div>
          <div className="w-full pl-4 border-l overflow-y-auto">
            {renderPipeContent()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PipeDialog;
