/* eslint-disable @next/next/no-img-element */
import { AIProviderType, useSettings } from "@/lib/hooks/use-settings";
import { Label } from "@/components/ui/label";
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
  ChevronsUpDown,
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  const { settings, updateSettings, resetSetting } = useSettings();

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
    updateSettings({ openaiApiKey: e.target.value });
  };

  const handleMaxContextCharsChange = (value: number[]) => {
    updateSettings({ aiMaxContextChars: value[0] });
  };

  const handleEmbeddedLLMChange = (checked: boolean) => {
    updateSettings({
      embeddedLLM: {
        ...settings.embeddedLLM,
        enabled: checked,
      },
    });
    if (!checked) {
      setOllamaStatus("idle");
    }
  };

  const handleEmbeddedLLMModelChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newModel = e.target.value;
    updateSettings({
      embeddedLLM: {
        ...settings.embeddedLLM,
        model: newModel,
      },
      aiModel: newModel,
    });
  };

  const handleEmbeddedLLMPortChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    updateSettings({
      embeddedLLM: {
        ...settings.embeddedLLM,
        port: parseInt(e.target.value, 10),
      },
    });
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
        settings.embeddedLLM
      );
      const result = await invoke<string>("start_ollama_sidecar", {
        settings: {
          enabled: settings.embeddedLLM.enabled,
          model: settings.embeddedLLM.model,
          port: settings.embeddedLLM.port,
        },
      });

      setOllamaStatus("running");
      setEmbeddedAIStatus("running");
      toast({
        title: "ai ready",
        description: `${settings.embeddedLLM.model} is running.`,
      });

      // Show the LLM test result in a toast
      toast({
        title: `${settings.embeddedLLM.model} wants to tell you a joke.`,
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

  const handleModelChange = (value: string) => {
    updateSettings({ aiModel: value });
  };

  const handleCustomPromptChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    updateSettings({ customPrompt: e.target.value });
  };

  const handleResetCustomPrompt = () => {
    resetSetting("customPrompt");
  };

  const handleAiProviderChange = (newValue: AIProviderType) => {
    let newUrl = "";
    let newModel = settings.aiModel;

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
        newUrl = `http://localhost:${settings.embeddedLLM.port}/v1`;
        newModel = settings.embeddedLLM.model;
        break;
      case "screenpipe-cloud":
        newUrl = "https://ai-proxy.i-f9f.workers.dev/v1";
        break;
      case "custom":
        newUrl = settings.aiUrl;
        break;
    }

    updateSettings({
      aiProviderType: newValue,
      aiUrl: newUrl,
      aiModel: newModel,
    });
  };

  const isApiKeyRequired =
    settings.aiUrl !== "https://ai-proxy.i-f9f.workers.dev/v1" &&
    settings.aiUrl !== "http://localhost:11434/v1" &&
    settings.aiUrl !== "embedded";

  const getModelSuggestions = (provider: AIProviderType) => {
    switch (provider) {
      case "native-ollama":
        return [
          "llama3.2:1B",
          "llama3.2:3B",
          "llama3.1:8B",
          "llama3.3:70B",
          "llama3.1:405B",
        ];
      case "screenpipe-cloud":
        return ["gpt-4o", "gpt-4o-mini", "o1-mini", "o1", "claude-3-5-sonnet-latest"];
      case "openai":
        return ["gpt-4o", "gpt-4o-mini", "o1-mini", "o1"];
      default:
        return [];
    }
  };
  console.log(getModelSuggestions(settings.aiProviderType));

  return (
    <div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold">ai settings</h1>
      <div className="w-full">
        <Label htmlFor="aiUrl" className="min-w-[80px]">
          ai provider
        </Label>
        <div className="grid grid-cols-2 gap-4 mb-4 mt-4">
          <AIProviderCard
            type="screenpipe-cloud"
            title="screenpipe cloud"
            description="use openai or anthropic models without worrying about api keys or usage"
            imageSrc="/images/screenpipe.png"
            selected={settings.aiProviderType === "screenpipe-cloud"}
            onClick={() => handleAiProviderChange("screenpipe-cloud")}
            warningText={!credits?.amount ? "requires credits" : undefined}
          />

          <AIProviderCard
            type="openai"
            title="openai"
            description="use your own openai api key for gpt-4 and other models"
            imageSrc="/images/openai.png"
            selected={settings.aiProviderType === "openai"}
            onClick={() => handleAiProviderChange("openai")}
          />

          <AIProviderCard
            type="native-ollama"
            title="ollama"
            description="run ai models locally using your existing ollama installation"
            imageSrc="/images/ollama.png"
            selected={settings.aiProviderType === "native-ollama"}
            onClick={() => handleAiProviderChange("native-ollama")}
          />

          <AIProviderCard
            type="custom"
            title="custom"
            description="connect to your own ai provider or self-hosted models"
            imageSrc="/images/custom.png"
            selected={settings.aiProviderType === "custom"}
            onClick={() => handleAiProviderChange("custom")}
          />

          {embeddedAIStatus === "running" && (
            <AIProviderCard
              type="embedded"
              title="embedded ai"
              description="use the built-in ai engine for offline processing"
              imageSrc="/images/embedded.png"
              selected={settings.aiProviderType === "embedded"}
              onClick={() => handleAiProviderChange("embedded")}
            />
          )}
        </div>
      </div>
      {settings.aiProviderType === "custom" && (
        <div className="w-full">
          <div className="flex flex-col gap-4 mb-4">
            <Label htmlFor="customAiUrl">custom url</Label>
            <Input
              id="customAiUrl"
              value={settings.aiUrl}
              onChange={(e) => {
                const newUrl = e.target.value;
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
                value={settings.openaiApiKey}
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
      {settings.aiProviderType !== "embedded" && (
        <div className="w-full">
          <div className="flex flex-col gap-4 mb-4 w-full">
            <Label htmlFor="aiModel">ai model</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {settings.aiModel || "select model..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput 
                    placeholder="select or type model name"
                    onValueChange={(value) => {
                      if (value) {
                        updateSettings({ aiModel: value });
                      }
                    }}
                  />
                  <CommandList>
                    <CommandEmpty>
                      press enter to use &quot;{settings.aiModel}&quot;
                    </CommandEmpty>
                    <CommandGroup heading="Suggestions">
                      {getModelSuggestions(settings.aiProviderType)?.map(
                        (model) => (
                          <CommandItem
                            key={model}
                            value={model}
                            onSelect={() => {
                              updateSettings({ aiModel: model });
                            }}
                          >
                            {model}
                          </CommandItem>
                        )
                      )}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      <div className="w-full">
        <div className="flex flex-col gap-4 mb-4 w-full">
          <Label htmlFor="customPrompt">prompt</Label>
          <div className="flex-grow relative">
            <Textarea
              id="customPrompt"
              value={settings.customPrompt}
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
            max context{" "}
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
              max={512000}
              step={1000}
              value={[settings.aiMaxContextChars]}
              onValueChange={handleMaxContextCharsChange}
              className="flex-grow"
            />
            <span className="ml-2 min-w-[60px] text-right">
              {settings.aiMaxContextChars.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4 w-full">
        <div className="flex items-center justify-between w-full">
          <div className="space-y-1">
            <h4 className="font-medium">embedded ai</h4>
            <p className="text-sm text-muted-foreground">
              enable this to use local ai features in screenpipe.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="embeddedLLM"
              checked={settings.embeddedLLM.enabled}
              onCheckedChange={handleEmbeddedLLMChange}
            />
            {settings.embeddedLLM.enabled && (
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

      {settings.embeddedLLM.enabled && (
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
                  value={settings.embeddedLLM.model}
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
                value={settings.embeddedLLM.port}
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
