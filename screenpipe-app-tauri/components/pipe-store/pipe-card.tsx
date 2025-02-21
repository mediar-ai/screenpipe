import { PipeStoreMarkdown } from "@/components/pipe-store-markdown";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { PipeApi, PipeDownloadError } from "@/lib/api/store";
import { useSettings } from "@/lib/hooks/use-settings";
import { invoke } from "@tauri-apps/api/core";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { motion } from "framer-motion";

import {
  ArrowUpCircle,
  Download,
  Loader2,
  Power,
  Puzzle,
  UserIcon,
} from "lucide-react";
import posthog from "posthog-js";
import React, { useEffect, useState } from "react";
import { useLoginCheck } from "../login-dialog";
import { BuildStatus, PipeState, PipeWithStatus } from "./types";

interface PipeCardProps {
  pipeProp: PipeWithStatus;
  onClick: (pipe: PipeWithStatus) => void;
}


const PipeCardComponent: React.FC<PipeCardProps> = ({
  pipeProp,
  onClick,
}) => {
  const { showLoginDialog, setShowLoginDialog, checkLogin } = useLoginCheck();
  const [state, setState] = useState<PipeState>(pipeProp.state)
  const [pipe, setPipe] = useState<PipeWithStatus>(pipeProp)
  const { settings } = useSettings();
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

  const handleInstallPipe = async (
    pipe: PipeWithStatus,
  ) => {
    try {
      if (!checkLogin(settings.user)) return;
      setState("installing")
      const pipeApi = await PipeApi.create(settings.user!.token!);
      const response = await pipeApi.downloadPipe(pipe.id);
      const downloadResponse = await fetch(
        "http://localhost:3030/pipes/download-private",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pipe_name: pipe.name,
            pipe_id: pipe.id,
            url: response.download_url,
          }),
        },
      );

      const data = await downloadResponse.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to download pipe");
      }

      setState("installed")

    } catch (error) {

      if ((error as Error).cause === PipeDownloadError.PURCHASE_REQUIRED) {

        return toast({
          title: "paid pipe",
          description:
            "this pipe requires purchase. please visit screenpi.pe to buy credits.",
          variant: "destructive",
        });
      }
      toast({
        title: "error installing pipe",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const handlePurchasePipe = async (
    pipe: PipeWithStatus,
  ) => {
    try {
      if (!checkLogin(settings.user)) return;
      setState("purchasing")
      const pipeApi = await PipeApi.create(settings.user!.token!);
      const response = await pipeApi.purchasePipe(pipe.id);
      if (response.data.payment_successful) {
        setState("purchased")
        await handleInstallPipe(pipe);
        toast({
          title: "purchase & install successful",
          description: "payment processed with saved card",
        });
      } else if (response.data.already_purchased) {
        setState("purchased")
        await handleInstallPipe(pipe);
        toast({
          title: "pipe already purchased",
          description: "installing pipe...",
        });
      } else if (response.data.used_credits) {
        setState("purchased")
        await handleInstallPipe(pipe);
      } else if (response.data.checkout_url) {
        setState("purchasing")
        openUrl(response.data.checkout_url);
      }
    } catch (error) {
      console.error("error purchasing pipe:", error);
      toast({
        title: "failed to purchase pipe",
        description: "please try again or check the logs for more information",
        variant: "destructive",
      })
    }
  };


  const handleTogglePipe = async (
    pipe: PipeWithStatus,
  ) => {
    try {
      setState("loading")
      const endpoint = pipe.installed_config?.enabled ? "disable" : "enable";
      console.log("toggel", pipe, endpoint);

      const id = pipe.is_local ? pipe.id : pipe.name;
      const response = await fetch(`http://localhost:3030/pipes/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pipe_id: id }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }
      setState(endpoint === "enable" ? "enabled" : "disabled")
      const pipeInfoResponse = await fetch(`http://localhost:3030/pipes/info/${id}`);

      if (!pipeInfoResponse.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const pipeInfoData = await pipeInfoResponse.json();
      const port = pipeInfoData.data.config.port;

      setPipe({
        ...pipe,
        installed_config: {
          ...data.data.installed_config,
        },
      });


    } catch (error) {
      console.error(
        `Failed to ${pipe.installed_config?.enabled ? "disable" : "enable"
        } pipe:`,
        error,
      );
      toast({
        title: "error toggling pipe",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    }
  };


  useEffect(() => {
    const pollBuildStatus = async () => {
      const id = pipe.is_local ? pipe.id : pipe.name;
      try {
        const response = await fetch(`http://localhost:3030/pipes/info/${id}`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (
          data.success &&
          data.data.config.buildStatus !== pipe.installed_config?.buildStatus
        ) {
          setState(data.data.config.buildStatus === "in_progress" ? "building" : "build_done")
          // Update pipe with new build status
          setPipe({
            ...pipe,
            installed_config: {
              ...pipe.installed_config,
              is_nextjs: pipe.installed_config?.is_nextjs ?? false,
              source: pipe.installed_config?.source ?? "",
              buildStatus: data.data.config.buildStatus as BuildStatus,
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
            buildStatus: "error",
          },
        });
      }
    };

    let buildStatusInterval: NodeJS.Timeout | null = null;
    if (pipe.installed_config?.buildStatus === "in_progress") {
      buildStatusInterval = setInterval(pollBuildStatus, 3000);
    } else {
      if (!buildStatusInterval) return;
      clearInterval(buildStatusInterval);
    }

    console.log("buildStatus", pipe.installed_config?.buildStatus);

    return () => {
      if (!buildStatusInterval) return;
      clearInterval(buildStatusInterval);
    };
  }, [pipe.installed_config?.buildStatus]);

  return (
    <div
      className="group border rounded-xl p-5 hover:bg-muted/40 has-[.no-card-hover:hover]:hover:bg-transparent transition-all duration-200 cursor-pointer backdrop-blur-sm"
      onClick={() => onClick(pipe)}
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
              <>
                {state === "building" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    className="hover:bg-muted font-medium relative hover:!bg-muted no-card-hover"
                  >
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    building...
                  </Button>
                ) : state === "build_error" ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePipe(pipe);
                    }}
                    className="font-medium no-card-hover"
                    disabled={state === "build_error"}
                  >
                    <ArrowUpCircle className="h-3.5 w-3.5 mr-2" />
                    retry build
                  </Button>
                ) : state === "disabled" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePipe(pipe);
                    }}
                    className="hover:bg-muted font-medium relative hover:!bg-muted no-card-hover"
                    disabled={state !== "disabled" && state === "loading"}
                  >
                    <Power className="h-3.5 w-3.5 mr-2" />
                    enable
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenWindow}
                    className="hover:bg-muted font-medium relative no-card-hover"
                    disabled={
                      pipe.installed_config?.buildStatus &&
                      pipe.installed_config?.buildStatus === "not_started"
                    }
                  >
                    {pipe.installed_config?.buildStatus === "not_started" ? (
                      <>wait for app to start building</>
                    ) : (
                      <>
                        <Puzzle className="h-3.5 w-3.5 mr-2" />
                        open
                      </>
                    )}
                  </Button>
                )}
              </>
            ) : (
              <Button
                size="sm"
                variant={pipe.is_paid ? "default" : "outline"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (pipe.is_paid && !pipe.has_purchased) {
                    handlePurchasePipe(pipe);
                    posthog.capture("pipe_purchase", {
                      pipe_id: pipe.id,
                      email: settings.user?.email,
                    });
                  } else {
                    handleInstallPipe(pipe);
                    posthog.capture("pipe_install", {
                      pipe_id: pipe.id,
                      email: settings.user?.email,
                    });
                  }
                }}
                className="font-medium no-card-hover"
                disabled={state === "purchasing" || state === "enabling"}
              >
                {state == "purchasing" ? (
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
        {state === "enabling" || state === "loading" || state === "installing" ? (
          <div className="w-full bg-black/10 rounded-full h-1.5 overflow-hidden relative">
            <motion.div
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              initial={{ left: "-25%" }}
              animate={{ left: "100%" }}
              className="absolute top-0 bg-gradient-to-r from-black/30 via-black to-black/30 h-1.5 rounded-full"
              style={{ width: "25%" }}
            />
          </div>
        ) : <div className="w-full   h-1.5" />
        }
      </div>
    </div>
  );
};


export const PipeCard = React.memo<PipeCardProps>(PipeCardComponent)