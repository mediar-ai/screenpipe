"use client";
import React from "react";
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
import { Textarea } from "./ui/textarea";

import { platform } from "@tauri-apps/plugin-os";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { RecordingSettings } from "./recording-settings";

export function Settings({ className }: { className?: string }) {
  const { settings, updateSettings, resetSetting } = useSettings();
  const [localSettings, setLocalSettings] = React.useState(settings);
  const [currentPlatform, setCurrentPlatform] = React.useState<string>("");
  const [showApiKey, setShowApiKey] = React.useState(false);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalSettings((prev) => ({ ...prev, openaiApiKey: newValue }));
    updateSettings({ openaiApiKey: newValue });
  };

  const handleOllamaToggle = (checked: boolean) => {
    setLocalSettings((prev) => ({ ...prev, useOllama: checked }));
    updateSettings({ useOllama: checked });
  };

  const handleOllamaUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalSettings((prev) => ({ ...prev, ollamaUrl: newValue }));
    updateSettings({ ollamaUrl: newValue });
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalSettings((prev) => ({ ...prev, aiModel: newValue }));
    updateSettings({ aiModel: newValue });
  };

  const handleCustomPromptChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const newValue = e.target.value;
    setLocalSettings((prev) => ({ ...prev, customPrompt: newValue }));
    updateSettings({ customPrompt: newValue });
  };

  const handleResetCustomPrompt = () => {
    resetSetting("customPrompt");
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
          <RecordingSettings
            localSettings={localSettings}
            setLocalSettings={setLocalSettings}
            currentPlatform={currentPlatform}
          />

          <Separator />

          <Card>
            <CardHeader>
              <CardTitle className="text-center">general ai settings</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="w-full ">
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
                        ? "e.g., mistral-nemo"
                        : "e.g., gpt-4o"
                    }
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {localSettings.useOllama
                    ? "recommended: mistral-nemo for ollama (we only support models supporting tools like llama3.1, mistral-nemo, etc.)"
                    : "recommended: gpt-4o for openai"}
                </p>
              </div>
              <Separator className="my-4" />
              <div className="w-full ">
                <div className="flex flex-col gap-2 mb-4">
                  <div className="flex justify-between items-center">
                    <Label
                      htmlFor="customPrompt"
                      className="text-sm font-medium"
                    >
                      enter your custom prompt (keep it short, less is more):
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleResetCustomPrompt}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Reset to default prompt</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Textarea
                    id="customPrompt"
                    value={localSettings.customPrompt || ""}
                    onChange={handleCustomPromptChange}
                    className="w-full"
                    rows={6}
                    maxLength={2000}
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
              <CardTitle className="text-center">openai</CardTitle>
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
                      value={settings.openaiApiKey}
                      onChange={handleApiKeyChange}
                      className="pr-10"
                      placeholder="Enter your OpenAI API Key"
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
                openai&apos;s GPT models are currently the most reliable for
                this application.
              </p>
              <p className="mt-1 text-sm text-muted-foreground text-center">
                don&apos;t have an API key? Get one from{" "}
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
                  <div className="w-full  mt-2">
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
                      ? "You need to [install Ollama](https://ollama.com/) and run `set OLLAMA_ORIGINS=* && ollama run mistral-nemo` first. \n\nCurrently only supports models supporting tools like llama3.1, mistral-nemo, etc."
                      : "You need to [install Ollama](https://ollama.com/) and run `ollama run mistral-nemo` first. \n\nCurrently only supports models supporting tools like llama3.1, mistral-nemo, etc."}
                  </MemoizedReactMarkdown>
                </div>
                <a
                  href="https://github.com/mediar-ai/screenpipe/issues/167"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline font-bold"
                >
                  want to help make this work well?
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
