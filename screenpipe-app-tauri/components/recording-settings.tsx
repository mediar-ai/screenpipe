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
import { SqlAutocompleteInput } from "./sql-autocomplete-input";
import {
  Check,
  ChevronsUpDown,
  Eye,
  HelpCircle,
  Languages,
  Mic,
  Monitor,
  Folder,
  AppWindowMac,
  X,
  EyeOff,
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
import { platform } from "@tauri-apps/plugin-os";
import posthog from "posthog-js";
import { trace } from "@opentelemetry/api";
import { initOpenTelemetry } from "@/lib/opentelemetry";
import { Language } from "@/lib/language";
import { open } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import { Command as ShellCommand } from "@tauri-apps/plugin-shell";
import { CliCommandDialog } from "./cli-command-dialog";
import { ToastAction } from "@/components/ui/toast";
import { useUser } from "@/lib/hooks/use-user";
import { open as openUrl } from "@tauri-apps/plugin-shell";
type PermissionsStatus = {
  screenRecording: string;
  microphone: string;
  accessibility: string;
};

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
  const { settings, updateSettings, getDataDir } = useSettings();
  const [openAudioDevices, setOpenAudioDevices] = React.useState(false);
  const [openMonitors, setOpenMonitors] = React.useState(false);
  const [openLanguages, setOpenLanguages] = React.useState(false);
  const [dataDirInputVisible, setDataDirInputVisible] = React.useState(false);
  const [clickTimeout, setClickTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [windowsForIgnore, setWindowsForIgnore] = useState("");
  const [windowsForInclude, setWindowsForInclude] = useState("");

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
  const [isMacOS, setIsMacOS] = useState(false);
  const [isSetupRunning, setIsSetupRunning] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const { user } = useUser();
  const { credits } = user || {};

  useEffect(() => {
    const checkPlatform = async () => {
      const currentPlatform = platform();
      setIsMacOS(currentPlatform === "macos");
    };
    checkPlatform();
  }, []);

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
        disableAudio: localSettings.disableAudio,
        ignoredWindows: localSettings.ignoredWindows,
        includedWindows: localSettings.includedWindows,
        deepgramApiKey: localSettings.deepgramApiKey,
        fps: localSettings.fps,
        vadSensitivity: localSettings.vadSensitivity,
        audioChunkDuration: localSettings.audioChunkDuration,
        analyticsEnabled: localSettings.analyticsEnabled,
        useChineseMirror: localSettings.useChineseMirror,
        languages: localSettings.languages,
        enableBeta: localSettings.enableBeta,
        enableFrameCache: localSettings.enableFrameCache,
        enableUiMonitoring: localSettings.enableUiMonitoring,
        dataDir: localSettings.dataDir,
        port: localSettings.port,
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
        const isDebug = process.env.TAURI_ENV_DEBUG === "true";
        if (!isDebug) {
          posthog.opt_in_capturing();
          posthog.capture("telemetry", {
            enabled: true,
          });
          initOpenTelemetry("82688", new Date().toISOString());

          // enable opentelemetry
          console.log("telemetry enabled");
        }
      }

      await invoke("kill_all_sreenpipes");

      // Start a new instance with updated settings
      await invoke("spawn_screenpipe");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      toast({
        title: "settings updated successfully",
        description: "screenpipe has been restarted with new settings.",
      });
    } catch (error) {
      console.error("failed to update settings:", error);
      toast({
        title: "error updating settings",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddIgnoredWindow = (value: string) => {
    const lowerCaseValue = value.toLowerCase();
    if (
      value &&
      !localSettings.ignoredWindows
        .map((w) => w.toLowerCase())
        .includes(lowerCaseValue)
    ) {
      setLocalSettings({
        ...localSettings,
        ignoredWindows: [...localSettings.ignoredWindows, value],
        includedWindows: localSettings.includedWindows.filter(
          (w) => w.toLowerCase() !== lowerCaseValue
        ),
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
    const lowerCaseValue = value.toLowerCase();
    if (
      value &&
      !localSettings.includedWindows
        .map((w) => w.toLowerCase())
        .includes(lowerCaseValue)
    ) {
      setLocalSettings({
        ...localSettings,
        includedWindows: [...localSettings.includedWindows, value],
        ignoredWindows: localSettings.ignoredWindows.filter(
          (w) => w.toLowerCase() !== lowerCaseValue
        ),
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
    if (value === "screenpipe-cloud" && !credits?.amount) {
      openUrl("https://buy.stripe.com/5kA6p79qefweacg5kJ");
      return;
    }

    if (value === "screenpipe-cloud") {
      setLocalSettings({
        ...localSettings,
        audioTranscriptionEngine: value,
      });
    } else {
      setLocalSettings({ ...localSettings, audioTranscriptionEngine: value });
    }
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

  const handleLanguageChange = (currentValue: Language) => {
    const updatedLanguages = localSettings.languages.includes(currentValue)
      ? localSettings.languages.filter((id) => id !== currentValue)
      : [...localSettings.languages, currentValue];

    setLocalSettings({ ...localSettings, languages: updatedLanguages });
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

  const renderOcrEngineOptions = () => {
    const currentPlatform = platform();
    return (
      <>
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

  const handleChineseMirrorToggle = async (checked: boolean) => {
    setLocalSettings({ ...localSettings, useChineseMirror: checked });
    if (checked) {
      // Trigger setup when the toggle is turned on
      await runSetup();
    }
  };

  const handleDataDirChange = async () => {
    if (clickTimeout) {
      // Double Click
      clearTimeout(clickTimeout);
      setClickTimeout(null);
      setDataDirInputVisible(true);
    } else {
      const timeout = setTimeout(() => {
        // Single Click
        selectDataDir();
        setClickTimeout(null);
      }, 250);
      setClickTimeout(timeout);
    }

    async function selectDataDir() {
      try {
        const dataDir = await getDataDir();

        const selected = await open({
          directory: true,
          multiple: false,
          defaultPath: dataDir,
        });
        // TODO: check permission of selected dir for server to write into

        if (selected) {
          setLocalSettings({ ...localSettings, dataDir: selected });
        } else {
          console.log("canceled");
        }
      } catch (error) {
        console.error("failed to change data directory:", error);
        toast({
          title: "error",
          description: "failed to change data directory.",
          variant: "destructive",
          duration: 3000,
        });
      }
    }
  };

  const handleDataDirInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newValue = e.target.value;
    setLocalSettings({ ...localSettings, dataDir: newValue });
  };

  const handleDataDirInputBlur = () => {
    console.log("wcw blur");
    setDataDirInputVisible(false);
    validateDataDirInput();
  };

  const handleDataDirInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter") {
      setDataDirInputVisible(false);
      validateDataDirInput();
    }
  };

  const validateDataDirInput = async () => {
    try {
      if (await exists(localSettings.dataDir)) {
        return;
      }
    } catch (err) {}

    toast({
      title: "error",
      description: "failed to change data directory.",
      variant: "destructive",
      duration: 3000,
    });

    setLocalSettings({ ...localSettings, dataDir: settings.dataDir });
  };

  const runSetup = async () => {
    setIsSetupRunning(true);
    try {
      const command = ShellCommand.sidecar("screenpipe", ["setup"]);
      const child = await command.spawn();

      toast({
        title: "Setting up Chinese mirror",
        description: "This may take a few minutes...",
      });

      const outputPromise = new Promise<string>((resolve, reject) => {
        command.on("close", (data) => {
          if (data.code !== 0) {
            reject(new Error(`Command failed with code ${data.code}`));
          }
        });
        command.on("error", (error) => reject(new Error(error)));
        command.stdout.on("data", (line) => {
          console.log(line);
          if (line.includes("screenpipe setup complete")) {
            resolve("ok");
          }
        });
      });

      const timeoutPromise = new Promise(
        (_, reject) =>
          setTimeout(() => reject(new Error("Setup timed out")), 900000) // 15 minutes
      );

      const result = await Promise.race([outputPromise, timeoutPromise]);

      if (result === "ok") {
        toast({
          title: "Chinese mirror setup complete",
          description: "You can now use the Chinese mirror for downloads.",
        });
      } else {
        throw new Error("Setup failed or timed out");
      }
    } catch (error) {
      console.error("Error setting up Chinese mirror:", error);
      toast({
        title: "Error setting up Chinese mirror",
        description: "Please try again or check the logs for more information.",
        variant: "destructive",
      });
      // Revert the toggle if setup fails
      setLocalSettings({ ...localSettings, useChineseMirror: false });
    } finally {
      setIsSetupRunning(false);
    }
  };

  const handleFrameCacheToggle = (checked: boolean) => {
    setLocalSettings({
      ...localSettings,
      enableFrameCache: checked,
    });
  };

  const handleUiMonitoringToggle = async (checked: boolean) => {
    try {
      if (checked) {
        // Check accessibility permissions first
        const perms = await invoke<PermissionsStatus>("do_permissions_check", {
          initialCheck: false,
        });
        if (!perms.accessibility) {
          toast({
            title: "accessibility permission required",
            description:
              "please grant accessibility permission in system preferences",
            action: (
              <ToastAction
                altText="open preferences"
                onClick={() => invoke("open_accessibility_preferences")}
              >
                open preferences
              </ToastAction>
            ),
            variant: "destructive",
          });
          return;
        }
      }

      // Just update the local setting - the update button will handle the restart
      setLocalSettings({
        ...localSettings,
        enableUiMonitoring: checked,
      });
    } catch (error) {
      console.error("failed to toggle ui monitoring:", error);
      toast({
        title: "error checking accessibility permissions",
        description: "please try again or check the logs",
        variant: "destructive",
      });
    }
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
              <div className="flex space-x-2">
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
                <CliCommandDialog localSettings={localSettings} />
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
                value={localSettings.audioTranscriptionEngine}
              >
                <SelectTrigger>
                  <SelectValue placeholder="select audio transcription engine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="screenpipe-cloud">
                    <div className="flex items-center justify-between w-full space-x-2">
                      <span>screenpipe cloud</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">cloud</Badge>
                        {!credits?.amount && (
                          <Badge variant="outline" className="text-xs">
                            get credits
                          </Badge>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="deepgram">
                    <div className="flex items-center justify-between w-full space-x-2">
                      <span>deepgram</span>
                      <Badge variant="secondary">cloud</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="whisper-tiny">whisper-tiny</SelectItem>
                  <SelectItem value="whisper-large">whisper-large</SelectItem>
                  <SelectItem value="whisper-large-v3-turbo">
                    whisper-large-turbo
                  </SelectItem>
                </SelectContent>
              </Select>

              {localSettings.audioTranscriptionEngine === "deepgram" && (
                <div className="mt-2">
                  <div className="flex items-center gap-4">
                    <Label
                      htmlFor="deepgramApiKey"
                      className="min-w-[80px] text-right"
                    >
                      api key
                    </Label>
                    <div className="flex-grow relative">
                      <Input
                        id="deepgramApiKey"
                        type={showApiKey ? "text" : "password"}
                        value={localSettings.deepgramApiKey}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setLocalSettings({
                            ...localSettings,
                            deepgramApiKey: newValue,
                          });
                          updateSettings({ deepgramApiKey: newValue });
                        }}
                        className="pr-10 w-full"
                        placeholder="enter your deepgram api key"
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
                  <p className="mt-2 text-sm text-center text-muted-foreground">
                    don&apos;t have an api key? get one from{" "}
                    <a
                      href="https://console.deepgram.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      deepgram&apos;s website
                    </a>{" "}
                    or use screenpipe cloud
                  </p>
                </div>
              )}
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
              <Label
                htmlFor="languages"
                className="flex items-center space-x-2"
              >
                <Languages className="h-4 w-4" />
                <span>languages</span>
              </Label>
              <Popover open={openLanguages} onOpenChange={setOpenLanguages}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openLanguages}
                    className="w-full justify-between"
                  >
                    {localSettings.languages.length > 0
                      ? `${localSettings.languages.join(", ")}`
                      : "select languages"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="search languages..." />
                    <CommandList>
                      <CommandEmpty>no language found.</CommandEmpty>
                      <CommandGroup>
                        {Object.entries(Language).map(([language, id]) => (
                          <CommandItem
                            key={language}
                            value={language}
                            onSelect={() => handleLanguageChange(id)}
                          >
                            <div className="flex items-center">
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  localSettings.languages.includes(id)
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
                                {language}
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
                htmlFor="monitorIds"
                className="flex items-center space-x-2"
              >
                <Folder className="h-4 w-4" />
                <span>data directory</span>
              </Label>

              {!dataDirInputVisible ? (
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                  onClick={handleDataDirChange}
                >
                  <div className="inline-block flex gap-4">
                    {!!settings.dataDir
                      ? "change directory"
                      : "select directory"}
                    {localSettings.dataDir === settings.dataDir ? (
                      <span className="text-muted-foreground text-sm">
                        {" "}
                        current at: {settings.dataDir || "default directory"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        {" "}
                        change to:{" "}
                        {localSettings.dataDir || "default directory"}
                      </span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              ) : (
                <Input
                  id="dataDir"
                  type="text"
                  autoFocus={true}
                  value={localSettings.dataDir}
                  onChange={handleDataDirInputChange}
                  onBlur={handleDataDirInputBlur}
                  onKeyDown={handleDataDirInputKeyDown}
                ></Input>
              )}
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
                <SqlAutocompleteInput
                  id="ignoredWindows"
                  type="window"
                  icon={<AppWindowMac className="h-4 w-4" />}
                  value={windowsForIgnore}
                  onChange={(value) => setWindowsForIgnore(value)}
                  placeholder="add windows to ignore"
                  className="flex-grow"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddIgnoredWindow(windowsForIgnore);
                      setWindowsForIgnore("");
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    handleAddIgnoredWindow(windowsForIgnore);
                    setWindowsForIgnore("");
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
                <SqlAutocompleteInput
                  id="includedWindows"
                  type="window"
                  icon={<AppWindowMac className="h-4 w-4" />}
                  value={windowsForInclude}
                  onChange={(value) => setWindowsForInclude(value)}
                  placeholder="add window to include"
                  className="flex-grow"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddIncludedWindow(windowsForInclude);
                      setWindowsForInclude("");
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    handleAddIncludedWindow(windowsForInclude);
                    setWindowsForInclude("");
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
            <div className="flex items-center space-x-2">
              <Switch
                id="chinese-mirror-toggle"
                checked={localSettings.useChineseMirror}
                onCheckedChange={handleChineseMirrorToggle}
              />
              <Label
                htmlFor="chinese-mirror-toggle"
                className="flex items-center space-x-2"
              >
                <span>use chinese mirror for model downloads</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>
                        enable this option to use a chinese mirror for
                        <br />
                        downloading Hugging Face models
                        <br />
                        (e.g. Whisper, embedded Llama, etc.)
                        <br />
                        which are blocked in mainland China.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
            </div>
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="frame-cache-toggle"
                    checked={localSettings.enableFrameCache}
                    onCheckedChange={handleFrameCacheToggle}
                  />
                  <Label
                    htmlFor="frame-cache-toggle"
                    className="flex items-center space-x-2"
                  >
                    <span>enable timeline UI</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-4 w-4 cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>
                            experimental feature that provides a timeline UI
                            (like rewind.ai).
                            <br />
                            may increase CPU usage and memory consumption.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                </div>
              </div>
            </div>
            {isMacOS && (
              <div className="flex items-center space-x-2">
                <Switch
                  id="ui-monitoring-toggle"
                  checked={localSettings.enableUiMonitoring}
                  onCheckedChange={handleUiMonitoringToggle}
                />
                <Label
                  htmlFor="ui-monitoring-toggle"
                  className="flex items-center space-x-2"
                >
                  <span>enable UI monitoring</span>
                  <Badge variant="outline" className="ml-2">
                    accessibility permissions
                  </Badge>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 cursor-default" />
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>
                          enables monitoring of UI elements and their
                          interactions.
                          <br />
                          this allows for better context in search results
                          <br />* requires accessibility permission
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
              </div>
            )}
            {/* <div className="flex flex-col space-y-2">
              <Label htmlFor="port" className="flex items-center space-x-2">
                <span>server port</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>
                        port number for the screenpipe server.
                        <br />
                        default is 3030. change only if you have port conflicts.
                        <br />
                        requires restart to take effect.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="flex items-center space-x-4">
                <Input
                  id="port"
                  type="number"
                  min={1024}
                  max={65535}
                  value={localSettings.port}
                  onChange={(e) => {
                    const port = parseInt(e.target.value);
                    if (!isNaN(port) && port >= 1024 && port <= 65535) {
                      setLocalSettings({
                        ...localSettings,
                        port: port,
                      });
                    }
                  }}
                  className="w-32"
                />
              </div>
            </div> */}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
