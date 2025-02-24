import React, {
  useCallback,
  useEffect,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Download,
  Puzzle,
  UserIcon,
  Loader2,
  Power,
  ArrowUpCircle,
  AlertCircle,
} from "lucide-react";
import { PipeStoreMarkdown } from "@/components/pipe-store-markdown";
import { BuildStatus, PipeWithStatus } from "./types";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";
import posthog from "posthog-js";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PipeCardProps {
  pipe: PipeWithStatus;
  onInstall: (pipe: PipeWithStatus, onComplete: () => void) => Promise<any>;
  onPurchase: (pipe: PipeWithStatus, onComplete: () => void) => Promise<any>;
  onClick: (pipe: PipeWithStatus) => void;
  isLoadingPurchase?: boolean;
  isLoadingInstall?: boolean;
  onToggle: (pipe: PipeWithStatus, onComplete: () => void) => Promise<any>;
  setPipe: (pipe: PipeWithStatus) => void;
}

export function getBuildStatus(status: BuildStatus | undefined): string {
  return typeof status === "object" ? status.status : status || "";
}

function getBuildStepMessage(buildStatus: BuildStatus | undefined): string {
  if (typeof buildStatus !== "object") return "building...";

  const { step, status } = buildStatus;
  if (status === "not_started") {
    return "waiting to start...";
  }

  switch (step) {
    case "downloading":
      return "downloading files...";
    case "extracting":
      return "extracting files...";
    case "installing":
      return "installing dependencies...";
    case "completed":
      return "completed installation";
    case "building":
      return "building application...";
    default:
      return step || "processing...";
  }
}

