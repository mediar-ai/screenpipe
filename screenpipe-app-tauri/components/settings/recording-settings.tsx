"use client";

import React, { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  EyeOff,
  Key,
  Terminal,
  Asterisk,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Command as TauriCommand } from "@tauri-apps/plugin-shell";

import {
  Settings,
  useSettings,
  VadSensitivity,
} from "@/lib/hooks/use-settings";
import { useToast } from "@/components/ui/use-toast";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { invoke } from "@tauri-apps/api/core";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { platform } from "@tauri-apps/plugin-os";
import posthog from "posthog-js";
import { Language } from "@/lib/language";
import { open } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import { ToastAction } from "@/components/ui/toast";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { Separator } from "@/components/ui/separator";
import { MultiSelect } from "@/components/ui/multi-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSqlAutocomplete } from "@/lib/hooks/use-sql-autocomplete";
import * as Sentry from "@sentry/react";
import { defaultOptions } from "tauri-plugin-sentry-api";
import { useLoginDialog } from "../login-dialog";

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

const createWindowOptions = (
  windowItems: { name: string }[],
  existingPatterns: string[]
) => {
  const windowOptions = windowItems
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({
      value: item.name,
      label: item.name,
      icon: AppWindowMac,
    }));

  // Only add custom patterns that aren't already in windowItems
  const customOptions = existingPatterns
    .filter((pattern) => !windowItems.some((item) => item.name === pattern))
    .map((pattern) => ({
      value: pattern,
      label: pattern,
      icon: Asterisk,
    }));

  return [...windowOptions, ...customOptions];
};

