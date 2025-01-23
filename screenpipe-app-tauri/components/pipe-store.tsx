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
  Loader2,
  BanknoteIcon,
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
import { useUser } from "@/lib/hooks/use-user";
import { PipeStoreMarkdown } from "@/components/pipe-store-markdown";
import { PublishDialog } from "./publish-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Progress } from "@/components/ui/progress";
import supabase from "@/lib/supabase/client";
import { CreditPurchaseDialog } from "./store/credit-purchase-dialog";
import localforage from "localforage";
import { useStatusDialog } from "@/lib/hooks/use-status-dialog";

export interface Pipe {
  enabled: boolean;
  id: string;
  source: string;
  fullDescription: string;
  config?: Record<string, any>;
  author?: string;
  port?: number;
}

interface CorePipe {
  id: string;
  name: string;
  description: string;
  url: string;
  credits: number;
  paid: boolean;
}

interface RunningPipe {
  id: string;
  port: number;
  isRunning: boolean;
}

const BROKEN_PIPES_KEY = "broken_pipes";
interface BrokenPipe {
  id: string;
  lastAttempt: number;
}

const fetchReadmeFromGithub = async (url: string): Promise<string> => {
  try {
    // Convert github.com URL to raw.githubusercontent.com
    const rawUrl = url
      .replace("github.com", "raw.githubusercontent.com")
      .replace("/tree/main", "/main");

    const response = await fetch(`${rawUrl}/README.md`);
    if (!response.ok) return "No description available.";
    const text = await response.text();
    return convertHtmlToMarkdown(text);
  } catch (error) {
    console.error("failed to fetch readme:", error);
    return "No description available.";
  }
};

