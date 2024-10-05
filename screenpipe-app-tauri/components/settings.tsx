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
import { useSettings } from "@/lib/hooks/use-settings";
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

import { Eye, EyeOff, HelpCircle, RefreshCw, Settings2 } from "lucide-react";
import { RecordingSettings } from "./recording-settings";
import { Switch } from "./ui/switch";

export function Settings({ className }: { className?: string }) {
  const { settings, updateSettings, resetSetting } = useSettings();
  const [localSettings, setLocalSettings] = React.useState(settings);
  const [showApiKey, setShowApiKey] = React.useState(false);

  const handleApiUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalSettings({ ...localSettings, aiUrl: newValue });
    updateSettings({ aiUrl: newValue });
  };

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

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) { // hack bcs something does not update settings for some reason 
          window.location.reload();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" className={className}>
          <Settings2 className="mr-2 h-4 w-4" />
          settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[80vw] w-full max-h-[80vh] h-full overflow-y-auto">
        <DialogHeader>
          <DialogTitle>settings</DialogTitle>
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
                    ai url
                  </Label>
                  <div className="flex-grow flex items-center">
                    <Input
                      id="aiUrl"
                      value={localSettings.aiUrl}
                      onChange={handleApiUrlChange}
                      className="flex-grow"
                      placeholder="enter ai url"
                      type="url"
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="ml-2 h-4 w-4 cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p>
                            the url of your ai provider&apos;s api endpoint. for
                            openai:{" "}
                            <pre className="bg-gray-100 p-1 rounded-md">
                              https://api.openai.com/v1
                            </pre>
                            <br />
                            for local providers like ollama usually it&apos;s
                            <pre className="bg-gray-100 p-1 rounded-md">
                              http://localhost:11434/v1
                            </pre>
                            <br />
                            note: on windows, you may need to run ollama with:
                            <pre className="bg-gray-100 p-1 rounded-md">
                              OLLAMA_ORIGINS=* ollama run llama3.2
                            </pre>
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>
              <div className="w-full">
                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="aiApiKey" className="min-w-[80px] text-right">
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
              <div className="w-full">
                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="aiModel" className="min-w-[80px] text-right">
                    ai model
                  </Label>
                  <Input
                    id="aiModel"
                    value={localSettings.aiModel}
                    onChange={handleModelChange}
                    className="flex-grow"
                    placeholder="enter ai model (e.g., gpt-4)"
                    autoCorrect="off"
                    autoCapitalize="off"
                    autoComplete="off"
                  />
                </div>
              </div>

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
                      defaultValue={localSettings.customPrompt}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}