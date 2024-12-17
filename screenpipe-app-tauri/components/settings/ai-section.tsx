/* eslint-disable @next/next/no-img-element */
import { AIProviderType, useSettings } from "@/lib/hooks/use-settings";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  HelpCircle,
  EyeOff,
  Eye,
  RefreshCw,
  Check,
  X,
  Play,
  Loader2,
  Cpu,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import React, { useState } from "react";
import { LogFileButton } from "../log-file-button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toast } from "../ui/use-toast";
import { invoke } from "@tauri-apps/api/core";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { useUser } from "@/lib/hooks/use-user";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "../ui/card";

interface AIProviderCardProps {
  type: "screenpipe-cloud" | "openai" | "native-ollama" | "custom" | "embedded";
  title: string;
  description: string;
  imageSrc: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  warningText?: string;
  imageClassName?: string;
}

const AIProviderCard = ({
  type,
  title,
  description,
  imageSrc,
  selected,
  onClick,
  disabled,
  warningText,
  imageClassName,
}: AIProviderCardProps) => {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "flex py-4 px-4 rounded-lg hover:bg-accent transition-colors h-[145px] w-full cursor-pointer",
        selected ? "border-black/60 border-[1.5px]" : "",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <CardContent className="flex flex-col p-0 w-full">
        <div className="flex items-center gap-2 mb-2">
          <img
            src={imageSrc}
            alt={title}
            className={cn(
              "rounded-lg shrink-0 size-8",
              type === "native-ollama" &&
                "outline outline-gray-300 outline-1 outline-offset-2",
              imageClassName
            )}
          />
          <span className="text-lg font-medium truncate">{title}</span>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-3">
          {description}
        </p>
        {warningText && <Badge className="w-fit mt-2">{warningText}</Badge>}
      </CardContent>
    </Card>
  );
};

const AISection = () => {
  const {
    settings,
    updateSettings,
    localSettings,
    setLocalSettings,
    resetSetting,
  } = useSettings();

  const [ollamaStatus, setOllamaStatus] = useState<
    "idle" | "running" | "error"
  >("idle");

  const [embeddedAIStatus, setEmbeddedAIStatus] = useState<
    "idle" | "running" | "error"
  >("idle");

  const [showApiKey, setShowApiKey] = React.useState(false);
  const { user } = useUser();

  const { credits } = user || {};

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalSettings({ ...localSettings, openaiApiKey: newValue });
    updateSettings({ openaiApiKey: newValue });
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

  const handleAiProviderChange = (newValue: AIProviderType) => {
    let newUrl = "";
    let newModel = localSettings.aiModel;

    if (newValue === "screenpipe-cloud" && !credits?.amount) {
      openUrl("https://buy.stripe.com/5kA6p79qefweacg5kJ");
      return;
    }
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

  return (
    <div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold">AI Settings</h1>
      <div className="w-full">
        <Label htmlFor="aiUrl" className="min-w-[80px]">
          AI Provider
        </Label>
        <div className="grid grid-cols-2 gap-4 mb-4 mt-4">
          <AIProviderCard
            type="screenpipe-cloud"
            title="Screenpipe Cloud"
            description="Fastest with built-in context awareness and streaming support"
            imageSrc="/images/screenpipe.png"
            selected={localSettings.aiProviderType === "screenpipe-cloud"}
            onClick={() => handleAiProviderChange("screenpipe-cloud")}
            warningText={!credits?.amount ? "requires credits" : undefined}
          />

          <AIProviderCard
            type="openai"
            title="OpenAI"
            description="Use your own OpenAI API key for GPT-4 and other models"
            imageSrc="/images/openai.png"
            selected={localSettings.aiProviderType === "openai"}
            onClick={() => handleAiProviderChange("openai")}
          />

          <AIProviderCard
            type="native-ollama"
            title="Ollama"
            description="Run AI models locally using your existing ollama installation"
            imageSrc="/images/ollama.png"
            selected={localSettings.aiProviderType === "native-ollama"}
            onClick={() => handleAiProviderChange("native-ollama")}
          />

          <AIProviderCard
            type="custom"
            title="Custom"
            description="Connect to your own AI provider or self-hosted models"
            imageSrc="/images/custom.png"
            selected={localSettings.aiProviderType === "custom"}
            onClick={() => handleAiProviderChange("custom")}
          />

          {embeddedAIStatus === "running" && (
            <AIProviderCard
              type="embedded"
              title="embedded ai"
              description="use the built-in ai engine for offline processing"
              imageSrc="/images/embedded.png"
              selected={localSettings.aiProviderType === "embedded"}
              onClick={() => handleAiProviderChange("embedded")}
            />
          )}
        </div>
      </div>
      {localSettings.aiProviderType === "custom" && (
        <div className="w-full">
          <div className="flex flex-col gap-4 mb-4">
            <Label htmlFor="customAiUrl">
              Custom URL
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
          <div className="flex flex-col gap-4 mb-4 w-full">
            <Label htmlFor="aiApiKey">API Key</Label>
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
          <div className="flex flex-col gap-4 mb-4 w-full">
            <Label htmlFor="aiModel">AI model</Label>
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
          </div>
        </div>
      )}

      <div className="w-full">
        <div className="flex flex-col gap-4 mb-4 w-full">
          <Label htmlFor="customPrompt">Prompt</Label>
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
        <div className="flex flex-col gap-4 mb-4 w-full">
          <Label htmlFor="aiMaxContextChars" className="flex items-center">
            Max Context{" "}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="ml-2 h-4 w-4 cursor-default" />
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>
                    maximum number of characters (think 3 characters per token)
                    to send to the ai model. <br />
                    usually, openai models support up to 128k tokens, which is
                    roughly 30k-40k characters. <br />
                    we&apos;ll use this for UI purposes to show you how much you
                    can send.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4 w-full">
        <div className="flex items-center justify-between w-full">
          <div className="space-y-1">
            <h4 className="font-medium">Embedded AI</h4>
            <p className="text-sm text-muted-foreground">
              Enable this to use local ai features in screenpipe.
            </p>
          </div>
          <div className="flex items-center gap-2">
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
                    <TooltipContent side="right" className="max-w-[300px]">
                      <p>
                        supported models are the same as ollama. check the
                        ollama documentation for a list of available models.
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
    </div>
  );
};

export default AISection;
