"use client";
import React, { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { MemoizedReactMarkdown } from "./markdown";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { platform } from "@tauri-apps/plugin-os";
import { Textarea } from "./ui/textarea";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useToast } from "./ui/use-toast";

export function Settings({ className }: { className?: string }) {
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = React.useState(settings);
  const [currentPlatform, setCurrentPlatform] = React.useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSettings({ ...localSettings, openaiApiKey: e.target.value });
    updateSettings({ ...localSettings, openaiApiKey: e.target.value });
  };

  const handleOllamaToggle = (checked: boolean) => {
    console.log("checked", checked);
    setLocalSettings({ ...localSettings, useOllama: checked });
    updateSettings({ ...localSettings, useOllama: checked });
  };

  const handleOllamaUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSettings({ ...localSettings, ollamaUrl: e.target.value });
    updateSettings({ ...localSettings, ollamaUrl: e.target.value });
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSettings({ ...localSettings, aiModel: e.target.value });
    updateSettings({ ...localSettings, aiModel: e.target.value });
  };

  const handleCustomPromptChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setLocalSettings({ ...localSettings, customPrompt: e.target.value });
    updateSettings({ ...localSettings, customPrompt: e.target.value });
  };

  const handleEmbeddedScreenpipeToggle = (checked: boolean) => {
    setLocalSettings({ ...localSettings, useEmbeddedScreenpipe: checked });
    updateSettings({ ...localSettings, useEmbeddedScreenpipe: checked });
  };

  const handleStartScreenpipe = async () => {
    setIsLoading(true);
    const toastId = toast({
      title: "Starting Screenpipe",
      description: "Please wait...",
      duration: Infinity,
    });
    try {
      toastId.update({
        id: toastId.id,
        title: "Screenpipe Started",
        description: "Screenpipe is now running.",
        duration: 3000,
      });
      await invoke("spawn_screenpipe");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("Failed to start screenpipe:", error);
      toastId.update({
        id: toastId.id,
        title: "Error",
        description: "Failed to start Screenpipe.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      toastId.dismiss();
      setIsLoading(false);
    }
  };

  const handleStopScreenpipe = async () => {
    setIsLoading(true);
    const toastId = toast({
      title: "Stopping Screenpipe",
      description: "Please wait...",
      duration: Infinity,
    });
    try {
      await invoke("kill_all_sreenpipes");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toastId.update({
        id: toastId.id,
        title: "Screenpipe Stopped",
        description: "Screenpipe is now stopped.",
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to stop screenpipe:", error);
      toastId.update({
        id: toastId.id,
        title: "Error",
        description: "Failed to stop Screenpipe.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      toastId.dismiss();
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    setLocalSettings(settings);
    setCurrentPlatform(platform());
  }, [settings]);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          location.reload(); // ! HACK to properly refresh stuff (tood beter)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" className={className}>
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[80vw] w-full max-h-[80vh] h-full overflow-y-auto">
        <DialogHeader>
          <DialogTitle>settings</DialogTitle>
          <DialogDescription>
            choose your AI provider, enter necessary credentials, and more.
          </DialogDescription>
          {localSettings.useOllama ? (
            <p className="text-sm font-medium text-grey-600 dark:text-grey-400">
              you are now using ollama 🦙
            </p>
          ) : (
            <p className="text-sm font-medium text-grey-600 dark:text-grey-400">
              you are now using openai 🤖
            </p>
          )}
        </DialogHeader>
        <div className="mt-8 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-center flex items-center justify-center">
                embedded screenpipe settings{" "}
                <Badge variant="outline" className="ml-2">
                  experimental
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="w-full max-w-md">
                <div className="flex items-center  mb-4">
                  <Label
                    htmlFor="use-embedded-screenpipe"
                    className="flex items-center space-x-2 mr-4"
                  >
                    use embedded screenpipe
                  </Label>
                  <Switch
                    id="use-embedded-screenpipe"
                    checked={localSettings.useEmbeddedScreenpipe || false}
                    onCheckedChange={handleEmbeddedScreenpipeToggle}
                  />
                </div>
                <p className="text-sm text-muted-foreground  mb-4">
                  off = use CLI
                  <br />
                  on = will try to keep one instance up all the time
                  <br />
                  (starts automatically on app boot if enabled)
                </p>
                <div className="flex justify-center space-x-4">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          onClick={handleStopScreenpipe}
                          disabled={isLoading}
                        >
                          stop
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          This will stop all screenpipe instances running on
                          your computer
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    variant="outline"
                    onClick={handleStartScreenpipe}
                    disabled={!localSettings.useEmbeddedScreenpipe || isLoading}
                  >
                    start
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-center">general ai settings</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="w-full max-w-md">
                <div className="flex flex-col gap-2 mb-4">
                  <Label htmlFor="aiModel" className="text-sm font-medium">
                    {localSettings.useOllama
                      ? "enter your ollama model:"
                      : "enter your openai model:"}
                  </Label>
                  <Input
                    autoCorrect="off"
                    autoComplete="off"
                    id="aiModel"
                    value={localSettings.aiModel}
                    onChange={handleModelChange}
                    className="w-full"
                    placeholder={
                      localSettings.useOllama
                        ? "e.g., llama3.1"
                        : "e.g., gpt-4o"
                    }
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {localSettings.useOllama
                    ? "recommended: llama3.1 for ollama (we only support models supporting tools like llama3.1, mistral-nemo, etc.)"
                    : "recommended: gpt-4o for openai"}
                </p>
              </div>
              <Separator className="my-4" />
              <div className="w-full max-w-md">
                <div className="flex flex-col gap-2 mb-4">
                  <Label htmlFor="customPrompt" className="text-sm font-medium">
                    Enter your custom prompt (keep it short):
                  </Label>
                  <Textarea
                    id="customPrompt"
                    value={localSettings.customPrompt || ""}
                    onChange={handleCustomPromptChange}
                    className="w-full"
                    placeholder="Enter additional instructions for the AI..."
                    rows={4}
                    maxLength={200}
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  This prompt will be added to the system message for all your
                  queries.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-center">OpenAI</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="w-full max-w-md">
                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="apiKey" className="min-w-[80px] text-right">
                    API Key
                  </Label>
                  <Input
                    id="apiKey"
                    value={settings.openaiApiKey}
                    onChange={handleApiKeyChange}
                    className="flex-grow"
                    placeholder="Enter your OpenAI API Key"
                  />
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground text-center">
                OpenAI&apos;s GPT models are currently the most reliable for
                this application.
              </p>
              <p className="mt-1 text-sm text-muted-foreground text-center">
                Don&apos;t have an API key? Get one from{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  OpenAI&apos;s website
                </a>
                .
              </p>
            </CardContent>
          </Card>

          <Separator />

          <Card>
            <CardHeader>
              <CardTitle className="text-center">
                Alternative AI Providers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col items-center space-y-2">
                <div className="flex items-center space-x-4">
                  <Switch
                    id="use-ollama"
                    checked={localSettings.useOllama}
                    onCheckedChange={handleOllamaToggle}
                  />
                  <Label
                    htmlFor="use-ollama"
                    className="flex items-center space-x-2"
                  >
                    Use Ollama
                    <Badge variant="outline" className="ml-2">
                      Experimental
                    </Badge>
                  </Label>
                </div>

                {localSettings.useOllama && (
                  <div className="w-full max-w-md mt-2">
                    <div className="flex-col gap-2 mb-4">
                      <div className="flex items-center gap-4 mb-4">
                        <Label
                          htmlFor="ollamaUrl"
                          className="min-w-[80px] text-right"
                        >
                          Ollama URL
                        </Label>
                        <Input
                          id="ollamaUrl"
                          value={localSettings.ollamaUrl}
                          onChange={handleOllamaUrlChange}
                          className="flex-grow"
                          placeholder="Enter Ollama URL (e.g., http://localhost:11434)"
                        />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground text-center">
                        For now only port 11434 and 9000 are supported for
                        security reasons.
                      </p>
                    </div>
                  </div>
                )}
                <div className="text-sm text-muted-foreground mt-1">
                  <MemoizedReactMarkdown
                    components={{
                      a: ({ href, children }) => (
                        <a
                          className="text-primary hover:underline"
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {children}
                        </a>
                      ),
                      code: ({ children }) => (
                        <code className="px-1 py-0.5 rounded-sm bg-gray-100 dark:bg-gray-800 font-mono text-sm">
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {currentPlatform === "windows"
                      ? "You need to [install Ollama](https://ollama.com/) and run `set OLLAMA_ORIGINS=* && ollama run llama3.1` first. \n\nCurrently only supports models supporting tools like llama3.1, mistral-nemo, etc."
                      : "You need to [install Ollama](https://ollama.com/) and run `ollama run llama3.1` first. \n\nCurrently only supports models supporting tools like llama3.1, mistral-nemo, etc."}
                  </MemoizedReactMarkdown>
                </div>
                <a
                  href="https://github.com/louis030195/screen-pipe/issues/167"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  want to help make this well?
                </a>
              </div>

              <Separator />

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-center space-x-4">
                      <Switch
                        id="use-embedded-llm"
                        checked={false}
                        disabled={true}
                      />
                      <Label
                        htmlFor="use-embedded-llm"
                        className="flex items-center space-x-2"
                      >
                        Use Embedded LLM
                        <Badge variant="outline" className="ml-2">
                          Soon
                        </Badge>
                      </Label>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Embedded LLM support coming soon. Run locally without
                      installation. No need Ollama.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
