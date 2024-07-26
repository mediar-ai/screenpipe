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

export function Settings({ className }: { className?: string }) {
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = React.useState(settings);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSettings({ ...localSettings, openaiApiKey: e.target.value });
    updateSettings({ ...localSettings, openaiApiKey: e.target.value });
  };

  const handleOllamaToggle = (checked: boolean) => {
    console.log("checked", checked);
    setLocalSettings({ ...localSettings, useOllama: checked });
    updateSettings({ ...localSettings, useOllama: checked });
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
        <Button variant="outline" className={className}>
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>AI Settings</DialogTitle>
          <DialogDescription>
            Choose your AI provider and enter necessary credentials.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
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
                  </Label>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  toggle to use ollama instead of openai api. make sure to have
                  ollama running locally.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center space-x-4">
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
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="apiKey" className="text-right">
              OpenAI API Key
            </Label>
            <Input
              id="apiKey"
              value={settings.openaiApiKey}
              onChange={handleApiKeyChange}
              className="col-span-3"
              placeholder="Enter your OpenAI API Key"
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
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
      </DialogContent>
    </Dialog>
  );
}
