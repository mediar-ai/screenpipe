"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useSettings,
  AIProviderType,
  Shortcut,
} from "@/lib/hooks/use-settings";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "./ui/textarea";
import { Slider } from "@/components/ui/slider"; // Add this import
import { Badge } from "@/components/ui/badge"; // Add this import
import { parseKeyboardShortcut } from "@/lib/utils"; // Add this import

import {
  Eye,
  EyeOff,
  HelpCircle,
  RefreshCw,
  Settings2,
  Check,
  X,
  Play,
  Loader2,
} from "lucide-react";
import { RecordingSettings } from "./recording-settings";
import { Switch } from "./ui/switch";
import { Command } from "@tauri-apps/plugin-shell";
import { LogFileButton } from "./log-file-button";
import { platform } from "@tauri-apps/plugin-os";

import { toast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";

import { registerShortcuts } from "@/lib/shortcuts";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInterval } from "@/lib/hooks/use-interval";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { AuthButton } from "./auth";

// Add type definitions
type ListeningState = 'recording' | 'show' | null;
type ModifierKey = 'ctrl' | 'alt' | 'shift' | 'super';

export function Settings({ className }: { className?: string }) {
  const { settings, updateSettings, resetSetting } = useSettings();
  const { debouncedFetchHealth } = useHealthCheck();
  const [localSettings, setLocalSettings] = useState(settings);
  const [showApiKey, setShowApiKey] = useState(false);

  // Shortcut States
  const [listeningFor, setListeningFor] = useState<ListeningState>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<ModifierKey[]>([]);
  const [nonModifierKey, setNonModifierKey] = useState<string>("");
  const [currentShortcut, setCurrentShortcut] = useState<string>(settings.showScreenpipeShortcut);
  
  const [recordingModifiers, setRecordingModifiers] = useState<ModifierKey[]>([]);
  const [recordingKey, setRecordingKey] = useState<string>("");
  const [currentRecordingShortcut, setCurrentRecordingShortcut] = useState<string>(settings.startRecordingShortcut);

  // Embedded AI States
  const [embeddedAIStatus, setEmbeddedAIStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'running' | 'error'>('idle');

  // Platform state
  const [currentPlatform, setCurrentPlatform] = useState<string>("unknown");

  // Sync with settings changes
  useEffect(() => {
    setLocalSettings(settings);
    setCurrentShortcut(settings.showScreenpipeShortcut);
    setCurrentRecordingShortcut(settings.startRecordingShortcut);
  }, [settings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!listeningFor) return;

      e.preventDefault();
      
      const modifiers: ModifierKey[] = [];
      if (e.ctrlKey) modifiers.push('ctrl');
      if (e.altKey) modifiers.push('alt');
      if (e.shiftKey) modifiers.push('shift');
      if (e.metaKey) modifiers.push('super');

      const key = e.key.toUpperCase();
      if (key.length === 1 || /^F\d{1,2}$/.test(key)) {
        if (listeningFor === 'recording') {
          setRecordingModifiers(modifiers);
          setRecordingKey(key);
        } else {
          setSelectedModifiers(modifiers);
          setNonModifierKey(key);
        }
      }
    };

    if (listeningFor) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [listeningFor]);

  const toggleModifier = (modifier: ModifierKey) => {
    setSelectedModifiers((prev) =>
      prev.includes(modifier)
        ? prev.filter((m) => m !== modifier)
        : [...prev, modifier]
    );
  };

  const toggleRecordingModifier = (modifier: ModifierKey) => {
    setRecordingModifiers((prev) => {
      if (prev.includes(modifier)) {
        return prev.filter((m) => m !== modifier);
      }
      return [modifier];
    });
  };

  const handleNonModifierKeyChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const key = event.target.value.toUpperCase();
    const validKeys = /^[A-Z0-9]$|^F([1-9]|1[0-2])$/; // Alphanumeric or F1-F12
    if (validKeys.test(key) || key === "") {
      setNonModifierKey(key);
    }
  };

  const handleRecordingKeyChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const key = event.target.value.toUpperCase();
    const validKeys = /^[A-Z0-9]$|^F([1-9]|1[0-2])$/; // Alphanumeric or F1-F12
    if (validKeys.test(key) || key === "") {
      setRecordingKey(key);
    }
  };

  const handleSetShortcut = () => {
    if (selectedModifiers.length === 0 || nonModifierKey === "") {
      toast({
        title: "invalid shortcut",
        description: "please select at least one modifier and a key",
        variant: "destructive",
      });
      return;
    }

    const newShortcut = [...selectedModifiers, nonModifierKey].join("+");
    setLocalSettings({ ...localSettings, showScreenpipeShortcut: newShortcut });
    updateSettings({ showScreenpipeShortcut: newShortcut });
    registerShortcuts({
      showScreenpipeShortcut: newShortcut,
      disabledShortcuts: settings.disabledShortcuts,
      startRecordingShortcut: settings.startRecordingShortcut,
    });

    setCurrentShortcut(newShortcut);
    setListeningFor(null);

    toast({
      title: "shortcut updated",
      description: `new shortcut set to: ${parseKeyboardShortcut(newShortcut)}`,
    });
  };

  const handleSetRecordingShortcut = () => {
    if (recordingModifiers.length === 0 || recordingKey === "") {
      toast({
        title: "invalid shortcut",
        description: "please select at least one modifier and a key",
        variant: "destructive",
      });
      return;
    }

    const newShortcut = [...recordingModifiers, recordingKey].join("+");
    setLocalSettings({ ...localSettings, startRecordingShortcut: newShortcut });
    updateSettings({ startRecordingShortcut: newShortcut });
    registerShortcuts({
      showScreenpipeShortcut: settings.showScreenpipeShortcut,
      startRecordingShortcut: newShortcut,
      disabledShortcuts: settings.disabledShortcuts,
    });

    setCurrentRecordingShortcut(newShortcut);
    setListeningFor(null);

    toast({
      title: "shortcut updated",
      description: `new recording shortcut set to: ${parseKeyboardShortcut(newShortcut)}`,
    });
  };

  const newShortcut = [...selectedModifiers, nonModifierKey].join("+");
  const isShortcutChanged = newShortcut !== currentShortcut;

  const newRecordingShortcut = [...recordingModifiers, recordingKey].join("+");
  const isRecordingShortcutChanged = newRecordingShortcut !== currentRecordingShortcut;

  useEffect(() => {
    setCurrentPlatform(platform());
  }, []);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalSettings({ ...localSettings, openaiApiKey: newValue });
    updateSettings({ openaiApiKey: newValue });
  };

  const handleDeepgramApiKeyChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newValue = e.target.value;
    setLocalSettings({ ...localSettings, deepgramApiKey: newValue });
    updateSettings({ deepgramApiKey: newValue });
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalSettings({ ...localSettings, aiModel: newValue });
    updateSettings({ aiModel: newValue });
  };

  const handleCustomPromptChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const newValue = e.target.value;
    setLocalSettings({ ...localSettings, customPrompt: newValue });
    updateSettings({ customPrompt: newValue });
  };

  const handleResetCustomPrompt = () => {
    resetSetting("customPrompt");
  };

  const handleMaxContextCharsChange = (value: number[]) => {
    const newValue = value[0];
    setLocalSettings({ ...localSettings, aiMaxContextChars: newValue });
    updateSettings({ aiMaxContextChars: newValue });
  };

  const handleEmbeddedLLMChange = (checked: boolean) => {
    const newValue = { ...localSettings.embeddedLLM, enabled: checked };
    setLocalSettings({ ...localSettings, embeddedLLM: newValue });
    updateSettings({ embeddedLLM: newValue });
    if (!checked) {
      setOllamaStatus("idle");
    }
  };

  const handleEmbeddedLLMModelChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newModel = e.target.value;
    const newEmbeddedLLM = { ...localSettings.embeddedLLM, model: newModel };
    setLocalSettings({
      ...localSettings,
      embeddedLLM: newEmbeddedLLM,
      aiModel: newModel, // Update the general AI model as well
    });
    updateSettings({
      embeddedLLM: newEmbeddedLLM,
      aiModel: newModel, // Update the general AI model in the global settings
    });
  };

  const handleEmbeddedLLMPortChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newValue = {
      ...localSettings.embeddedLLM,
      port: parseInt(e.target.value, 10),
    };
    setLocalSettings({ ...localSettings, embeddedLLM: newValue });
    updateSettings({ embeddedLLM: newValue });
  };

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const startOllamaSidecar = async () => {
    setOllamaStatus("running");
    toast({
      title: "starting ai",
      description:
        "downloading and initializing the embedded ai, may take a while (check $HOME/.ollama/models)...",
    });

    try {
      console.log(
        "starting ollama sidecar with settings:",
        localSettings.embeddedLLM
      );
      const result = await invoke<string>("start_ollama_sidecar", {
        settings: {
          enabled: localSettings.embeddedLLM.enabled,
          model: localSettings.embeddedLLM.model,
          port: localSettings.embeddedLLM.port,
        },
      });

      setOllamaStatus("running");
      setEmbeddedAIStatus("running");
      toast({
        title: "ai ready",
        description: `${localSettings.embeddedLLM.model} is running.`,
      });

      // Show the LLM test result in a toast
      toast({
        title: `${localSettings.embeddedLLM.model} wants to tell you a joke.`,
        description: result,
        duration: 10000,
      });
    } catch (error) {
      console.error("Error starting ai sidecar:", error);
      setOllamaStatus("error");
      setEmbeddedAIStatus("error");
      toast({
        title: "error starting ai",
        description: "check the console for more details",
        variant: "destructive",
      });
    }
  };

  const handleStopLLM = async () => {
    try {
      await invoke("stop_ollama_sidecar");
      setOllamaStatus("idle");
      setEmbeddedAIStatus("idle");
      toast({
        title: "ai stopped",
        description: "the embedded ai has been shut down",
      });
    } catch (error) {
      console.error("error stopping ai:", error);
      setEmbeddedAIStatus("error");
      toast({
        title: "error stopping ai",
        description: "check the console for more details",
        variant: "destructive",
      });
    }
  };

  const handleAiProviderChange = (newValue: AIProviderType) => {
    let newUrl = "";
    let newModel = localSettings.aiModel;
    switch (newValue) {
      case "openai":
        newUrl = "https://api.openai.com/v1";
        break;
      case "native-ollama":
        newUrl = "http://localhost:11434/v1";
        break;
      case "embedded":
        newUrl = `http://localhost:${localSettings.embeddedLLM.port}/v1`;
        newModel = localSettings.embeddedLLM.model;
        break;
      case "screenpipe-cloud":
        newUrl = "https://ai-proxy.i-f9f.workers.dev/v1";
        break;
      case "custom":
        newUrl = localSettings.aiUrl; // Keep the existing custom URL
        break;
    }

    setLocalSettings({
      ...localSettings,
      aiProviderType: newValue,
      aiUrl: newUrl,
      aiModel: newModel,
    });
    updateSettings({
      aiProviderType: newValue,
      aiUrl: newUrl,
      aiModel: newModel,
    });
  };

  const isApiKeyRequired =
    localSettings.aiUrl !== "https://ai-proxy.i-f9f.workers.dev/v1" &&
    localSettings.aiUrl !== "http://localhost:11434/v1" &&
    localSettings.aiUrl !== "embedded";

  const getProviderTooltipContent = () => {
    switch (localSettings.aiUrl) {
      case "https://ai-proxy.i-f9f.workers.dev/v1":
        return (
          <p>
            screenpipe cloud doesn&apos;t require an API key.
            <br />
            we offer free credits.
            <br />
            note: using this option may involve sending data to our servers.
            <br />
            please review our data privacy policy for more information at:
            <br />
            <a
              href="https://screenpi.pe/privacy"
              target="_blank"
              className="text-primary hover:underline"
            >
              screenpipe privacy policy
            </a>
          </p>
        );
      case "https://api.openai.com/v1":
        return (
          <p>
            openai requires an API key.
            <br />
            note: using this option may involve sending data to openai servers.
            <br />
            please review openai&apos;s data privacy policy for more
            information.
            <br />
            find openai key here:{" "}
            <a
              href="https://platform.openai.com/account/api-keys"
              target="_blank"
              className="text-primary hover:underline"
            >
              openai
            </a>
          </p>
        );
      case "http://localhost:11434/v1":
        return (
          <p>
            choose your ai provider. for local providers like ollama, make sure
            it&apos;s running on your machine.
            <br />
            note: on windows, you may need to run ollama with:
            <pre className="bg-gray-100 p-1 rounded-md">
              OLLAMA_ORIGINS=* ollama run llama3.2:3b-instruct-q4_K_M
            </pre>
          </p>
        );
      case "embedded":
        return (
          <p>
            use the embedded ai provided by screenpipe.
            <br />
            no api key required. model is predefined.
          </p>
        );
      default:
        return (
          <p>
            choose your ai provider. for local providers like ollama, make sure
            it&apos;s running on your machine.
            <br />
            note: on windows, you may need to run ollama with:
            <pre className="bg-gray-100 p-1 rounded-md">
              OLLAMA_ORIGINS=* ollama run llama3.2:3b-instruct-q4_K_M
            </pre>
          </p>
        );
    }
  };

  const getModelTooltipContent = () => {
    switch (localSettings.aiUrl) {
      case "https://api.openai.com/v1":
      case "https://ai-proxy.i-f9f.workers.dev/v1":
        return (
          <p>
            suggested models:
            <br />- gpt-4o
          </p>
        );
      case "http://localhost:11434/v1":
        return (
          <p>
            suggested models:
            <br />
            - llama3.2:3b-instruct-q4_K_M
            <br />
            - mistral models
            <br />
            or find more models at:
            <a
              href="https://ollama.com/library"
              target="_blank"
              className="text-primary hover:underline"
            >
              ollama models
            </a>
          </p>
        );
      case "embedded":
        return (
          <p>the model for embedded ai is predefined and cannot be changed.</p>
        );
      default:
        return (
          <p>enter the model name appropriate for your custom AI provider.</p>
        );
    }
  };

  const isCustomUrl = ![
    "https://api.openai.com/v1",
    "http://localhost:11434/v1",
    "https://ai-proxy.i-f9f.workers.dev/v1",
    "embedded",
  ].includes(localSettings.aiUrl);

  // Add this function to check the embedded AI status
  const checkEmbeddedAIStatus = useCallback(async () => {
    if (localSettings.embeddedLLM.enabled) {
      try {
        const response = await fetch(
          `http://localhost:${localSettings.embeddedLLM.port}/api/tags`,
          {
            method: "GET",
          }
        );
        if (response.ok) {
          setEmbeddedAIStatus("running");
        } else {
          setEmbeddedAIStatus("error");
        }
      } catch (error) {
        console.error("Error checking embedded AI status:", error);
        setEmbeddedAIStatus("error");
      }
    } else {
      setEmbeddedAIStatus("idle");
    }
  }, [localSettings.embeddedLLM.enabled, localSettings.embeddedLLM.port]);

  // Use the useInterval hook to periodically check the status
  useInterval(checkEmbeddedAIStatus, 10000); // Check every 10 seconds

  const handleShortcutToggle = useCallback((checked: boolean) => {
    try {
      let newDisabledShortcuts = [...settings.disabledShortcuts];
      if (!checked) {
        newDisabledShortcuts.push(Shortcut.SHOW_SCREENPIPE);
      } else {
        newDisabledShortcuts = newDisabledShortcuts.filter(
          (shortcut) => shortcut !== Shortcut.SHOW_SCREENPIPE
        );
      }

      // Update both local and global settings
      setLocalSettings({
        ...localSettings,
        disabledShortcuts: newDisabledShortcuts,
      });
      updateSettings({
        disabledShortcuts: newDisabledShortcuts,
      });

      // Re-register shortcuts with new disabled state
      registerShortcuts({
        showScreenpipeShortcut: settings.showScreenpipeShortcut,
        startRecordingShortcut: settings.startRecordingShortcut,
        disabledShortcuts: newDisabledShortcuts,
      });

      toast({
        title: checked ? "shortcut enabled" : "shortcut disabled",
        description: `Show screenpipe shortcut has been ${checked ? "enabled" : "disabled"}`,
      });
    } catch (error) {
      console.error("Error toggling shortcut:", error);
      toast({
        title: "error updating shortcut",
        description: "Failed to update shortcut state. Please try again.",
        variant: "destructive",
      });
    }
  }, [settings, localSettings, updateSettings]);

  const handleRecordingShortcutToggle = useCallback((checked: boolean) => {
    try {
      let newDisabledShortcuts = [...settings.disabledShortcuts];
      if (!checked) {
        newDisabledShortcuts.push(Shortcut.START_RECORDING);
      } else {
        newDisabledShortcuts = newDisabledShortcuts.filter(
          (shortcut) => shortcut !== Shortcut.START_RECORDING
        );
      }

      setLocalSettings({
        ...localSettings,
        disabledShortcuts: newDisabledShortcuts,
      });
      updateSettings({
        disabledShortcuts: newDisabledShortcuts,
      });

      registerShortcuts({
        showScreenpipeShortcut: settings.showScreenpipeShortcut,
        startRecordingShortcut: settings.startRecordingShortcut,
        disabledShortcuts: newDisabledShortcuts,
      });

      toast({
        title: checked ? "shortcut enabled" : "shortcut disabled",
        description: `Recording shortcut has been ${checked ? "enabled" : "disabled"}`,
      });
    } catch (error) {
      console.error("Error toggling recording shortcut:", error);
      toast({
        title: "error updating shortcut",
        description: "Failed to update shortcut state. Please try again.",
        variant: "destructive",
      });
    }
  }, [settings, localSettings, updateSettings]);

  useEffect(() => {
    const handleSettingsUpdate = () => {
      debouncedFetchHealth();
    };

    window.addEventListener("settings-updated", handleSettingsUpdate);

    return () => {
      window.removeEventListener("settings-updated", handleSettingsUpdate);
    };
  }, [debouncedFetchHealth]);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          // Use a more reliable state update mechanism
          const event = new CustomEvent("settings-updated");
          window.dispatchEvent(event);

          // Add a small delay before refetching health
          setTimeout(() => {
            debouncedFetchHealth();
          }, 500);

          window.location.reload();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className={className}>
          <Settings2 className="h-5 w-5" />
          <span className="sr-only">settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[80vw] w-full max-h-[80vh] h-full overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-4">
              settings
              <AuthButton />
            </div>
          </DialogTitle>
          <DialogDescription>
            choose your AI provider, enter necessary credentials, and more.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-8 space-y-6">
          <RecordingSettings
            localSettings={localSettings}
            setLocalSettings={setLocalSettings}
          />

          <Separator />

          <Card>
            <CardHeader>
              <CardTitle className="text-center">ai settings</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
              <div className="w-full">
                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="aiUrl" className="min-w-[80px] text-right">
                    ai provider
                  </Label>
                  <div className="flex-grow flex items-center">
                    <Select
                      onValueChange={handleAiProviderChange}
                      value={localSettings.aiProviderType}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select AI provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">openai</SelectItem>
                        <SelectItem value="native-ollama">
                          ollama (local)
                        </SelectItem>
                        <SelectItem value="screenpipe-cloud">
                          screenpipe cloud
                        </SelectItem>
                        <SelectItem value="custom">custom</SelectItem>
                        {embeddedAIStatus === "running" && (
                          <SelectItem value="embedded">embedded ai</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="ml-2 h-4 w-4 cursor-default" />
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        {getProviderTooltipContent()}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              {localSettings.aiProviderType === "custom" && (
                <div className="w-full">
                  <div className="flex items-center gap-4 mb-4">
                    <Label
                      htmlFor="customAiUrl"
                      className="min-w-[80px] text-right"
                    >
                      custom url
                    </Label>
                    <Input
                      id="customAiUrl"
                      value={localSettings.aiUrl}
                      onChange={(e) => {
                        const newUrl = e.target.value;
                        setLocalSettings({ ...localSettings, aiUrl: newUrl });
                        updateSettings({ aiUrl: newUrl });
                      }}
                      className="flex-grow"
                      placeholder="enter custom ai url"
                      autoCorrect="off"
                      autoCapitalize="off"
                      autoComplete="off"
                      type="text"
                    />
                  </div>
                </div>
              )}
              {isApiKeyRequired && (
                <div className="w-full">
                  <div className="flex items-center gap-4 mb-4">
                    <Label
                      htmlFor="aiApiKey"
                      className="min-w-[80px] text-right"
                    >
                      api key
                    </Label>
                    <div className="flex-grow relative">
                      <Input
                        id="aiApiKey"
                        type={showApiKey ? "text" : "password"}
                        value={localSettings.openaiApiKey}
                        onChange={handleApiKeyChange}
                        className="pr-10"
                        placeholder="enter your ai api key"
                        autoCorrect="off"
                        autoCapitalize="off"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {localSettings.aiProviderType !== "embedded" && (
                <div className="w-full">
                  <div className="flex items-center gap-4 mb-4">
                    <Label
                      htmlFor="aiModel"
                      className="min-w-[80px] text-right"
                    >
                      ai model
                    </Label>
                    <div className="flex-grow relative">
                      <Input
                        id="aiModel"
                        value={localSettings.aiModel}
                        onChange={handleModelChange}
                        className="flex-grow"
                        placeholder={
                          localSettings.aiProviderType === "native-ollama"
                            ? "e.g., llama3.2:3b-instruct-q4_K_M"
                            : "e.g., gpt-4o"
                        }
                        autoCorrect="off"
                        autoCapitalize="off"
                        autoComplete="off"
                      />
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="ml-2 h-4 w-4 cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {getModelTooltipContent()}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              )}

              <div className="w-full">
                <div className="flex items-center gap-4 mb-4">
                  <Label
                    htmlFor="customPrompt"
                    className="min-w-[80px] text-right"
                  >
                    prompt
                  </Label>
                  <div className="flex-grow relative">
                    <Textarea
                      id="customPrompt"
                      value={localSettings.customPrompt}
                      onChange={handleCustomPromptChange}
                      className="min-h-[100px]"
                      placeholder="enter your custom prompt here"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-2"
                      onClick={handleResetCustomPrompt}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      reset
                    </Button>
                  </div>
                </div>
              </div>

              <div className="w-full">
                <div className="flex items-center gap-4 mb-4">
                  <Label
                    htmlFor="aiMaxContextChars"
                    className="min-w-[80px] text-right"
                  >
                    max context
                  </Label>
                  <div className="flex-grow flex items-center">
                    <Slider
                      id="aiMaxContextChars"
                      min={1000}
                      max={128000}
                      step={1000}
                      value={[localSettings.aiMaxContextChars]}
                      onValueChange={handleMaxContextCharsChange}
                      className="flex-grow"
                    />
                    <span className="ml-2 min-w-[60px] text-right">
                      {localSettings.aiMaxContextChars.toLocaleString()}
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="ml-2 h-4 w-4 cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p>
                            maximum number of characters (think 3 characters per
                            token) to send to the ai model. <br />
                            usually, openai models support up to 128k tokens,
                            which is roughly 30k-40k characters. <br />
                            we&apos;ll use this for UI purposes to show you how
                            much you can send.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>

              <Separator />

              <p className="mt-2 text-sm text-muted-foreground text-center">
                enter your ai provider details here. for openai, you can get an
                api key from{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  openai&apos;s website
                </a>
                .
              </p>
              <p className="mt-2 text-sm text-muted-foreground text-center">
                for ollama, or any other provider, use the url running on your
                local machine or elsewhere and the exact model name.
              </p>

              <Separator className="my-4" />

              <div className="w-full">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center min-w-[80px] justify-end">
                    <Label htmlFor="embeddedLLM" className="text-right mr-2">
                      embedded ai
                    </Label>
                    <Badge variant="outline" className="ml-2">
                      experimental
                    </Badge>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 cursor-help ml-2" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[300px]">
                          <p>
                            enable this to use local ai features in screenpipe.
                            this is an experimental feature that may be unstable
                            or change in future updates. you can use it through
                            search or pipes for enhanced functionality without
                            relying on external services.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex items-center gap-4">
                    <Switch
                      id="embeddedLLM"
                      checked={localSettings.embeddedLLM.enabled}
                      onCheckedChange={handleEmbeddedLLMChange}
                    />
                    {localSettings.embeddedLLM.enabled && (
                      <>
                        <Button
                          onClick={startOllamaSidecar}
                          disabled={ollamaStatus === "running"}
                          className="ml-auto"
                        >
                          {ollamaStatus === "running" ? (
                            <Check className="h-4 w-4 mr-2" />
                          ) : ollamaStatus === "error" ? (
                            <X className="h-4 w-4 mr-2" />
                          ) : ollamaStatus === "idle" ? (
                            <Play className="h-4 w-4 mr-2" />
                          ) : (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          )}
                          {ollamaStatus === "running"
                            ? "running"
                            : ollamaStatus === "error"
                            ? "error"
                            : "start ai"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleStopLLM}
                          className="ml-auto"
                        >
                          <X className="h-4 w-4 mr-2" />
                          stop ai
                        </Button>
                        <LogFileButton isAppLog={true} />
                        <Badge>{embeddedAIStatus}</Badge>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {localSettings.embeddedLLM.enabled && (
                <>
                  <div className="w-full">
                    <div className="flex items-center gap-4 mb-4">
                      <Label
                        htmlFor="embeddedLLMModel"
                        className="min-w-[80px] text-right"
                      >
                        llm model
                      </Label>
                      <div className="flex-grow flex items-center">
                        <Input
                          id="embeddedLLMModel"
                          value={localSettings.embeddedLLM.model}
                          onChange={handleEmbeddedLLMModelChange}
                          className="flex-grow"
                          placeholder="enter embedded llm model"
                        />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="ml-2 h-4 w-4 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent
                              side="right"
                              className="max-w-[300px]"
                            >
                              <p>
                                supported models are the same as ollama. check
                                the ollama documentation for a list of available
                                models.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </div>

                  <div className="w-full">
                    <div className="flex items-center gap-4 mb-4">
                      <Label
                        htmlFor="embeddedLLMPort"
                        className="min-w-[80px] text-right"
                      >
                        llm port
                      </Label>
                      <Input
                        id="embeddedLLMPort"
                        type="number"
                        value={localSettings.embeddedLLM.port}
                        onChange={handleEmbeddedLLMPortChange}
                        className="flex-grow"
                        placeholder="enter embedded llm port"
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-center">deepgram</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="w-full ">
                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="apiKey" className="min-w-[80px] text-right">
                    api key
                  </Label>
                  <div className="flex-grow relative">
                    <Input
                      id="apiKey"
                      type={showApiKey ? "text" : "password"}
                      value={settings.deepgramApiKey}
                      onChange={handleDeepgramApiKeyChange}
                      className="pr-10"
                      placeholder="Enter your Deepgram API Key"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground text-center">
                deepgram&apos;s transcription models are currently the most
                reliable for this application.
              </p>
              <p className="mt-1 text-sm text-muted-foreground text-center">
                don&apos;t have an API key? get one from{" "}
                <a
                  href="https://console.deepgram.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  deepgram&apos;s website
                </a>{" "}
                or DM us on discord, it&apos;s on us!
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-center">shortcuts</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                <li className="flex items-center justify-between">
                  <span className="text-sm font-medium">start recording</span>
                  <div className="relative w-[12rem]">
                    {listeningFor === 'recording' ? (
                      <div className="border border-blue-300 rounded-lg text-gray-500 w-full h-[2.5rem] bg-gray-100 flex items-center justify-between px-2 overflow-hidden">
                        <span className="truncate text-sm">
                          {recordingKey ? parseKeyboardShortcut([...recordingModifiers, recordingKey].join('+')) : 'listening...'}
                        </span>
                        <div className="flex items-center gap-1 ml-2">
                          {recordingKey && (
                            <button
                              type="button"
                              onClick={handleSetRecordingShortcut}
                              className="text-blue-500 hover:text-blue-600"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setListeningFor(null)}
                            className="text-gray-400 hover:text-gray-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setListeningFor('recording')}
                        className="w-full h-[2.5rem] justify-between overflow-hidden bg-black text-white hover:bg-black/90"
                      >
                        <span>{parseKeyboardShortcut(currentRecordingShortcut)}</span>
                        <span className="ml-2 text-xs text-gray-400">edit</span>
                      </Button>
                    )}
                  </div>
                </li>

                <li className="flex items-center justify-between">
                  <span className="text-sm font-medium">show screenpipe</span>
                  <div className="relative w-[12rem]">
                    {listeningFor === 'show' ? (
                      <div className="border border-blue-300 rounded-lg text-gray-500 w-full h-[2.5rem] bg-gray-100 flex items-center justify-between px-2 overflow-hidden">
                        <span className="truncate text-sm">
                          {nonModifierKey ? parseKeyboardShortcut([...selectedModifiers, nonModifierKey].join('+')) : 'listening...'}
                        </span>
                        <div className="flex items-center gap-1 ml-2">
                          {nonModifierKey && (
                            <button
                              type="button"
                              onClick={handleSetShortcut}
                              className="text-blue-500 hover:text-blue-600"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setListeningFor(null)}
                            className="text-gray-400 hover:text-gray-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setListeningFor('show')}
                        className="w-full h-[2.5rem] justify-between overflow-hidden bg-black text-white hover:bg-black/90"
                      >
                        <span>{parseKeyboardShortcut(currentShortcut)}</span>
                        <span className="ml-2 text-xs text-gray-400">edit</span>
                      </Button>
                    )}
                  </div>
                </li>
              </ul>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="shortcutEnabled" className="text-sm">
                    disable overlay shortcut
                  </Label>
                  <Switch
                    id="shortcutEnabled"
                    checked={!settings.disabledShortcuts.includes(Shortcut.SHOW_SCREENPIPE)}
                    onCheckedChange={handleShortcutToggle}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="recordingShortcutEnabled" className="text-sm">
                    disable recording shortcut
                  </Label>
                  <Switch
                    id="recordingShortcutEnabled"
                    checked={!settings.disabledShortcuts.includes(Shortcut.START_RECORDING)}
                    onCheckedChange={handleRecordingShortcutToggle}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
