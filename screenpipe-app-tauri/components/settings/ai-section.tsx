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
import React, { useState, useEffect } from "react";
import { LogFileButton } from "../log-file-button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toast } from "../ui/use-toast";
import { invoke } from "@tauri-apps/api/core";
import { open as openUrl } from "@tauri-apps/plugin-shell";
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
import posthog from "posthog-js";

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

interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
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

  const [showApiKey, setShowApiKey] = React.useState(false);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ openaiApiKey: e.target.value });
  };

  const handleMaxContextCharsChange = (value: number[]) => {
    updateSettings({ aiMaxContextChars: value[0] });
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
      case "screenpipe-cloud":
        return [
          "gpt-4o",
          "gpt-4o-mini",
          "o1-mini",
          "o1",
          "claude-3-5-sonnet-latest",
          "claude-3-5-haiku-latest",
          "gemini-2.0-flash-exp",
          "gemini-1.5-flash",
          "gemini-1.5-flash-8b",
          "gemini-1.5-pro",
        ];
      case "openai":
        return ["gpt-4o", "gpt-4o-mini", "o1-mini", "o1"];
      default:
        return [];
    }
  };
  console.log(getModelSuggestions(settings.aiProviderType));

  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);

  useEffect(() => {
    const fetchOllamaModels = async () => {
      if (settings.aiProviderType !== "native-ollama") return;

      try {
        const response = await fetch("http://localhost:11434/api/tags");
        if (!response.ok) throw new Error("Failed to fetch Ollama models");
        const data = (await response.json()) as { models: OllamaModel[] };
        setOllamaModels(data.models || []);
      } catch (error) {
        console.error("Failed to fetch Ollama models:", error);
        setOllamaModels([]);
      }
    };

    fetchOllamaModels();
  }, [settings.aiProviderType]);

  return (
    <div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold">ai settings</h1>
      <div className="w-full">
        <Label htmlFor="aiUrl" className="min-w-[80px]">
          ai provider
        </Label>
        <div className="grid grid-cols-2 gap-4 mb-4 mt-4">
          <AIProviderCard
            type="openai"
            title="openai"
            description="use your own openai api key for gpt-4 and other models"
            imageSrc="/images/openai.png"
            selected={settings.aiProviderType === "openai"}
            onClick={() => handleAiProviderChange("openai")}
          />

          <AIProviderCard
            type="screenpipe-cloud"
            title="screenpipe cloud"
            description="use openai, anthropic and google models without worrying about api keys or usage"
            imageSrc="/images/screenpipe.png"
            selected={settings.aiProviderType === "screenpipe-cloud"}
            onClick={() => handleAiProviderChange("screenpipe-cloud")}
            disabled={!settings.user}
            warningText={
              !settings.user
                ? "login required"
                : !settings.user?.credits?.amount
                ? "requires credits"
                : undefined
            }
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
            <Popover modal={true}>
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
                      {settings.aiProviderType === "native-ollama"
                        ? ollamaModels?.map((model) => (
                            <CommandItem
                              key={model.name}
                              value={model.name}
                              onSelect={() => {
                                updateSettings({ aiModel: model.name });
                              }}
                            >
                              {model.name}
                            </CommandItem>
                          ))
                        : getModelSuggestions(settings.aiProviderType)?.map(
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
                    maximum number of characters (think 4 characters per token)
                    to send to the ai model. <br />
                    usually, openai models support up to 128k tokens, which is
                    roughly 512k characters. <br />
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
    </div>
  );
};

export default AISection;
