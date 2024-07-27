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
import { PrettyLink } from "./pretty-link";
import { MemoizedReactMarkdown } from "./markdown";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "./ui/codeblock";
import { ChatMessageActions } from "./chat-message-actions";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import { IconCheck, IconCopy } from "./ui/icons";
import { invoke } from "@tauri-apps/api/core";
import { spinner } from "./spinner";

export function Settings({ className }: { className?: string }) {
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = React.useState(settings);
  const [isTogglingCli, setIsTogglingCli] = React.useState(false);
  const [isTogglingCliError, setIsTogglingCliError] = React.useState("");
  const [isStopping, setIsStopping] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  console.log("localSettings", localSettings);
  console.log("settings", settings);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSettings({ ...localSettings, openaiApiKey: e.target.value });
    updateSettings({ ...localSettings, openaiApiKey: e.target.value });
  };

  const handleOllamaToggle = (checked: boolean) => {
    console.log("checked", checked);
    setLocalSettings({ ...localSettings, useOllama: checked });
    updateSettings({ ...localSettings, useOllama: checked });
  };

  const handleCliToggle = async (checked: boolean) => {
    setIsTogglingCli(true);
    try {
      await invoke("use_cli", { useCli: checked });
      setLocalSettings({ ...localSettings, useCli: checked });
      updateSettings({ ...localSettings, useCli: checked });
    } catch (error) {
      console.error("Failed to toggle sidecar:", error);
      setIsTogglingCliError("Failed to toggle sidecar: " + error);
    } finally {
      setIsTogglingCli(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      await invoke("use_cli", { useCli: true });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("Failed to stop:", error);
      // Handle error
    } finally {
      setIsStopping(false);
    }
  };
  const handleStart = async () => {
    setIsStarting(true);
    try {
      await invoke("use_cli", { useCli: false });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("Failed to start:", error);
      // Handle error
    } finally {
      setIsStarting(false);
    }
  };

  React.useEffect(() => {
    setLocalSettings(settings);
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
      <DialogContent className="max-w-[80vw] w-full max-h-[100vh] h-full overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Choose your AI provider, enter necessary credentials, and more.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-8 space-y-6">
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
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
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
                            Beta
                          </Badge>
                        </Label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Toggle to use Ollama instead of OpenAI API. Expect
                        errors as this is experimental.
                        <br />
                        Function calling was just announced and doesn&apos;t
                        work well, usually requiring more prompt engineering
                        compared to OpenAI.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
                    You need to [install Ollama](https://ollama.com/) and run
                    `ollama run llama3.1` first. Currently only supports Llama
                    3.1.
                  </MemoizedReactMarkdown>
                </div>
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

          <Separator />

          <Card>
            <CardHeader>
              <CardTitle className="text-center">CLI Option</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center space-x-4">
                {/* <Switch
                  id="use-cli"
                  checked={localSettings.useCli}
                  onCheckedChange={handleCliToggle}
                  disabled={isTogglingCli}
                /> */}
                <Label
                  htmlFor="use-cli"
                  className="flex items-center space-x-2"
                >
                  Use screenpipe as a CLI
                  <Badge variant="destructive" className="ml-2">
                    Experimental
                  </Badge>
                  <Badge variant="outline" className="ml-1">
                    Expert Only
                  </Badge>
                </Label>
              </div>
              <p className="text-sm text-center text-muted-foreground">
                By default, we run screenpipe in the background for you. Use
                this option only if the status message keep showing red/error
                even after restart.
              </p>
              <div className="flex justify-between mt-2 w-1/2 mx-auto">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 mr-1"
                        onClick={handleStop}
                        disabled={isStopping || isStarting}
                      >
                        {isStopping ? spinner : null}
                        {isStopping ? "Stopping..." : "Stop"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>This will kill any screenpipe instance running</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 ml-1"
                        onClick={handleStart}
                        disabled={isStopping || isStarting}
                      >
                        {isStarting ? spinner : null}
                        {isStarting ? "Starting..." : "Start"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        This will start a screenpipe instance in the background
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-sm text-center text-muted-foreground">
                Press stop then copy and paste this in your terminal and press
                enter:
              </p>
              <CodeBlock
                language="bash"
                value={`brew tap louis030195/screen-pipe https://github.com/louis030195/screen-pipe.git
brew install screenpipe
screenpipe`}
              />
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