export function RecordingSettings() {
  const { settings, updateSettings, getDataDir } = useSettings();
  const [openAudioDevices, setOpenAudioDevices] = React.useState(false);
  const [openLanguages, setOpenLanguages] = React.useState(false);
  const [dataDirInputVisible, setDataDirInputVisible] = React.useState(false);
  const [clickTimeout, setClickTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const { items: windowItems, isLoading: isWindowItemsLoading } =
    useSqlAutocomplete("window");

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
  const [showApiKey, setShowApiKey] = useState(false);
  const { checkLogin } = useLoginDialog();

  // Add new state to track if settings have changed
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Modify setLocalSettings to track changes
  const handleSettingsChange = (
    newSettings: Partial<Settings>,
    restart: boolean = true
  ) => {
    updateSettings(newSettings);
    if (restart) {
      setHasUnsavedChanges(true);
    }
  };

  // Show toast when settings change
  useEffect(() => {
    if (hasUnsavedChanges && !settings.devMode) {
      toast({
        title: "settings changed",
        description: "restart required to apply changes",
        action: (
          <ToastAction
            altText="restart now"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Wrap in setTimeout to ensure event handling is complete
              setTimeout(() => {
                handleUpdate();
              }, 0);
              return false;
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            restart now
          </ToastAction>
        ),
        duration: 50000,
      });
    }
  }, [hasUnsavedChanges]);

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
        // Use sidecar command to fetch monitors
        const monitorCommand = TauriCommand.sidecar("screenpipe", [
          "vision",
          "list",
          "-o",
          "json",
        ]);

        const monitorOutput = await monitorCommand.execute();
        if (monitorOutput.code !== 0) {
          throw new Error(`Failed to fetch monitors: ${monitorOutput.stderr}`);
        }

        // Parse the JSON response which might be in {data: [...], success: true} format
        const monitorResponse = JSON.parse(monitorOutput.stdout);
        const monitors: MonitorDevice[] =
          monitorResponse.data || monitorResponse;
        console.log("monitors", monitors);
        setAvailableMonitors(monitors);

        // Use sidecar command to fetch audio devices
        const audioCommand = TauriCommand.sidecar("screenpipe", [
          "audio",
          "list",
          "-o",
          "json",
        ]);

        const audioOutput = await audioCommand.execute();
        if (audioOutput.code !== 0) {
          throw new Error(
            `Failed to fetch audio devices: ${audioOutput.stderr}`
          );
        }

        // Parse the JSON response which might be in {data: [...], success: true} format
        const audioResponse = JSON.parse(audioOutput.stdout);
        const audioDevices: AudioDevice[] = audioResponse.data || audioResponse;
        console.log("audioDevices", audioDevices);
        setAvailableAudioDevices(audioDevices);

        console.log("settings", settings);

        // Update monitors
        const availableMonitorIds = monitors.map((monitor) =>
          monitor.id.toString()
        );
        let updatedMonitorIds = settings.monitorIds.filter((id) =>
          availableMonitorIds.includes(id)
        );

        if (
          updatedMonitorIds.length === 0 ||
          (settings.monitorIds.length === 1 &&
            settings.monitorIds[0] === "default" &&
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
        let updatedAudioDevices = settings.audioDevices.filter((device) =>
          availableAudioDeviceNames.includes(device)
        );

        if (
          updatedAudioDevices.length === 0 ||
          (settings.audioDevices.length === 1 &&
            settings.audioDevices[0] === "default" &&
            audioDevices.length > 0)
        ) {
          updatedAudioDevices = audioDevices
            .filter((device) => device.is_default)
            .map((device) => device.name);
        }

        handleSettingsChange(
          {
            monitorIds: updatedMonitorIds,
            audioDevices: updatedAudioDevices,
          },
          false
        );
      } catch (error) {
        console.error("Failed to load devices:", error);
      }
    };

    loadDevices();
  }, []);

  const handleUpdate = async () => {
    setIsUpdating(true);
    toast({
      title: "Updating screenpipe recording settings",
      description: "This may take a few moments...",
    });

    try {
      console.log("settings", settings);

      if (!settings.analyticsEnabled) {
        posthog.capture("telemetry", {
          enabled: false,
        });
        // disable opentelemetry
        posthog.opt_out_capturing();
        // disable sentry
        Sentry.close();
        console.log("telemetry disabled");
      } else {
        const isDebug = process.env.TAURI_ENV_DEBUG === "true";
        if (!isDebug) {
          posthog.opt_in_capturing();
          posthog.capture("telemetry", {
            enabled: true,
          });

          // enable opentelemetry
          console.log("telemetry enabled");

          // enable sentry
          Sentry.init({
            ...defaultOptions,
          });
        }
      }

      await invoke("stop_screenpipe");

      await new Promise((resolve) => setTimeout(resolve, 1000));
      // Start a new instance with updated settings
      await invoke("spawn_screenpipe");

      await new Promise((resolve) => setTimeout(resolve, 2000));
      // await relaunch();

      toast({
        title: "settings updated successfully",
        description: "screenpipe has been restarted with new settings.",
      });

      window.location.reload();
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

  const handleAudioTranscriptionModelChange = (
    value: string,
    realtime = false
  ) => {
    const isLoggedIn = checkLogin(settings.user);
    // If trying to use cloud but not logged in
    if (value === "screenpipe-cloud" && !isLoggedIn) {
      return;
    }

    // If trying to use cloud but not subscribed
    if (value === "screenpipe-cloud" && !settings.user?.cloud_subscribed) {
      const clientRefId = `${
        settings.user?.id
      }&customer_email=${encodeURIComponent(settings.user?.email ?? "")}`;
      openUrl(
        `https://buy.stripe.com/7sIdRzbym4RA98c7sX?client_reference_id=${clientRefId}`
      );
      // Revert back to previous value in the Select component
      return;
    }

    // Only proceed with the change if all checks pass
    const newSettings = realtime
      ? { realtimeAudioTranscriptionEngine: value }
      : { audioTranscriptionEngine: value };
    handleSettingsChange(newSettings, true);
  };

  const handleOcrModelChange = (value: string) => {
    handleSettingsChange({ ocrEngine: value });
  };

  const handleLanguageChange = (currentValue: Language) => {
    const updatedLanguages = settings.languages.includes(currentValue)
      ? settings.languages.filter((id) => id !== currentValue)
      : [...settings.languages, currentValue];

    handleSettingsChange({ languages: updatedLanguages });
  };

  const handleAudioDeviceChange = (currentValue: string) => {
    const updatedDevices = settings.audioDevices.includes(currentValue)
      ? settings.audioDevices.filter((device) => device !== currentValue)
      : [...settings.audioDevices, currentValue];

    handleSettingsChange({ audioDevices: updatedDevices });
  };

  const handlePiiRemovalChange = (checked: boolean) => {
    handleSettingsChange({ usePiiRemoval: checked });
  };

  const handleDisableAudioChange = (checked: boolean) => {
    handleSettingsChange({ disableAudio: checked });
  };

  const handleFpsChange = (value: number[]) => {
    handleSettingsChange({ fps: value[0] });
  };

  const handleVadSensitivityChange = (value: number[]) => {
    const sensitivityMap: { [key: number]: VadSensitivity } = {
      2: "high",
      1: "medium",
      0: "low",
    };
    handleSettingsChange({
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
    handleSettingsChange({ audioChunkDuration: value[0] });
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
    handleSettingsChange({ analyticsEnabled: newValue }, true);
  };

  const handleChineseMirrorToggle = async (checked: boolean) => {
    handleSettingsChange({ useChineseMirror: checked }, true);
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
          handleSettingsChange({ dataDir: selected }, true);
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
    handleSettingsChange({ dataDir: newValue });
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
      if (await exists(settings.dataDir)) {
        return;
      }
    } catch (err) {}

    toast({
      title: "error",
      description: "failed to change data directory.",
      variant: "destructive",
      duration: 3000,
    });

    handleSettingsChange({ dataDir: settings.dataDir }, true);
  };

  const handleFrameCacheToggle = (checked: boolean) => {
    handleSettingsChange({
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
      handleSettingsChange({ enableUiMonitoring: checked }, true);
    } catch (error) {
      console.error("failed to toggle ui monitoring:", error);
      toast({
        title: "error checking accessibility permissions",
        description: "please try again or check the logs",
        variant: "destructive",
      });
    }
  };
  const handleIgnoredWindowsChange = (values: string[]) => {
    // Convert all values to lowercase for comparison
    const lowerCaseValues = values.map((v) => v.toLowerCase());
    const currentLowerCase = settings.ignoredWindows.map((v) =>
      v.toLowerCase()
    );

    // Find added values (in values but not in current)
    const addedValues = values.filter(
      (v) => !currentLowerCase.includes(v.toLowerCase())
    );
    // Find removed values (in current but not in values)
    const removedValues = settings.ignoredWindows.filter(
      (v) => !lowerCaseValues.includes(v.toLowerCase())
    );

    if (addedValues.length > 0) {
      // Handle adding new value
      const newValue = addedValues[0];
      handleSettingsChange({
        ignoredWindows: [...settings.ignoredWindows, newValue],
        // Remove from included windows if present
        includedWindows: settings.includedWindows.filter(
          (w) => w.toLowerCase() !== newValue.toLowerCase()
        ),
      });
    } else if (removedValues.length > 0) {
      // Handle removing value
      const removedValue = removedValues[0];
      handleSettingsChange(
        {
          ignoredWindows: settings.ignoredWindows.filter(
            (w) => w !== removedValue
          ),
        },
        true
      );
    }
  };

  const handleIncludedWindowsChange = (values: string[]) => {
    // Convert all values to lowercase for comparison
    const lowerCaseValues = values.map((v) => v.toLowerCase());
    const currentLowerCase = settings.includedWindows.map((v) =>
      v.toLowerCase()
    );

    // Find added values (in values but not in current)
    const addedValues = values.filter(
      (v) => !currentLowerCase.includes(v.toLowerCase())
    );
    // Find removed values (in current but not in values)
    const removedValues = settings.includedWindows.filter(
      (v) => !lowerCaseValues.includes(v.toLowerCase())
    );

    if (addedValues.length > 0) {
      // Handle adding new value
      const newValue = addedValues[0];
      handleSettingsChange(
        {
          includedWindows: [...settings.includedWindows, newValue],
          // Remove from ignored windows if present
          ignoredWindows: settings.ignoredWindows.filter(
            (w) => w.toLowerCase() !== newValue.toLowerCase()
          ),
        },
        true
      );
    } else if (removedValues.length > 0) {
      // Handle removing value
      const removedValue = removedValues[0];
      handleSettingsChange(
        {
          includedWindows: settings.includedWindows.filter(
            (w) => w !== removedValue
          ),
        },
        true
      );
    }
  };

  return (
    <div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold mb-4">recording</h1>
      {settings.devMode || (!isUpdating && isDisabled) ? (
        <Alert>
          <Terminal className="h-4 w-4" />
          <AlertTitle>heads up!</AlertTitle>
          <AlertDescription>
            make sure to turn off dev mode and start screenpipe recorder first
            (go to status)
          </AlertDescription>
        </Alert>
      ) : (
        <></>
      )}
      <div
      // className={cn(
      //   isDisabled && "opacity-50 pointer-events-none cursor-not-allowed"
      // )}
      >
        <h4 className="text-lg font-semibold my-4">video</h4>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="font-medium">disable video recording</h4>
              <p className="text-sm text-muted-foreground">
                useful if you don&apos;t need screen recording or if you have
                memory/cpu issues
              </p>
            </div>
            <Switch
              id="disableVision"
              checked={settings.disableVision}
              onCheckedChange={(checked) =>
                handleSettingsChange({ disableVision: checked }, true)
              }
            />
          </div>

          {!settings.disableVision && (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="font-medium">
                    enable realtime vision processing
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    stream screen content in real-time (dev preview) -{" "}
                    <a
                      href="https://github.com/mediar-ai/screenpipe/tree/main/screenpipe-js/examples/stream-screenshots"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      view example
                    </a>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="enableRealtimeVision"
                    checked={settings.enableRealtimeVision}
                    onCheckedChange={(checked) =>
                      handleSettingsChange(
                        {
                          enableRealtimeVision: checked,
                        },
                        true
                      )
                    }
                  />
                </div>
              </div>

              {/* <div className="flex items-center justify-between mb-4">
                <div className="space-y-1">
                  <h4 className="font-medium">use all monitors</h4>
                  <p className="text-sm text-muted-foreground">
                    automatically detect and record all monitors, including
                    newly connected ones
                  </p>
                </div>
                <Switch
                  id="useAllMonitors"
                  checked={settings.useAllMonitors}
                  onCheckedChange={(checked) =>
                    handleSettingsChange({ useAllMonitors: checked })
                  }
                />
              </div> */}

              <div className="flex flex-col space-y-6">
                <div className="flex flex-col space-y-2">
                  <Label
                    htmlFor="monitorIds"
                    className="flex items-center space-x-2"
                  >
                    <Monitor className="h-4 w-4" />
                    <span>monitors</span>
                  </Label>
                  <MultiSelect
                    options={availableMonitors.map((monitor) => ({
                      value: monitor.id.toString(),
                      label: `${monitor.id}. ${monitor.name} - ${
                        monitor.width
                      }x${monitor.height} ${
                        monitor.is_default ? "(default)" : ""
                      }`,
                    }))}
                    defaultValue={settings.monitorIds}
                    onValueChange={(values) =>
                      values.length === 0
                        ? handleSettingsChange({ disableVision: true }, true)
                        : handleSettingsChange({ monitorIds: values }, true)
                    }
                    placeholder={
                      settings.useAllMonitors
                        ? "all monitors will be used"
                        : "select monitors"
                    }
                    variant="default"
                    modalPopover={true}
                    animation={2}
                    // disabled={settings.useAllMonitors}
                  />
                </div>

                <div className="flex flex-col space-y-2">
                  <Label
                    htmlFor="ocrModel"
                    className="flex items-center space-x-2"
                  >
                    <Eye className="h-4 w-4" />
                    <span>ocr model</span>
                  </Label>
                  <Select
                    onValueChange={handleOcrModelChange}
                    defaultValue={settings.ocrEngine}
                  >
                    <SelectTrigger>
                      <SelectValue
                        className="capitalize"
                        placeholder="select ocr engine"
                      />
                    </SelectTrigger>
                    <SelectContent className="capitalize">
                      {renderOcrEngineOptions()}
                    </SelectContent>
                  </Select>
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
                            resources, higher values provide smoother
                            recordings, less likely to miss activity.
                            <br />
                            (we do not use resources if your screen does not
                            change much)
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
                      value={[settings.fps]}
                      onValueChange={handleFpsChange}
                      className="flex-grow"
                    />
                    <span className="w-12 text-right">
                      {settings.fps.toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="space-y-6">
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
                              - &quot;bit&quot; will ignore
                              &quot;Bitwarden&quot; and &quot;bittorrent&quot;
                              <br />- &quot;incognito&quot; will ignore tabs,
                              windows that contains the word
                              &quot;incognito&quot;
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <MultiSelect
                      options={createWindowOptions(
                        windowItems,
                        settings.ignoredWindows
                      )}
                      defaultValue={settings.ignoredWindows}
                      onValueChange={handleIgnoredWindowsChange}
                      placeholder="add windows to ignore"
                      variant="default"
                      modalPopover={true}
                      animation={2}
                      allowCustomValues={true}
                      validateCustomValue={(value) => value.length >= 2}
                    />
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
                    <MultiSelect
                      options={createWindowOptions(
                        windowItems,
                        settings.includedWindows
                      )}
                      defaultValue={settings.includedWindows}
                      onValueChange={handleIncludedWindowsChange}
                      placeholder="add window to include"
                      variant="default"
                      modalPopover={true}
                      animation={2}
                      allowCustomValues={true}
                      validateCustomValue={(value) => value.length >= 2}
                    />
                  </div>
                </div>

                {/*  */}
              </div>
              <Separator className="my-6" />
            </>
          )}
        </div>

        <h4 className="text-lg font-semibold my-4">audio</h4>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="font-medium">disable audio recording</h4>
              <p className="text-sm text-muted-foreground">
                useful if you don&apos;t need audio or if you have memory/cpu
                issues
              </p>
            </div>
            <Switch
              id="disableAudio"
              checked={settings.disableAudio}
              onCheckedChange={handleDisableAudioChange}
            />
          </div>

          {!settings.disableAudio && (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="font-medium">
                    enable realtime audio transcription
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    transcribe audio in real-time as you speak (dev preview) -{" "}
                    <a
                      href="https://github.com/mediar-ai/screenpipe/blob/main/screenpipe-js/examples/basic-transcription/index.ts"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      view example
                    </a>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="enableRealtimeAudio"
                    checked={settings.enableRealtimeAudioTranscription}
                    onCheckedChange={(checked) =>
                      handleSettingsChange(
                        {
                          enableRealtimeAudioTranscription: checked,
                        },
                        true
                      )
                    }
                  />
                </div>
              </div>

              {settings.enableRealtimeAudioTranscription && (
                <div className="flex flex-col space-y-2">
                  <Label
                    htmlFor="realtimeAudioTranscriptionEngine"
                    className="flex items-center space-x-2"
                  >
                    <Mic className="h-4 w-4" />
                    <span>realtime transcription model</span>
                  </Label>
                  <Select
                    onValueChange={(value) =>
                      handleAudioTranscriptionModelChange(value, true)
                    }
                    value={settings.realtimeAudioTranscriptionEngine}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="select realtime transcription engine" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="screenpipe-cloud">
                        <div className="flex items-center justify-between w-full space-x-2">
                          <span>screenpipe cloud</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">cloud</Badge>
                            {!settings.user?.cloud_subscribed && (
                              <Badge variant="outline" className="text-xs">
                                get screenpipe cloud
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
                    </SelectContent>
                  </Select>
                </div>
              )}

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
                  value={settings.audioTranscriptionEngine}
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
                          {!settings.user?.cloud_subscribed && (
                            <Badge variant="outline" className="text-xs">
                              get screenpipe cloud
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
              </div>

              {settings.audioTranscriptionEngine === "deepgram" && (
                <div className="mt-2">
                  <div className="flex flex-col space-y-2">
                    <Label
                      htmlFor="deepgramApiKey"
                      className="flex items-center gap-2"
                    >
                      <Key className="h-4 w-4" />
                      <span>api key</span>
                    </Label>
                    <div className="flex-grow relative">
                      <Input
                        id="deepgramApiKey"
                        type={showApiKey ? "text" : "password"}
                        value={settings.deepgramApiKey}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          handleSettingsChange(
                            {
                              deepgramApiKey: newValue,
                            },
                            true
                          );
                        }}
                        className="pr-10 w-full"
                        placeholder="enter your Deepgram API key"
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
                  <p className="text-sm text-muted-foreground text-left mt-1">
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
                  modal={true}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openAudioDevices}
                      className="w-full justify-between"
                    >
                      {settings.audioDevices.length > 0
                        ? `${settings.audioDevices.length} device(s) selected`
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
                              onSelect={() =>
                                handleAudioDeviceChange(device.name)
                              }
                            >
                              <div className="flex items-center">
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    settings.audioDevices.includes(device.name)
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
                      {settings.languages.length > 0
                        ? `${settings.languages.join(", ")}`
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
                                    settings.languages.includes(id)
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
                  htmlFor="vadSensitivity"
                  className="flex items-center space-x-2"
                >
                  <span>voice activity detection sensitivity</span>
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
                          high (recommended): less sensitive, may miss some
                          speech but reduces false positives.
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
                    value={[vadSensitivityToNumber(settings.vadSensitivity)]}
                    onValueChange={handleVadSensitivityChange}
                    className="flex-grow"
                  />
                  <span className="w-16 text-right">
                    {settings.vadSensitivity}
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
                    value={[settings.audioChunkDuration]}
                    onValueChange={handleAudioChunkDurationChange}
                    className="flex-grow"
                  />
                  <span className="w-12 text-right">
                    {settings.audioChunkDuration} s
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <Separator className="my-6" />

        <h4 className="text-lg font-semibold my-4">misc</h4>

        <div className="space-y-8 py-4">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="font-medium">
                  remove personal information (pii)
                </h4>
                <p className="text-sm text-muted-foreground">
                  removes sensitive data like credit cards, emails, and phone
                  numbers from ocr text
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">experimental</Badge>
                <Switch
                  id="piiRemoval"
                  checked={settings.usePiiRemoval}
                  onCheckedChange={handlePiiRemovalChange}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="font-medium">enable telemetry</h4>
                <p className="text-sm text-muted-foreground">
                  help improve screenpipe with anonymous usage data
                </p>
              </div>
              <Switch
                id="analytics-toggle"
                checked={settings.analyticsEnabled}
                onCheckedChange={handleAnalyticsToggle}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="font-medium">use chinese mirror</h4>
                <p className="text-sm text-muted-foreground">
                  alternative download source for hugging face models in
                  mainland china
                </p>
              </div>
              <Switch
                id="chinese-mirror-toggle"
                checked={settings.useChineseMirror}
                onCheckedChange={handleChineseMirrorToggle}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="font-medium">enable rewind</h4>
                <p className="text-sm text-muted-foreground">
                  experimental feature that provides a rewind interface for the
                  rewind pipe
                </p>
              </div>
              <Switch
                id="frame-cache-toggle"
                checked={settings.enableFrameCache}
                onCheckedChange={handleFrameCacheToggle}
              />
            </div>

            {isMacOS && (
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="font-medium">enable ui monitoring</h4>
                  <p className="text-sm text-muted-foreground">
                    monitor ui elements for better search context (requires
                    accessibility permission)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="ui-monitoring-toggle"
                    checked={settings.enableUiMonitoring}
                    onCheckedChange={handleUiMonitoringToggle}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Folder className="h-5 w-5" />
                <h3 className="text-lg font-semibold">data directory</h3>
              </div>

              {!dataDirInputVisible ? (
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                  onClick={handleDataDirChange}
                >
                  <div className="flex gap-4">
                    {!!settings.dataDir
                      ? "change directory"
                      : "select directory"}
                    <span className="text-muted-foreground">
                      {settings.dataDir === settings.dataDir
                        ? `current at: ${
                            settings.dataDir || "default directory"
                          }`
                        : `change to: ${
                            settings.dataDir || "default directory"
                          }`}
                    </span>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
              ) : (
                <Input
                  id="dataDir"
                  type="text"
                  autoFocus={true}
                  value={settings.dataDir}
                  onChange={handleDataDirInputChange}
                  onBlur={handleDataDirInputBlur}
                  onKeyDown={handleDataDirInputKeyDown}
                />
              )}
            </div>

            {/*  */}
          </div>
        </div>
      </div>
    </div>
  );
}
