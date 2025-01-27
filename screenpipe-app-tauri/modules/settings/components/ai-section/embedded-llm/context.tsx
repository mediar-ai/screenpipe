import React, { createContext, ReactElement, useContext, useEffect, useMemo, useState } from "react";
import posthog from "posthog-js";
import { useSettings } from "@/lib/hooks/use-settings";
import { SidecarState } from "@/modules/ai-providers/providers/embedded/provider-metadata";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";
import { ModelState } from '../../../../ai-providers/providers/embedded/provider-metadata';

const LLMContext = createContext<{
  handleSidecarAction: () => Promise<void>,
  handleModelAction: () => Promise<void>,
  isPending: boolean,
  sidecarStatus: SidecarState,
  modelStatus: ModelState
} | null >(null);

export function LLMProvider({ 
  children,
  isActiveProvider
} : { 
  children: ReactElement,
  isActiveProvider: boolean
}) {
  const [ sidecarStatus, setSidecarStatus ] = useState<SidecarState>(SidecarState.UNKNOWN)
  const [ modelStatus, setModelStatus ] = useState<ModelState>(ModelState.UNKNOWN)

  const { settings } = useSettings();

  const { mutateAsync: startSidecar, isPending: startIsPending } = useMutation({
    mutationFn: async () => {
      posthog.capture("start_ollama_sidecar");
      toast({
        title: "starting sidecar",
        description: `using port ${settings.embeddedLLM.port}`
      });

      await invoke("start_ollama_sidecar", {
        settings: {
          enabled: settings.embeddedLLM.enabled,
          model: settings.embeddedLLM.model,
          port: settings.embeddedLLM.port,
        },
      });

      await invoke("check_ollama_sidecar", {
        settings: {
          enabled: settings.embeddedLLM.enabled,
          model: settings.embeddedLLM.model,
          port: settings.embeddedLLM.port,
        },
      });
    },
    onSuccess: () => {
      setSidecarStatus(SidecarState.ACTIVE)
      toast({
        title: "sidecar initiated",
      });
    },
    onError: (e) => {
      setSidecarStatus(SidecarState.ERROR)
      console.error("Error starting ai sidecar:", e);
      toast({
        title: "error initiating sidecar",
        description: "check the console for more details",
        variant: "destructive",
      });
    },
  });

  const { mutate: checkSidecarStatus, isPending: checkIsPending } = useMutation({
    mutationFn: async () => {
      posthog.capture("check_ollama_sidecar");
      toast({
        title: "checking embedded ai server",
      });

      const result = await invoke("check_ollama_sidecar", {
        settings: {
          enabled: settings.embeddedLLM.enabled,
          model: settings.embeddedLLM.model,
          port: settings.embeddedLLM.port,
        },
      });
      return result;
    },
    onSuccess: () => {
      setSidecarStatus(SidecarState.ACTIVE)
      toast({
        title: "embedded ai server is running",
      });
    },
    onError: () => {
      setSidecarStatus(SidecarState.INACTIVE)
      toast({
        title: "embedded ai server is not running",
      });
    },
  });

  const { mutate: stopSidecar, isPending: stopIsPending } = useMutation({
    mutationFn: async () => {
      await invoke("stop_ollama_sidecar");
    },
    onSuccess: () => {
      setSidecarStatus(SidecarState.INACTIVE)
      setModelStatus(ModelState.INACTIVE)
      toast({
        title: "ai stopped",
        description: "the embedded ai has been shut down",
      });
    },
    onError: (e) => {
      setModelStatus(ModelState.INACTIVE)
      setSidecarStatus(SidecarState.ERROR)
      console.error("error stopping ai:", e);
      toast({
        title: "error stopping ai",
        description: "check the console for more details",
        variant: "destructive",
      });
    },
  });

  const { mutate: startModel, isPending: runIsPending } = useMutation({
    mutationFn: async () => {
      posthog.capture("run_ollama_model_sidecar");
      toast({
        title: "checking embedded ai server",
      });

      try {
        const result = await invoke("run_ollama_model_sidecar", {
          settings: {
            enabled: settings.embeddedLLM.enabled,
            model: settings.embeddedLLM.model,
            port: settings.embeddedLLM.port,
          },
        });
        return result;
      } catch (e: any) {
        console.error("embedded ai sidecar model error:", { e });
        throw new Error(e.message);
      }
    },
    onSuccess: () => {
      toast({
        title: "embedded ai model is running",
      });
    },
    onError: () => {
      toast({
        title: "there was an issue",
        description: "the chosen model couldn't run. check the console for more details",
        variant: "destructive",
      });
    },
  });

  const { mutate: checkModelStatus, isPending: modelCheckIsPending } = useMutation({
    mutationFn: async () => {
      posthog.capture("check_ollama_sidecar");
      toast({
        title: "checking embedded ai server",
      });

      const result = await invoke("check_ollama_sidecar", {
        settings: {
          enabled: settings.embeddedLLM.enabled,
          model: settings.embeddedLLM.model,
          port: settings.embeddedLLM.port,
        },
      });
      return result;
    },
    onSuccess: () => {
      setModelStatus(ModelState.RUNNING)
      toast({
        title: "embedded ai server is running",
      });
    },
    onError: () => {
      setModelStatus(ModelState.INACTIVE)
      toast({
        title: "embedded ai server is not running",
      });
    },
  });

  const { mutate: stopModel, isPending: modelStopIsPending } = useMutation({
    mutationFn: async () => {
      await invoke("stop_ollama_sidecar");
    },
    onSuccess: () => {
      setModelStatus(ModelState.INACTIVE)
      toast({
        title: "ai stopped",
        description: "the embedded ai has been shut down",
      });
    },
    onError: (e) => {
      setModelStatus(ModelState.ERROR)
      console.error("error stopping ai:", e);
      toast({
        title: "error stopping ai",
        description: "check the console for more details",
        variant: "destructive",
      });
    },
  });

  async function handleSidecarAction() {
    switch (sidecarStatus) {
      case SidecarState.UNKNOWN:
        checkSidecarStatus();
        break;
      case SidecarState.INACTIVE:
        startSidecar();
        break;
      case SidecarState.ACTIVE:
        stopSidecar();
        break;
      default:
        break;
    }
  }

  async function handleModelAction() {
    switch (modelStatus) {
      case ModelState.UNKNOWN:
        checkModelStatus();
        break;
      case ModelState.INACTIVE:
        startModel();
        break;
      case ModelState.RUNNING:
        stopModel();
        break;
      default:
        break;
    }
  }

  const isPending = useMemo(() => {
    return stopIsPending || runIsPending || checkIsPending || startIsPending || modelCheckIsPending || modelStopIsPending;
  }, [stopIsPending, runIsPending, checkIsPending, startIsPending]);

  useEffect(() => {
    if (sidecarStatus === SidecarState.UNKNOWN) {
      handleSidecarAction()
    }

    if (modelStatus === ModelState.UNKNOWN) {
      handleModelAction()
    }
  }, [sidecarStatus, modelStatus])

  return (
    <LLMContext.Provider
      value={{
        handleSidecarAction,
        handleModelAction,
        isPending,
        sidecarStatus,
        modelStatus
      }}
    >
      {children}
    </LLMContext.Provider>
  );
}

export function useLLM() {
  const context = useContext(LLMContext);
  if (!context) {
    throw new Error("useLLM must be used within an LLMProvider");
  }
  return context;
}
