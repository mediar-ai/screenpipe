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

  const handleApiUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalSettings((prev) => ({ ...prev, aiUrl: newValue }));
    updateSettings({ aiUrl: newValue });
  };
  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalSettings((prev) => ({ ...prev, openaiApiKey: newValue }));
    updateSettings({ openaiApiKey: newValue });
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
            currentPlatform={currentPlatform}
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
                  <Input
                    id="aiUrl"
                    value={localSettings.aiUrl}
                    onChange={handleApiUrlChange}
                    className="flex-grow"
                    placeholder="enter ai url"
                    type="url"
                  />
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
