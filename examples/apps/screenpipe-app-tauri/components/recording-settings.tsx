import React, { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Check,
  ChevronsUpDown,
  Eye,
  HelpCircle,
  Mic,
  Monitor,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "./ui/command";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, useSettings } from "@/lib/hooks/use-settings";
import { useToast } from "@/components/ui/use-toast";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { invoke } from "@tauri-apps/api/core";
import { Badge } from "./ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";

interface AudioDevice {
  name: string;
  is_default: boolean;
}

interface MonitorDevice {
  id: string;
  name: string;
  is_default: boolean;
  width: number;
  height: number;
}

export function RecordingSettings({
  localSettings,
  setLocalSettings,
  currentPlatform,
}: {
  localSettings: Settings;
  setLocalSettings: (settings: Settings) => void;
  currentPlatform: string;
}) {
  const { settings, updateSettings } = useSettings();
  const [openAudioDevices, setOpenAudioDevices] = React.useState(false);
  const [availableMonitors, setAvailableMonitors] = useState<MonitorDevice[]>(
    []
  );
  const [availableAudioDevices, setAvailableAudioDevices] = useState<
    AudioDevice[]
  >([]);
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const { health } = useHealthCheck();
  const isDisabled = health?.status_code === 500;
  useEffect(() => {
    const loadDevices = async () => {
      try {
        // Fetch monitors
        const monitorsResponse = await fetch(
          "http://localhost:3030/vision/list",
          {
            method: "POST",
          }
        );
        if (!monitorsResponse.ok) {
          throw new Error("Failed to fetch monitors");
        }
        const monitors: MonitorDevice[] = await monitorsResponse.json();
        console.log("monitors", monitors);
        setAvailableMonitors(monitors);

        // Fetch audio devices
        const audioDevicesResponse = await fetch(
          "http://localhost:3030/audio/list"
        );
        if (!audioDevicesResponse.ok) {
          throw new Error("Failed to fetch audio devices");
        }
        const audioDevices: AudioDevice[] = await audioDevicesResponse.json();
        console.log("audioDevices", audioDevices);
        setAvailableAudioDevices(audioDevices);

        console.log("localSettings", localSettings);
        // Update local settings if current values are default
        if (localSettings.monitorId === "default" && monitors.length > 0) {
          setLocalSettings({
            ...localSettings,
            monitorId: monitors.find((monitor) => monitor.is_default)?.id!,
          });
        }
        if (
          localSettings.audioDevices.length === 1 &&
          localSettings.audioDevices[0] === "default" &&
          audioDevices.length > 0
        ) {
          setLocalSettings({
            ...localSettings,
            audioDevices: audioDevices
              .filter((device) => device.is_default)
              .map((device) => device.name),
          });
        }
      } catch (error) {
        console.error("Failed to load devices:", error);
      }
    };

    loadDevices();
  }, [localSettings, setLocalSettings]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    toast({
      title: "Updating screenpipe recording settings",
      description: "This may take a few moments...",
    });

    try {
      console.log("localSettings", localSettings);
      // Only update specific fields
      const settingsToUpdate = {
        audioTranscriptionEngine: localSettings.audioTranscriptionEngine,
        ocrEngine: localSettings.ocrEngine,
        monitorId: localSettings.monitorId,
        audioDevices: localSettings.audioDevices,
        usePiiRemoval: localSettings.usePiiRemoval,
        restartInterval: localSettings.restartInterval,
        disableAudio: localSettings.disableAudio,
        ignoredWindows: localSettings.ignoredWindows,
        includedWindows: localSettings.includedWindows,
      };
      console.log("Settings to update:", settingsToUpdate);
      await updateSettings(settingsToUpdate);

      await invoke("kill_all_sreenpipes");

      // Start a new instance with updated settings
      await invoke("spawn_screenpipe");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      toast({
        title: "Settings updated successfully",
        description: "Screenpipe has been restarted with new settings.",
      });
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast({
        title: "Error updating settings",
        description: "Please try again or check the logs for more information.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddIgnoredWindow = (value: string) => {
    if (value && !localSettings.ignoredWindows.includes(value)) {
      setLocalSettings({
        ...localSettings,
        ignoredWindows: [...localSettings.ignoredWindows, value],
      });
    }
  };

  const handleRemoveIgnoredWindow = (value: string) => {
    setLocalSettings({
      ...localSettings,
      ignoredWindows: localSettings.ignoredWindows.filter((w) => w !== value),
    });
  };

  const handleAddIncludedWindow = (value: string) => {
    if (value && !localSettings.includedWindows.includes(value)) {
      setLocalSettings({
        ...localSettings,
        includedWindows: [...localSettings.includedWindows, value],
      });
    }
  };

  const handleRemoveIncludedWindow = (value: string) => {
    setLocalSettings({
      ...localSettings,
      includedWindows: localSettings.includedWindows.filter((w) => w !== value),
    });
  };

  const handleAudioTranscriptionModelChange = (value: string) => {
    setLocalSettings({ ...localSettings, audioTranscriptionEngine: value });
  };

  const handleOcrModelChange = (value: string) => {
    setLocalSettings({ ...localSettings, ocrEngine: value });
  };

  const handleMonitorChange = (value: string) => {
    setLocalSettings({ ...localSettings, monitorId: value });
  };

  const handleAudioDeviceChange = (currentValue: string) => {
    const updatedDevices = localSettings.audioDevices.includes(currentValue)
      ? localSettings.audioDevices.filter((device) => device !== currentValue)
      : [...localSettings.audioDevices, currentValue];

    setLocalSettings({ ...localSettings, audioDevices: updatedDevices });
  };

  const handlePiiRemovalChange = (checked: boolean) => {
    setLocalSettings({ ...localSettings, usePiiRemoval: checked });
  };

  const handleRestartIntervalChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newValue = parseInt(e.target.value, 10);
    setLocalSettings({ ...localSettings, restartInterval: newValue });
  };

  const handleDisableAudioChange = (checked: boolean) => {
    setLocalSettings({ ...localSettings, disableAudio: checked });
  };

  return (
    <>
      <div className="relative">
        {!isUpdating && isDisabled && (
          <Card className="p-16 shadow-lg w-fit absolute bottom-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-center font-bold text-xl mb-4 ">
            <CardTitle>
              make sure to turn off dev mode and start screenpipe recorder first
              (go to status)
            </CardTitle>
          </Card>
        )}
        <Card className={cn(isDisabled && "opacity-50 pointer-events-none")}>
          <CardHeader>
            <CardTitle className="text-center">recording settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col space-y-2">
              <Label
                htmlFor="audioTranscriptionModel"
                className="flex items-center space-x-2"
              >
                <Mic className="h-4 w-4" />
                <span>audio transcription model</span>
              </Label>
              <Select
                onValueChange={handleAudioTranscriptionModelChange}
                defaultValue={localSettings.audioTranscriptionEngine}
              >
                <SelectTrigger>
                  <SelectValue placeholder="select audio transcription engine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepgram">
                    <div className="flex items-center justify-between w-full space-x-2">
                      <span>deepgram</span>
                      <Badge variant="secondary">cloud</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="whisper-tiny">whisper-tiny</SelectItem>
                  <SelectItem value="whisper-large">whisper-large</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-2">
              <Label htmlFor="ocrModel" className="flex items-center space-x-2">
                <Eye className="h-4 w-4" />
                <span>ocr model</span>
              </Label>
              <Select
                onValueChange={handleOcrModelChange}
                defaultValue={localSettings.ocrEngine}
              >
                <SelectTrigger>
                  <SelectValue placeholder="select ocr engine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unstructured">
                    <div className="flex items-center justify-between w-full space-x-2">
                      <span>unstructured</span>
                      <Badge variant="secondary">cloud</Badge>
                    </div>
                  </SelectItem>
                  {currentPlatform !== "macos" && (
                    <SelectItem value="tesseract">tesseract</SelectItem>
                  )}
                  {currentPlatform === "windows" && (
                    <SelectItem value="windows-native">
                      windows native
                    </SelectItem>
                  )}
                  {currentPlatform === "macos" && (
                    <SelectItem value="apple-native">apple native</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-2">
              <Label
                htmlFor="monitorId"
                className="flex items-center space-x-2"
              >
                <Monitor className="h-4 w-4" />
                <span>monitor</span>
              </Label>
              <Select
                onValueChange={handleMonitorChange}
                defaultValue={localSettings.monitorId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="select monitor" />
                </SelectTrigger>
                <SelectContent>
                  {availableMonitors.map((monitor) => (
                    <SelectItem key={monitor.id} value={monitor.id}>
                      {monitor.id}. {monitor.name}{" "}
                      {monitor.is_default ? "(default)" : ""} - {monitor.width}x
                      {monitor.height}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col space-y-2">
              <Label
                htmlFor="audioDevices"
                className="flex items-center space-x-2"
              >
                <Mic className="h-4 w-4" />
                <span>audio devices</span>
              </Label>
              <Popover
                open={openAudioDevices}
                onOpenChange={setOpenAudioDevices}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openAudioDevices}
                    className="w-full justify-between"
                  >
                    {localSettings.audioDevices.length > 0
                      ? `${localSettings.audioDevices.length} device(s) selected`
                      : "select audio devices"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="search audio devices..." />
                    <CommandList>
                      <CommandEmpty>no audio device found.</CommandEmpty>
                      <CommandGroup>
                        {availableAudioDevices.map((device) => (
                          <CommandItem
                            key={device.name}
                            value={device.name}
                            onSelect={handleAudioDeviceChange}
                          >
                            <div className="flex items-center">
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  localSettings.audioDevices.includes(
                                    device.name
                                  )
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              <span>
                                {device.name}{" "}
                                {device.is_default ? "(default)" : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col space-y-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="piiRemoval"
                  checked={localSettings.usePiiRemoval}
                  onCheckedChange={handlePiiRemovalChange}
                />
                <Label
                  htmlFor="piiRemoval"
                  className="flex items-center space-x-2"
                >
                  <span>remove personal information (PII)</span>
                  <Badge variant="outline" className="ml-2">
                    experimental
                  </Badge>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          removes sensitive information like credit card
                          numbers, emails, and phone numbers from OCR text
                          <br />
                          before saving to the database or returning in search
                          results
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
              </div>
            </div>
            <div className="flex flex-col space-y-2">
              <Label
                htmlFor="restartInterval"
                className="flex items-center space-x-2"
              >
                <span>restart interval (minutes)</span>
                <Badge variant="outline" className="ml-2">
                  experimental
                </Badge>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        set how often the recording process should restart.
                        <br />
                        0 means no automatic restart.
                        <br />
                        this can help mitigate potential memory leaks or other
                        issues.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Input
                id="restartInterval"
                type="number"
                min="0"
                value={localSettings.restartInterval}
                onChange={handleRestartIntervalChange}
                className="w-full"
                placeholder="Enter restart interval in minutes (0 to disable)"
              />
            </div>

            <div className="flex flex-col space-y-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="disableAudio"
                  checked={localSettings.disableAudio}
                  onCheckedChange={handleDisableAudioChange}
                />
                <Label
                  htmlFor="disableAudio"
                  className="flex items-center space-x-2"
                >
                  <span>disable audio recording</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          useful if you don&apos;t need audio or if you have
                          memory/CPU issues
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
              </div>
            </div>

            <div className="flex flex-col space-y-2">
              <Label
                htmlFor="ignoredWindows"
                className="flex items-center space-x-2"
              >
                <span>ignored windows</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        windows to ignore during screen recording
                        (case-insensitive)
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {localSettings.ignoredWindows.map((window) => (
                  <Badge
                    key={window}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    {window}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleRemoveIgnoredWindow(window)}
                    />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  id="ignoredWindows"
                  placeholder="add window to ignore"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      handleAddIgnoredWindow(e.currentTarget.value);
                      e.currentTarget.value = "";
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    const input = document.getElementById(
                      "ignoredWindows"
                    ) as HTMLInputElement;
                    handleAddIgnoredWindow(input.value);
                    input.value = "";
                  }}
                >
                  add
                </Button>
              </div>
            </div>

            <div className="flex flex-col space-y-2">
              <Label
                htmlFor="includedWindows"
                className="flex items-center space-x-2"
              >
                <span>included windows</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        windows to include during screen recording
                        (case-insensitive)
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {localSettings.includedWindows.map((window) => (
                  <Badge
                    key={window}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    {window}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleRemoveIncludedWindow(window)}
                    />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  id="includedWindows"
                  placeholder="add window to include"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      handleAddIncludedWindow(e.currentTarget.value);
                      e.currentTarget.value = "";
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    const input = document.getElementById(
                      "includedWindows"
                    ) as HTMLInputElement;
                    handleAddIncludedWindow(input.value);
                    input.value = "";
                  }}
                >
                  add
                </Button>
              </div>
            </div>

            <div className="flex flex-col space-y-2">
              <Button
                onClick={handleUpdate}
                disabled={settings.devMode || isUpdating}
              >
                {isUpdating ? "updating..." : "update"}
              </Button>
              <Label className="text-center">
                <span className="text-xs text-gray-500">
                  {settings.devMode
                    ? "not available in dev mode, use CLI args in this case"
                    : "this will restart screenpipe recording process with new settings"}
                </span>
              </Label>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
