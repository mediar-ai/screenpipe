"use client";

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
import { cn, getCliPath } from "@/lib/utils";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "./ui/command";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Settings,
  useSettings,
  VadSensitivity,
} from "@/lib/hooks/use-settings";
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
import { Slider } from "./ui/slider";
import { IconCode } from "./ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { CodeBlock } from "./ui/codeblock";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { platform } from "@tauri-apps/plugin-os";
import posthog from "posthog-js";
import { trace } from "@opentelemetry/api";

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
}: {
  localSettings: Settings;
  setLocalSettings: (settings: Settings) => void;
}) {
  const { settings, updateSettings } = useSettings();
  const [openAudioDevices, setOpenAudioDevices] = React.useState(false);
  const [openMonitors, setOpenMonitors] = React.useState(false);

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
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);
  const { copyToClipboard } = useCopyToClipboard({ timeout: 2000 });

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

        // Update monitors
        const availableMonitorIds = monitors.map((monitor) =>
          monitor.id.toString()
        );
        let updatedMonitorIds = localSettings.monitorIds.filter((id) =>
          availableMonitorIds.includes(id)
        );

        if (
          updatedMonitorIds.length === 0 ||
          (localSettings.monitorIds.length === 1 &&
            localSettings.monitorIds[0] === "default" &&
            monitors.length > 0)
        ) {
          updatedMonitorIds = [
            monitors.find((monitor) => monitor.is_default)!.id!.toString(),
          ];
        }

        // Update audio devices
        const availableAudioDeviceNames = audioDevices.map(
          (device) => device.name
        );
        let updatedAudioDevices = localSettings.audioDevices.filter((device) =>
          availableAudioDeviceNames.includes(device)
        );

        if (
          updatedAudioDevices.length === 0 ||
          (localSettings.audioDevices.length === 1 &&
            localSettings.audioDevices[0] === "default" &&
            audioDevices.length > 0)
        ) {
          updatedAudioDevices = audioDevices
            .filter((device) => device.is_default)
            .map((device) => device.name);
        }

        setLocalSettings({
          ...localSettings,
          monitorIds: updatedMonitorIds,
          audioDevices: updatedAudioDevices,
        });
      } catch (error) {
        console.error("Failed to load devices:", error);
      }
    };

    loadDevices();
  }, [settings]);

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
        monitorIds: localSettings.monitorIds,
        audioDevices: localSettings.audioDevices,
        usePiiRemoval: localSettings.usePiiRemoval,
        restartInterval: localSettings.restartInterval,
        disableAudio: localSettings.disableAudio,
        ignoredWindows: localSettings.ignoredWindows,
        includedWindows: localSettings.includedWindows,
        deepgramApiKey: localSettings.deepgramApiKey,
        fps: localSettings.fps,
        vadSensitivity: localSettings.vadSensitivity,
        audioChunkDuration: localSettings.audioChunkDuration,
        analyticsEnabled: localSettings.analyticsEnabled,
      };
      console.log("Settings to update:", settingsToUpdate);
      await updateSettings(settingsToUpdate);

      if (!localSettings.analyticsEnabled) {
        posthog.capture("telemetry", {
          enabled: false,
        });
        // disable opentelemetry
        trace.disable();
        posthog.opt_out_capturing();
        console.log("telemetry disabled");
      } else {
        posthog.opt_in_capturing();
        posthog.capture("telemetry", {
          enabled: true,
        });
        // enable opentelemetry
        console.log("telemetry enabled");
      }

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

  const handleMonitorChange = (currentValue: string) => {
    const updatedMonitors = localSettings.monitorIds.includes(currentValue)
      ? localSettings.monitorIds.filter((id) => id !== currentValue)
      : [...localSettings.monitorIds, currentValue];

    setLocalSettings({ ...localSettings, monitorIds: updatedMonitors });
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

  const handleFpsChange = (value: number[]) => {
    setLocalSettings({ ...localSettings, fps: value[0] });
  };

  const handleVadSensitivityChange = (value: number[]) => {
    const sensitivityMap: { [key: number]: VadSensitivity } = {
      2: "high",
      1: "medium",
      0: "low",
    };
    setLocalSettings({
      ...localSettings,
      vadSensitivity: sensitivityMap[value[0]],
    });
  };

  const vadSensitivityToNumber = (sensitivity: VadSensitivity): number => {
    const sensitivityMap: { [key in VadSensitivity]: number } = {
      high: 2,
      medium: 1,
      low: 0,
    };
    return sensitivityMap[sensitivity];
  };

  const handleAudioChunkDurationChange = (value: number[]) => {
    setLocalSettings({ ...localSettings, audioChunkDuration: value[0] });
  };

  const generateCliCommand = () => {
    const cliPath = getCliPath();
    let args = [];

    if (localSettings.audioTranscriptionEngine !== "default") {
      args.push(
        `--audio-transcription-engine ${localSettings.audioTranscriptionEngine}`
      );
    }
    if (localSettings.ocrEngine !== "default") {
      args.push(`--ocr-engine ${localSettings.ocrEngine}`);
    }
    if (
      localSettings.monitorIds.length > 0 &&
      localSettings.monitorIds[0] !== "default"
    ) {
      localSettings.monitorIds.forEach((id) => args.push(`--monitor-id ${id}`));
    }
    if (
      localSettings.audioDevices.length > 0 &&
      localSettings.audioDevices[0] !== "default"
    ) {
      localSettings.audioDevices.forEach((device) =>
        args.push(`--audio-device "${device}"`)
      );
    }
    if (localSettings.usePiiRemoval) {
      args.push("--use-pii-removal");
    }
    if (localSettings.restartInterval > 0) {
      args.push(`--restart-interval ${localSettings.restartInterval}`);
    }
    if (localSettings.disableAudio) {
      args.push("--disable-audio");
    }
    localSettings.ignoredWindows.forEach((window) =>
      args.push(`--ignored-windows "${window}"`)
    );
    localSettings.includedWindows.forEach((window) =>
      args.push(`--included-windows "${window}"`)
    );
    if (
      localSettings.deepgramApiKey &&
      localSettings.deepgramApiKey !== "default"
    ) {
      args.push(`--deepgram-api-key "${localSettings.deepgramApiKey}"`);
    }
    if (localSettings.fps !== 0.2) {
      args.push(`--fps ${localSettings.fps}`);
    }
    if (localSettings.vadSensitivity !== "high") {
      args.push(`--vad-sensitivity ${localSettings.vadSensitivity}`);
    }

    return `${cliPath} ${args.join(" ")}`;
  };

  const handleCopyCliCommand = () => {
    const command = generateCliCommand();
    copyToClipboard(command);
    toast({
      title: "CLI command copied",
      description: "The CLI command has been copied to your clipboard.",
    });
  };

  const renderOcrEngineOptions = () => {
    const currentPlatform = platform();
    return (
      <>
        {/* <SelectItem value="unstructured">
          <div className="flex items-center justify-between w-full space-x-2">
            <span>unstructured</span>
            <Badge variant="secondary">cloud</Badge>
          </div>
        </SelectItem> */}
        {currentPlatform === "linux" && (
          <SelectItem value="tesseract">tesseract</SelectItem>
        )}
        {currentPlatform === "windows" && (
          <SelectItem value="windows-native">windows native</SelectItem>
        )}
        {currentPlatform === "macos" && (
          <SelectItem value="apple-native">apple native</SelectItem>
        )}
      </>
    );
  };

  const handleAnalyticsToggle = (checked: boolean) => {
    const newValue = checked;
    setLocalSettings({ ...localSettings, analyticsEnabled: newValue });
  };

  return (
    <>
      <div className="relative">
        {settings.devMode || (!isUpdating && isDisabled) ? (
          <Card className="p-16 shadow-lg w-fit absolute bottom-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-center font-bold text-xl mb-4 ">
            <CardTitle>
              make sure to turn off dev mode and start screenpipe recorder first
              (go to status)
            </CardTitle>
          </Card>
        ) : (
          <></>
        )}
        <Card className={cn(isDisabled && "opacity-50 pointer-events-none")}>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-center">recording settings</CardTitle>
              <div className="flex  space-x-2">
                <div className="flex flex-col space-y-2">
                  <Button
                    onClick={handleUpdate}
                    disabled={settings.devMode || isUpdating}
                  >
                    {isUpdating ? "updating..." : "save and restart"}
                  </Button>
                  {settings.devMode ? (
                    <span className="text-xs text-gray-500 text-center">
                      not available in dev mode, use CLI args in this case
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500 text-center">
                      this will restart screenpipe recording process with new
                      settings
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsCopyDialogOpen(true)}
                >
                  <IconCode className="h-4 w-4" />
                </Button>
              </div>
            </div>
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
                <SelectContent>{renderOcrEngineOptions()}</SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-2">
              <Label
                htmlFor="monitorIds"
                className="flex items-center space-x-2"
              >
                <Monitor className="h-4 w-4" />
                <span>monitors</span>
              </Label>
              <Popover open={openMonitors} onOpenChange={setOpenMonitors}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openMonitors}
                    className="w-full justify-between"
                  >
                    {localSettings.monitorIds.length > 0
                      ? `${localSettings.monitorIds.length} monitor(s) selected`
                      : "select monitors"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="search monitors..." />
                    <CommandList>
                      <CommandEmpty>no monitor found.</CommandEmpty>
                      <CommandGroup>
                        {availableMonitors.map((monitor) => (
                          <CommandItem
                            key={monitor.id}
                            value={monitor.id}
                            onSelect={() =>
                              handleMonitorChange(monitor.id.toString())
                            }
                          >
                            <div className="flex items-center">
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  localSettings.monitorIds.includes(
                                    monitor.id.toString()
                                  )
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              {/* not selectable */}
                              <span
                                style={{
                                  userSelect: "none",
                                  WebkitUserSelect: "none",
                                  MozUserSelect: "none",
                                  msUserSelect: "none",
                                }}
                              >
                                {monitor.id}. {monitor.name}{" "}
                                {monitor.is_default ? "(default)" : ""} -{" "}
                                {monitor.width}x{monitor.height}
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
                              <span
                                style={{
                                  userSelect: "none",
                                  WebkitUserSelect: "none",
                                  MozUserSelect: "none",
                                  msUserSelect: "none",
                                }}
                              >
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
                        <HelpCircle className="h-4 w-4 cursor-default" />
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
                      <HelpCircle className="h-4 w-4 cursor-default" />
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
                        <HelpCircle className="h-4 w-4 cursor-default" />
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
                      <HelpCircle className="h-4 w-4 cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>
                        windows to ignore during screen recording
                        (case-insensitive), example:
                        <br />
                        - &quot;bit&quot; will ignore &quot;Bitwarden&quot; and
                        &quot;bittorrent&quot;
                        <br />- &quot;incognito&quot; will ignore tabs, windows
                        that contains the word &quot;incognito&quot;
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
                      <HelpCircle className="h-4 w-4 cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>
                        windows to include during screen recording
                        (case-insensitive), example:
                        <br />
                        - &quot;chrome&quot; will match &quot;Google
                        Chrome&quot;
                        <br />- &quot;bitwarden&quot; will match
                        &quot;Bitwarden&quot; and &quot;bittorrent&quot;
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
              <Label htmlFor="fps" className="flex items-center space-x-2">
                <span>frames per second (fps)</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>
                        adjust the recording frame rate. lower values save
                        <br />
                        resources, higher values provide smoother recordings,
                        less likely to miss activity.
                        <br />
                        (we do not use resources if your screen does not change
                        much)
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="flex items-center space-x-4">
                <Slider
                  id="fps"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={[localSettings.fps]}
                  onValueChange={handleFpsChange}
                  className="flex-grow"
                />
                <span className="w-12 text-right">
                  {localSettings.fps.toFixed(1)}
                </span>
              </div>
            </div>

            <div className="flex flex-col space-y-2">
              <Label
                htmlFor="vadSensitivity"
                className="flex items-center space-x-2"
              >
                <span>vad sensitivity</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>
                        adjust the voice activity detection sensitivity.
                        <br />
                        low: more sensitive, catches most speech but may have
                        more false positives.
                        <br />
                        medium: balanced sensitivity.
                        <br />
                        high (recommended): less sensitive, may miss some speech
                        but reduces false positives.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="flex items-center space-x-4">
                <Slider
                  id="vadSensitivity"
                  min={0}
                  max={2}
                  step={1}
                  value={[vadSensitivityToNumber(localSettings.vadSensitivity)]}
                  onValueChange={handleVadSensitivityChange}
                  className="flex-grow"
                />
                <span className="w-16 text-right">
                  {localSettings.vadSensitivity}
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>low</span>
                <span>medium</span>
                <span>high</span>
              </div>
            </div>

            <div className="flex flex-col space-y-2">
              <Label
                htmlFor="audioChunkDuration"
                className="flex items-center space-x-2"
              >
                <span>audio chunk duration (seconds)</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>
                        adjust the duration of each audio chunk.
                        <br />
                        shorter durations may lower resource usage spikes,
                        <br />
                        while longer durations may increase transcription
                        quality.
                        <br />
                        deepgram in general works better than whisper if you
                        want higher quality transcription.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="flex items-center space-x-4">
                <Slider
                  id="audioChunkDuration"
                  min={5}
                  max={3000}
                  step={1}
                  value={[localSettings.audioChunkDuration]}
                  onValueChange={handleAudioChunkDurationChange}
                  className="flex-grow"
                />
                <span className="w-12 text-right">
                  {localSettings.audioChunkDuration} s
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="analytics-toggle"
                checked={localSettings.analyticsEnabled}
                onCheckedChange={handleAnalyticsToggle}
              />
              <Label
                htmlFor="analytics-toggle"
                className="flex items-center space-x-2"
              >
                <span>enable telemetry</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>
                        telemetry helps us improve screenpipe.
                        <br />
                        when enabled, we collect anonymous usage data such as
                        button clicks.
                        <br />
                        we do not collect any screen data, microphone, query
                        data.
                        <br />
                        do not collect any screen data, microphone, query data.
                        <br />
                        read more on our data privacy policy at
                        <br />
                        <a
                          href="https://screenpi.pe/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          https://screenpi.pe/privacy
                        </a>
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
            </div>
          </CardContent>
        </Card>
      </div>
      <Dialog open={isCopyDialogOpen} onOpenChange={setIsCopyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>CLI command</DialogTitle>
            <DialogDescription>
              You can use this CLI command to start Screenpipe with the current
              settings.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <CodeBlock language="bash" value={generateCliCommand()} />
          </div>
          <DialogFooter>
            <Button onClick={handleCopyCliCommand}>Copy to Clipboard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