const corePipes: (CorePipe & { fullDescription?: string })[] = [
  {
    id: "auto-pay",
    name: "auto pay",
    description:
      "automatically trigger bank transfers based on screen activity. monitors your screen for payment-related information and initiates transfers through the Mercury API",
    url: "https://github.com/different-ai/hypr-v0/tree/main/pipes/auto-pay",
    credits: 15,
    paid: true,
  },
  {
    id: "linkedin-ai-assistant",
    name: "linkedin ai assistant",
    description: "AI agent that automatically get new connections on linkedin",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/linkedin-ai-assistant",
    credits: 20,
    paid: true,
  },
  {
    id: "memories",
    name: "memories gallery",
    description:
      "google-photo like gallery of your screen recordings memories, with AI-powered insights and timeline visualization",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/memories",
    credits: 0,
    paid: false,
  },
  {
    id: "data-table",
    name: "data table",
    description:
      "explore your data in a powerful table view with filtering, sorting, and more",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/data-table",
    credits: 0,
    paid: false,
  },
  {
    id: "search",
    name: "search",
    description:
      "search through your screen recordings and audio transcripts with AI",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/search",
    credits: 0,
    paid: false,
  },
  {
    id: "rewind",
    name: "rewind",
    description:
      "rewind-like interface meet cursor-like AI chat interface",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/rewind",
    credits: 20,
    paid: true,
  },
  {
    id: "identify-speakers",
    name: "speaker identification",
    description:
      "automatically identify and label different speakers in your recordings using AI voice recognition",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/identify-speakers",
    credits: 0,
    paid: false,
  },
  {
    id: "obsidian",
    name: "obsidian v2",
    description:
      "write logs of your day in obsidian with local AI features, customization, and user friendly UI",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/obsidian",
    credits: 20,
    paid: true,
  },
  {
    id: "meeting",
    name: "meeting assistant",
    description:
      "organize and summarize your meetings with AI - get transcripts, action items, and key insights, 100% local or using cloud models",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/meeting",
    credits: 15,
    paid: true,
  },
  {
    id: "pipe-for-loom",
    name: "loom generator",
    description: "generate looms from your screenpipe data",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/pipe-for-loom",
    credits: 10,
    paid: true,
  },
  {
    id: "pipe-simple-nextjs",
    name: "keyword analytics",
    description: "show most used keywords",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/pipe-simple-nextjs",
    credits: 0,
    paid: false,
  },
  {
    id: "reddit-auto-posts",
    name: "reddit auto posts",
    description:
      "promote your content, grow your audience, or learn new things with this automated reddit post generator based on your screen recordings",
    url: "https://github.com/mediar-ai/screenpipe/tree/main/pipes/reddit-auto-posts",
    credits: 20,
    paid: true,
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

const getFriendlyName = (id: string, corePipes: CorePipe[]): string => {
  const corePipe = corePipes.find((cp) => cp.id === id);
  if (corePipe) return corePipe.name;

  // Convert pipe-name-format to Title Case if no match found
  return id
    .replace("pipe-", "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const normalizeId = (id: string): string => {
  // Remove 'pipe-' prefix if it exists and convert to lowercase
  return id.replace(/^pipe-/, "").toLowerCase();
};

const DEFAULT_PIPES = [
  "memories",
  "data-table",
  "search",
  "timeline",
  "identify-speakers",
];

const PipeStore: React.FC = () => {
  const [newRepoUrl, setNewRepoUrl] = useState("");
  const [selectedPipe, setSelectedPipe] = useState<Pipe | null>(null);
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInstalledOnly, setShowInstalledOnly] = useState(false);
  const { health } = useHealthCheck();
  const { getDataDir } = useSettings();
  const { user, refreshUser } = useUser();
  const [showCreditDialog, setShowCreditDialog] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [runningPipes, setRunningPipes] = useState<Record<string, boolean>>({});
  const [startupAttempts, setStartupAttempts] = useState<
    Record<string, number>
  >({});
  const [brokenPipes, setBrokenPipes] = useState<BrokenPipe[]>([]);
  const MAX_STARTUP_ATTEMPTS = 20; // Will give up after ~20 seconds (20 attempts * 2 second interval)
  const [coreReadmes, setCoreReadmes] = useState<Record<string, string>>({});
  const { open: openStatusDialog } = useStatusDialog();

  useEffect(() => {
    fetchInstalledPipes();
  }, [health?.status]);

  useEffect(() => {
    localforage.getItem<BrokenPipe[]>(BROKEN_PIPES_KEY).then((stored) => {
      if (stored) setBrokenPipes(stored);
    });
  }, []);

  useEffect(() => {
    const loadReadmes = async () => {
      const readmes: Record<string, string> = {};

      await Promise.all(
        corePipes.map(async (pipe) => {
          readmes[pipe.id] = await fetchReadmeFromGithub(pipe.url);
        })
      );

      setCoreReadmes(readmes);
    };

    loadReadmes();
  }, []); // Run once on component mount

  // Add this new effect to install default pipes
  useEffect(() => {
    const installDefaultPipes = async () => {
      if (!health || health?.status === "error") return;

      // Get currently installed pipes
      const response = await fetch("http://localhost:3030/pipes/list");
      const data = await response.json();
      const installedPipeIds = data.data.map((p: Pipe) => p.id);

      // Find which default pipes need to be installed
      const pipesToInstall = DEFAULT_PIPES.filter(
        (id) => !installedPipeIds.includes(id)
      );

      if (pipesToInstall.length === 0) return;

      // Create initial toast
      const t = toast({
        title: "installing core pipes",
        description: "setting up your workspace...",
        duration: 100000,
      });

      // Install each missing pipe
      for (const pipeId of pipesToInstall) {
        const pipe = corePipes.find((p) => p.id === pipeId);
        if (pipe?.url) {
          try {
            await handleDownloadPipe(pipe.url, pipe.id);
          } catch (error) {
            console.error(`Failed to install ${pipeId}:`, error);
          }
        }
      }

      t.update({
        id: t.id,
        title: "core pipes installed",
        description: "your workspace is ready!",
        duration: 2000,
      });

      await fetchInstalledPipes();
    };

    installDefaultPipes();
  }, [health?.status]);

  const handleResetAllPipes = async () => {
    try {
      toast({
        title: "resetting pipes",
        description: "this will delete all your pipes.",
      });
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
      const data = await response.json();

      if (!data.success) throw new Error("Failed to fetch installed pipes");

      const pipes = data.data;
      for (const pipe of pipes) {
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
      console.log("pipes", pipes);
      setPipes(pipes);
      return pipes;
    } catch (error) {
      console.error("Error fetching installed pipes:", error);
      toast({
        title: "error fetching installed pipes",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadPipe = async (url: string, id: string) => {
    try {
      posthog.capture("download_pipe", {
        pipe_id: url,
      });

      // Create initial toast with progress bar
      const t = toast({
        title: "downloading pipe",
        description: (
          <div className="space-y-2">
            <Progress value={0} className="h-1" />
            <p className="text-xs">starting download...</p>
          </div>
        ),
        duration: 100000, // long duration
      });

      let value = 0;

      // Update progress periodically
      const progressInterval = setInterval(() => {
        value += 3;
        t.update({
          id: t.id,
          title: "downloading pipe",
          description: (
            <div className="space-y-2">
              <Progress value={value} className="h-1" />
              <p className="text-xs">installing dependencies...</p>
            </div>
          ),
          duration: 100000,
        });
      }, 500);

      const response = await fetch("http://localhost:3030/pipes/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();

      clearInterval(progressInterval);

      if (!data.success) {
        throw new Error(data.error || "Failed to download pipe");
      }

      t.update({
        id: t.id,
        title: "pipe downloaded",
        description: (
          <div className="space-y-2">
            <Progress value={100} className="h-1" />
            <p className="text-xs">completed successfully</p>
          </div>
        ),
        duration: 2000,
      });

      // enable now
      await fetch("http://localhost:3030/pipes/enable", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: id }),
      });

      await fetchInstalledPipes();

      const freshPipe = pipes.find(
        (p) => normalizeId(p.id) === normalizeId(url)
      );
      if (freshPipe) {
        setSelectedPipe(freshPipe);
      }
      t.dismiss();
    } catch (error) {
      console.error("Failed to download pipe:", error);
      toast({
        title: "error downloading pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const checkExistingSubscription = async (pipeId: string) => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("pipe_id", pipeId)
        .eq("user_id", user?.id)
        .single();

      if (error) throw error;
      return !!data; // returns true if subscription exists
    } catch (error) {
      console.error("failed to check subscription:", error);
      return false;
    }
  };

  const handleToggleEnabled = async (pipe: Pipe) => {
    try {
      // Reset broken state when manually toggling
      await updateBrokenPipes(pipe.id, false);
      setStartupAttempts((prev) => {
        const next = { ...prev };
        delete next[pipe.id];
        return next;
      });

      // Set loading state when enabling
      if (!pipe.enabled) {
        setIsEnabling(true);
      }

      const corePipe = corePipes.find((cp) => cp.id === pipe.id);
      console.log("attempting to toggle pipe:", {
        pipeId: pipe.id,
        isEnabled: pipe.enabled,
        corePipe,
        userToken: !!user?.token,
        userCredits: user?.credits?.amount,
      });

      if (corePipe?.paid && !pipe.enabled) {
        console.log("handling paid pipe enable flow");

        if (!user?.token) {
          console.log("user not authenticated, opening auth window");
          toast({
            title: "authentication required",
            description: "please sign in in settings to use paid pipes",
            variant: "destructive",
          });
          return;
        }

        const hasSubscription = await checkExistingSubscription(pipe.id);

        console.log("subscription check:", {
          hasSubscription,
          pipeId: pipe.id,
        });

        if (!hasSubscription) {
          const userCredits = user.credits?.amount || 0;
          console.log("checking credits:", {
            userCredits,
            requiredCredits: corePipe.credits,
            sufficient: userCredits >= corePipe.credits,
          });

          if (userCredits < corePipe.credits) {
            console.log("insufficient credits, showing dialog");
            setShowCreditDialog(true);
            return;
          }

          console.log("attempting pipe purchase");
          const purchaseSuccess = await handlePipePurchase(
            pipe,
            corePipe.credits
          );
          console.log("purchase result:", { purchaseSuccess });

          if (!purchaseSuccess) {
            toast({
              title: "purchase failed",
              description: "something went wrong, please try again",
              variant: "destructive",
            });
            return;
          }

          await refreshUser();
          console.log("user refreshed after purchase:", {
            newCredits: user?.credits?.amount,
          });
        }
      }

      posthog.capture("toggle_pipe", {
        pipe_id: pipe.id,
        enabled: !pipe.enabled,
      });

      const t = toast({
        title: "loading pipe",
        description: "please wait...",
        action: (
          <div className="flex items-center">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ),
        duration: 4000,
      });

      const endpoint = pipe.enabled ? "disable" : "enable";
      console.log(`calling ${endpoint} endpoint for pipe`);

      const response = await fetch(`http://localhost:3030/pipes/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: pipe.id }),
      });

      const data = await response.json();
      console.log("toggle response:", data);

      if (!data.success) {
        throw new Error(data.error);
      }

      // Wait for pipe to initialize
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const freshPipes = await fetchInstalledPipes();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const freshPipe = freshPipes.find((p: Pipe) => p.id === pipe.id);
      if (freshPipe) {
        setSelectedPipe(freshPipe);
      }

      toast({
        title: `pipe ${endpoint}d`,
      });
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
      // Reset loading state
      setIsEnabling(false);
    }
  };

  const reloadPipeConfig = async (pipe: Pipe) => {
    await fetchInstalledPipes();

    const freshPipe = pipes.find(
      (p) => normalizeId(p.id) === normalizeId(pipe.id)
    );
    if (freshPipe) {
      console.log("freshPipe", freshPipe);

      setSelectedPipe(freshPipe);
    }
  };

  const handleAddOwnPipe = async () => {
    if (newRepoUrl) {
      try {
        posthog.capture("add_own_pipe", {
          newRepoUrl,
        });

        // Create initial toast with progress bar
        const t = toast({
          title: "adding custom pipe",
          description: (
            <div className="space-y-2">
              <Progress value={0} className="h-1" />
              <p className="text-xs">starting installation...</p>
            </div>
          ),
          duration: 100000, // long duration
        });

        let value = 0;

        // Update progress periodically
        const progressInterval = setInterval(() => {
          value += 3;
          t.update({
            id: t.id,
            title: "adding custom pipe",
            description: (
              <div className="space-y-2">
                <Progress value={value} className="h-1" />
                <p className="text-xs">installing dependencies...</p>
              </div>
            ),
            duration: 100000,
          });
        }, 500);

        const response = await fetch("http://localhost:3030/pipes/download", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: newRepoUrl }),
        });

        const data = await response.json();

        clearInterval(progressInterval);

        if (!data.success) {
          throw new Error(data.error || "Failed to download pipe");
        }

        t.update({
          id: t.id,
          title: "pipe added",
          description: (
            <div className="space-y-2">
              <Progress value={100} className="h-1" />
              <p className="text-xs">completed successfully</p>
            </div>
          ),
          duration: 2000,
        });

        await fetchInstalledPipes();
        setNewRepoUrl("");
        t.dismiss();
      } catch (error) {
        console.error("failed to add custom pipe:", error);
        toast({
          title: "error adding custom pipe",
          description: "please check the url and try again.",
          variant: "destructive",
        });
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
        setIsEnabling(true);
        const response = await fetch("http://localhost:3030/pipes/update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pipe_id: selectedPipe.id,
            config: config,
          }),
        });

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || "Failed to update pipe configuration");
        }

        toast({
          title: "Configuration saved",
          description: "The pipe configuration has been updated.",
        });

        await setSelectedPipe({ ...selectedPipe, config: config });
        setIsEnabling(false);
      } catch (error) {
        console.error("Failed to save config:", error);
        toast({
          title: "error saving configuration",
          description:
            "please try again or check the logs for more information.",
          variant: "destructive",
        });
        setIsEnabling(false);
      }
    }
  };
  const handleDeletePipe = async (pipe: Pipe) => {
    try {
      await updateBrokenPipes(pipe.id, false);
      posthog.capture("delete_pipe", {
        pipe_id: pipe.id,
      });
      toast({
        title: "deleting pipe",
        description: "please wait...",
      });
      setSelectedPipe(null);

      const response = await fetch("http://localhost:3030/pipes/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: pipe.id }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }

      // First unselect the pipe, then fetch the updated list
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
      .filter(
        (cp) => !pipes.some((p) => normalizeId(p.id) === normalizeId(cp.id))
      )
      .map((cp) => ({
        id: cp.id,
        fullDescription: coreReadmes[cp.id] || cp.description, // Fallback to short description
        source: cp.url,
        enabled: false,
      })),
  ];

  const filteredPipes = allPipes
    .filter(
      (pipe) =>
        pipe.id.toLowerCase().includes(searchQuery.toLowerCase()) &&
        (!showInstalledOnly || pipe.enabled)
    )
    .sort((a, b) => {
      const aPaid = corePipes.find((cp) => cp.id === a.id)?.paid ? 1 : 0;
      const bPaid = corePipes.find((cp) => cp.id === b.id)?.paid ? 1 : 0;
      return bPaid - aPaid; // Sort paid pipes first
    });

  const handleCloseDetails = async () => {
    setSelectedPipe(null);
    window.location.reload(); // dirty hack
  };

  const handleUpdatePipe = async (pipe: Pipe) => {
    try {
      posthog.capture("update_pipe", {
        pipe_id: pipe.id,
      });

      // Create initial toast with progress bar
      const t = toast({
        title: "updating pipe",
        description: (
          <div className="space-y-2">
            <Progress value={0} className="h-1" />
            <p className="text-xs">deleting old version...</p>
          </div>
        ),
        duration: 100000,
      });

      // First delete the pipe
      await handleDeletePipe(pipe);

      // Then download the new version
      if (pipe.source) {
        t.update({
          id: t.id,
          title: "updating pipe",
          description: (
            <div className="space-y-2">
              <Progress value={50} className="h-1" />
              <p className="text-xs">downloading new version...</p>
            </div>
          ),
          duration: 100000,
        });

        await handleDownloadPipe(pipe.source, pipe.id);
      }

      t.update({
        id: t.id,
        title: "pipe updated",
        description: (
          <div className="space-y-2">
            <Progress value={100} className="h-1" />
            <p className="text-xs">completed successfully</p>
          </div>
        ),
        duration: 2000,
      });

      // Refresh the pipe list
      await fetchInstalledPipes();

      t.dismiss();
    } catch (error) {
      console.error("failed to update pipe:", error);
      toast({
        title: "error updating pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };

  const checkPipeRunning = async (port: number): Promise<boolean> => {
    try {
      // Use Tauri's http client instead of fetch to avoid CORS
      const response = await fetch(`http://localhost:${port}`, {
        mode: "no-cors", // Add no-cors mode to avoid CORS errors
      });
      return true; // If we get here, the port is responding
    } catch {
      return false;
    }
  };

  const checkRunningPipes = async () => {
    const runningStates: Record<string, boolean> = {};

    // First check all pipes
    for (const pipe of pipes) {
      if (pipe.enabled && pipe.config?.port) {
        runningStates[pipe.id] = await checkPipeRunning(pipe.config.port);
      }
    }

    // Then update states based on results
    setRunningPipes((prevRunning) => {
      setStartupAttempts((prevAttempts) => {
        const updatedAttempts = { ...prevAttempts };

        for (const pipe of pipes) {
          if (pipe.enabled && pipe.config?.port) {
            const isRunning = runningStates[pipe.id];

            if (!isRunning) {
              updatedAttempts[pipe.id] = (prevAttempts[pipe.id] || 0) + 1;
              console.log(
                `Attempt ${updatedAttempts[pipe.id]} for pipe ${pipe.id}`
              );

              if (updatedAttempts[pipe.id] >= MAX_STARTUP_ATTEMPTS) {
                handleDisablePipe(pipe.id);
                delete updatedAttempts[pipe.id];
                updateBrokenPipes(pipe.id, true);
              }
            } else {
              delete updatedAttempts[pipe.id];
              updateBrokenPipes(pipe.id, false);
            }
          }
        }
        return updatedAttempts;
      });
      return runningStates;
    });
  };

  // Separate function to handle pipe disabling
  const handleDisablePipe = async (pipeId: string) => {
    try {
      await fetch(`http://localhost:3030/pipes/disable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: pipeId }),
      });

      toast({
        title: "pipe startup failed",
        description:
          "the pipe has been disabled. please check the logs for more information.",
        variant: "destructive",
      });

      // unselect the pipe
      setSelectedPipe(null);

      await fetchInstalledPipes();
    } catch (error) {
      console.error("failed to disable pipe:", error);
    }
  };

  // Add this effect to periodically check running pipes
  useEffect(() => {
    checkRunningPipes();
  }, [pipes]);

  const updateBrokenPipes = async (pipeId: string, isBroken: boolean) => {
    const updated = isBroken
      ? [...brokenPipes, { id: pipeId, lastAttempt: Date.now() }]
      : brokenPipes.filter((p) => p.id !== pipeId);

    setBrokenPipes(updated);
    await localforage.setItem(BROKEN_PIPES_KEY, updated);
  };

  const renderPipeDetails = () => {
    if (!selectedPipe) return null;

    const isPipeRunning = runningPipes[selectedPipe.id];

    return (
      <div className="fixed inset-0 bg-background transform transition-transform duration-200 ease-in-out flex flex-col">
        <CreditPurchaseDialog
          open={showCreditDialog}
          onOpenChange={setShowCreditDialog}
          requiredCredits={
            selectedPipe !== null
              ? corePipes.find((cp) => cp.id === selectedPipe.id)?.credits || 0
              : 0
          }
          currentCredits={user?.credits?.amount || 0}
          onCreditsUpdated={refreshUser}
        />
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
            <h2 className="text-lg font-medium">
              {getFriendlyName(selectedPipe.id, corePipes)}
            </h2>
            <Badge variant="outline" className="font-mono text-xs">
              by {getAuthorFromSource(selectedPipe.source)}
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
                            onClick={() => handleToggleEnabled(selectedPipe)}
                            variant={
                              selectedPipe.enabled ? "default" : "outline"
                            }
                            disabled={health?.status === "error"}
                            size="icon"
                            className="h-8 w-8"
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {selectedPipe.enabled ? "disable" : "enable"} pipe
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <LogFileButton className="text-xs" />

                    {selectedPipe.source?.startsWith("http") && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => handleUpdatePipe(selectedPipe)}
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
                    )}

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

                    {!selectedPipe.source?.startsWith("https://") && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() =>
                                handleRefreshFromDisk(selectedPipe)
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
                    )}
                    <div className="flex items-center gap-2">
                      {/* Only show delete button for non-core pipes */}
                      {/* {!corePipes.some((cp) => cp.id === selectedPipe.id) && ( */}
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
                      {/* )} */}
                    </div>
                  </div>

                  {corePipes.find((cp) => cp.id === selectedPipe.id)?.paid && (
                    <div className="text-xs text-muted-foreground mt-2">
                      requires{" "}
                      {
                        corePipes.find((cp) => cp.id === selectedPipe.id)
                          ?.credits
                      }{" "}
                      credits{" "}
                      {user?.credits ? `(you have ${user.credits.amount})` : ""}
                    </div>
                  )}
                </div>
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
            <div className="max-w-3xl mx-auto p-8 ">
              {selectedPipe.enabled && selectedPipe?.config?.port && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          openUrl(
                            `http://localhost:${selectedPipe.config!.port}`
                          )
                        }
                        disabled={!isPipeRunning || isEnabling}
                      >
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                        {isEnabling
                          ? "initializing..."
                          : isPipeRunning
                          ? "open in browser"
                          : brokenPipes.some((p) => p.id === selectedPipe.id)
                          ? "pipe is broken"
                          : "initializing..."}
                      </Button>
                      <Button
                        variant="default"
                        onClick={async () => {
                          try {
                            await invoke("open_pipe_window", {
                              port: selectedPipe.config!.port,
                              title: selectedPipe.id,
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
                        disabled={!isPipeRunning || isEnabling}
                      >
                        <Puzzle className="mr-2 h-3.5 w-3.5" />
                        {isEnabling
                          ? "initializing..."
                          : isPipeRunning
                          ? "open as app"
                          : brokenPipes.some((p) => p.id === selectedPipe.id)
                          ? "pipe is broken"
                          : "initializing..."}
                      </Button>
                    </div>
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
    // Rest of the existing logic
    const isInstalled = pipes.some((p) => p.id === pipe.id);
    if (!isInstalled && pipe.source) {
      try {
        await handleDownloadPipe(pipe.source, pipe.id);
        // Fetch the updated pipe data and wait for it
        const response = await fetch("http://localhost:3030/pipes/list");
        const data = await response.json();

        if (!data.success) throw new Error("Failed to fetch installed pipes");

        // Get the data dir and fetch README for the new pipe
        const dataDir = await getDataDir();
        const updatedPipe = data.data.find((p: Pipe) => p.id === pipe.id);

        if (updatedPipe) {
          const pathToReadme = await join(
            dataDir,
            "pipes",
            pipe.id,
            "README.md"
          );
          try {
            const readme = await readFile(pathToReadme);
            updatedPipe.fullDescription = convertHtmlToMarkdown(
              new TextDecoder().decode(readme)
            );
          } catch (error) {
            updatedPipe.fullDescription =
              "no description available for this pipe.";
          }
          // Update pipes state and set selected pipe
          setPipes(data.data);
          setSelectedPipe(updatedPipe);
        }
      } catch (error) {
        console.error("Failed to download and show pipe:", error);
        toast({
          title: "error showing pipe details",
          description:
            "please try again or check the logs for more information.",
          variant: "destructive",
        });
      }
    } else {
      const installedPipe = pipes.find((p) => p.id === pipe.id);
      setSelectedPipe(installedPipe || pipe);
    }
  };

  const handlePipePurchase = async (pipe: Pipe, requiredCredits: number) => {
    try {
      const { data, error } = await supabase.rpc("purchase_pipe", {
        v_user_id: user?.id,
        p_pipe_id: pipe.id,
        p_credits_spent: requiredCredits,
      });

      if (error) {
        console.error("purchase error:", error);
        toast({
          title: "purchase failed",
          description: error.message,
          variant: "destructive",
        });
        return false;
      }

      if (!data) {
        toast({
          title: "purchase failed",
          description: "unknown error occurred",
          variant: "destructive",
        });
        return false;
      }

      // Update local user credits state
      if (user?.credits) {
        user.credits.amount -= requiredCredits;
      }

      toast({
        title: "pipe purchased",
        description: `${requiredCredits} credits deducted`,
      });

      return true;
    } catch (error) {
      console.error("purchase failed:", error);
      toast({
        title: "purchase failed",
        description: "please try again or contact support",
        variant: "destructive",
      });
      return false;
    }
  };

  // Add this empty state render function
  const renderEmptyState = () => {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4 space-y-4">
        <div className="text-center space-y-4">
          <h3 className="text-lg font-medium">screenpipe is not recording</h3>
          <p className="text-sm text-muted-foreground">
            please start the screenpipe service to browse and manage pipes
          </p>
          <Button
            variant="outline"
            onClick={openStatusDialog}
            className="gap-2"
          >
            <Power className="h-4 w-4" />
            check service status
          </Button>
        </div>
      </div>
    );
  };

  // Add this check at the start of the component render
  if (health?.status === "error") {
    return renderEmptyState();
  }

  if (selectedPipe) {
    return renderPipeDetails();
  }

  return (
    <div className="overflow-hidden flex flex-col space-y-4 min-w-[800px]">
      <div className="flex flex-col flex-1 overflow-hidden space-y-4 p-4 min-w-[800px]">
        <div className="space-y-4 min-w-[800px]">
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
        </div>

        <div className="flex-1 overflow-y-auto ">
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
                        <h3 className="font-medium truncate">
                          {getFriendlyName(pipe.id, corePipes)}
                        </h3>
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
                        {pipes.some((p) => p.id === pipe.id) ? (
                          <>
                            {pipes.find((p) => p.id === pipe.id)?.config
                              ?.port &&
                            pipes.find((p) => p.id === pipe.id)?.enabled ? (
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const installedPipe = pipes.find(
                                    (p) => p.id === pipe.id
                                  );
                                  if (installedPipe?.config?.port) {
                                    invoke("open_pipe_window", {
                                      port: installedPipe.config.port,
                                      title: installedPipe.id,
                                    }).catch((err) => {
                                      console.error(
                                        "failed to open pipe window:",
                                        err
                                      );
                                      toast({
                                        title: "error opening pipe window",
                                        description:
                                          "please try again or check the logs",
                                        variant: "destructive",
                                      });
                                    });
                                  }
                                }}
                                disabled={!runningPipes[pipe.id]}
                                className="hover:bg-muted"
                              >
                                <Puzzle className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadPipe(pipe.source, pipe.id);
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
                    {corePipes.find((cp) => cp.id === pipe.id)?.paid && (
                      <div className="text-xs text-muted-foreground mt-2">
                        requires{" "}
                        {corePipes.find((cp) => cp.id === pipe.id)?.credits}{" "}
                        credits{" "}
                        {user?.credits
                          ? `(you have ${user.credits.amount})`
                          : ""}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border rounded-lg p-4 space-y-3 w-[50%] mx-auto">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">add your own pipe</h3>
                <PublishDialog app={selectedPipe} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    type="url"
                    placeholder={
                      health?.status === "error"
                        ? "screenpipe not running..."
                        : "enter github url or local path"
                    }
                    value={newRepoUrl}
                    onChange={(e) => setNewRepoUrl(e.target.value)}
                    autoCorrect="off"
                    autoComplete="off"
                    disabled={health?.status === "error"}
                  />
                </div>
                <Button
                  onClick={handleAddOwnPipe}
                  disabled={!newRepoUrl || health?.status === "error"}
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
                  disabled={health?.status === "error"}
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