export const PipeCard: React.FC<PipeCardProps> = ({
  pipe,
  onInstall,
  onClick,
  onPurchase,
  setPipe,
  isLoadingPurchase,
  isLoadingInstall,
  onToggle,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const { settings } = useSettings();

  const handleOpenWindow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (pipe.installed_config?.port) {
        await invoke("open_pipe_window", {
          port: pipe.installed_config.port,
          title: pipe.name,
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

  useEffect(() => {
    const pollBuildStatus = async () => {
      const id = pipe.is_local ? pipe.id : pipe.name;
      try {
        const response = await fetch(
          `http://localhost:3030/pipes/build-status/${id}`,
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(data, pipe.installed_config?.buildStatus);
        if (
          data.buildStatus.length > 0 &&
          JSON.stringify(data.buildStatus) !==
            JSON.stringify(pipe.installed_config?.buildStatus)
        ) {
          setPipe({
            ...pipe,
            installed_config: {
              ...pipe.installed_config,
              is_nextjs: pipe.installed_config?.is_nextjs ?? false,
              source: pipe.installed_config?.source ?? "",
              buildStatus: data.buildStatus as BuildStatus,
            },
          });
        }
      } catch (error) {
        console.error("Error polling build status:", error);
        setPipe({
          ...pipe,
          installed_config: {
            ...pipe.installed_config,
            is_nextjs: pipe.installed_config?.is_nextjs ?? false,
            source: pipe.installed_config?.source ?? "",
            buildStatus: {
              status: "error",
              step: "failed",
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown error occurred",
            } as BuildStatus,
          },
        });
      }
    };

    let buildStatusInterval: NodeJS.Timeout | null = null;
    const buildStatus = pipe.installed_config?.buildStatus;
    const isInProgress =
      buildStatus === "in_progress" ||
      (typeof buildStatus === "object" && buildStatus.status === "in_progress");

    if (isInProgress) {
      buildStatusInterval = setInterval(pollBuildStatus, 3000);
    }

    return () => {
      if (buildStatusInterval) {
        clearInterval(buildStatusInterval);
      }
    };
  }, [pipe.installed_config?.buildStatus]);

  const renderInstallationStatus = useCallback(() => {
    const buildStatus = pipe.installed_config?.buildStatus;
    const status = getBuildStatus(buildStatus);

    if (status === "not_started" || status === "in_progress") {
      return (
        <Button
          size="sm"
          variant="outline"
          disabled
          className="hover:bg-muted font-medium relative hover:!bg-muted no-card-hover"
        >
          <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
          <div className="flex flex-col items-start">
            <span>{getBuildStepMessage(buildStatus)}</span>
          </div>
        </Button>
      );
    }

    if (status === "error") {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLoading(true);
                  onToggle(pipe, () => setIsLoading(false));
                }}
                className="font-medium no-card-hover"
                disabled={isLoading}
              >
                <AlertCircle className="h-3.5 w-3.5 mr-2" />
                retry
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {typeof buildStatus === "object" && buildStatus.error
                ? buildStatus.error
                : "Installation failed"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (!pipe.is_enabled && buildStatus === "success") {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            setIsLoading(true);
            onToggle(pipe, () => setIsLoading(false));
          }}
          className="hover:bg-muted font-medium relative hover:!bg-muted no-card-hover"
          disabled={isLoading}
        >
          <Power className="h-3.5 w-3.5 mr-2" />
          enable
        </Button>
      );
    }

    return (
      <Button
        size="sm"
        variant="outline"
        onClick={handleOpenWindow}
        className="hover:bg-muted font-medium relative no-card-hover"
      >
        <Puzzle className="h-3.5 w-3.5 mr-2" />
        open
      </Button>
    );
  }, [pipe.installed_config?.buildStatus]);

  return (
    <motion.div
      className="group border rounded-xl p-5 hover:bg-muted/40 has-[.no-card-hover:hover]:hover:bg-transparent transition-all duration-200 cursor-pointer backdrop-blur-sm"
      onClick={() => onClick(pipe)}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{
        boxShadow: "0 0 10px rgba(255,255,255,0.1)",
        transition: { duration: 0.2 },
      }}
    >
      <div className="flex flex-col h-full justify-between space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg tracking-tight">
                {pipe.name}
              </h3>
              <div className="text-sm text-muted-foreground">
                <PipeStoreMarkdown
                  content={pipe.description?.substring(0, 90) || "" + "..."}
                  variant="compact"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 isolate">
            {pipe.is_installed ? (
              renderInstallationStatus()
            ) : (
              <Button
                size="sm"
                variant={pipe.is_paid ? "default" : "outline"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (pipe.is_paid && !pipe.has_purchased) {
                    setIsLoading(true);
                    onPurchase(pipe, () => setIsLoading(false));
                    posthog.capture("pipe_purchase", {
                      pipe_id: pipe.id,
                      email: settings.user?.email,
                    });
                  } else {
                    setIsLoading(true);
                    onInstall(pipe, () => setIsLoading(false));
                    posthog.capture("pipe_install", {
                      pipe_id: pipe.id,
                      email: settings.user?.email,
                    });
                  }
                }}
                className="font-medium no-card-hover"
                disabled={isLoadingPurchase}
              >
                {isLoadingPurchase ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
            {pipe.source_code && (
              <motion.a
                href={pipe.source_code}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted hover:bg-accent hover:text-accent-foreground transition-all duration-200 no-card-hover relative overflow-hidden"
                whileHover={{
                  scale: 1.05,
                  transition: {
                    type: "spring",
                    stiffness: 400,
                    damping: 10,
                  },
                }}
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  initial={{ x: "-100%" }}
                  whileHover={{
                    x: "100%",
                    transition: {
                      duration: 0.6,
                      ease: "easeInOut",
                    },
                  }}
                />
                <Download className="h-3 w-3" />
                <span className="relative z-10 font-mono">source</span>
              </motion.a>
            )}
            {pipe.is_local && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted font-mono text-xs">
                local
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 font-mono text-xs">
              {pipe.installed_config?.version && "v"}
              {pipe.installed_config?.version}
            </span>
            {pipe.has_update && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 font-mono text-xs animate-pulse">
                <ArrowUpCircle className="h-3 w-3" />
                update
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
