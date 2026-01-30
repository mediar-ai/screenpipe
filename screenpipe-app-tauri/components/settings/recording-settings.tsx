"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
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
  AlertCircle,
  RefreshCw,
  Loader2,
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
import { commands, SettingsStore } from "@/lib/utils/tauri";

import {
  useSettings,
  VadSensitivity,
  Settings,
} from "@/lib/hooks/use-settings";
import { useToast } from "@/components/ui/use-toast";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
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
import { ValidatedInput } from "../ui/validated-input";
import { 
  validateField, 
  sanitizeValue, 
  debounce, 
  validateUrl,
  FieldValidationResult 
} from "@/lib/utils/validation";

type PermissionsStatus = {
  screenRecording: string;
  microphone: string;
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
  const { settings, updateSettings, getDataDir, loadUser } = useSettings();
  const [openAudioDevices, setOpenAudioDevices] = React.useState(false);
  const [openLanguages, setOpenLanguages] = React.useState(false);
  const [dataDirInputVisible, setDataDirInputVisible] = React.useState(false);
  const [clickTimeout, setClickTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);
  
  // Add validation state
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [pendingChanges, setPendingChanges] = useState<Partial<SettingsStore>>({});

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
  const [isRefreshingSubscription, setIsRefreshingSubscription] = useState(false);
  const { checkLogin } = useLoginDialog();

  // Add new state to track if settings have changed
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Optimized debounced validation
  const debouncedValidateSettings = useMemo(
    () => debounce((newSettings: Partial<SettingsStore>) => {
      const errors: Record<string, string> = {};
      
      // Validate numeric fields
      if (newSettings.fps !== undefined) {
        const fpsValidation = validateField("fps", newSettings.fps);
        if (!fpsValidation.isValid && fpsValidation.error) {
          errors.fps = fpsValidation.error;
        }
      }
      
      if (newSettings.audioChunkDuration !== undefined) {
        const durationValidation = validateField("audioChunkDuration", newSettings.audioChunkDuration);
        if (!durationValidation.isValid && durationValidation.error) {
          errors.audioChunkDuration = durationValidation.error;
        }
      }
      
      if (newSettings.port !== undefined) {
        const portValidation = validateField("port", newSettings.port);
        if (!portValidation.isValid && portValidation.error) {
          errors.port = portValidation.error;
        }
      }
      
      if (newSettings.dataDir !== undefined) {
        const dataDirValidation = validateField("dataDir", newSettings.dataDir);
        if (!dataDirValidation.isValid && dataDirValidation.error) {
          errors.dataDir = dataDirValidation.error;
        }
      }
      
      if (newSettings.deepgramApiKey !== undefined && newSettings.deepgramApiKey.trim()) {
        if (newSettings.deepgramApiKey.length < 10) {
          errors.deepgramApiKey = "API key seems too short";
        }
      }
      
      setValidationErrors(errors);
    }, 300),
    []
  );

  // Enhanced settings change handler with validation
  const handleSettingsChange = useCallback((
    newSettings: Partial<Settings>,
    restart: boolean = true
  ) => {
    // Sanitize values
    const sanitizedSettings: Partial<Settings> = {};
    for (const [key, value] of Object.entries(newSettings)) {
      sanitizedSettings[key as keyof Settings] = sanitizeValue(key as keyof SettingsStore, value);
    }
    
    // Update pending changes
    setPendingChanges(prev => ({ ...prev, ...sanitizedSettings }));
    
    // Validate new settings
    debouncedValidateSettings({ ...settings, ...sanitizedSettings });
    
    // Update settings
    updateSettings(sanitizedSettings);
    
    if (restart) {
      setHasUnsavedChanges(true);
    }
  }, [settings, updateSettings, debouncedValidateSettings]);

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
          id === "default" ||
          availableMonitorIds.includes(id)
        );

        if (updatedMonitorIds.length === 0) {
          updatedMonitorIds = [
            monitors.find((monitor) => monitor.is_default)!.id!.toString(),
          ]
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

  // Enhanced validation for specific fields
  const validateDeepgramApiKey = useCallback((apiKey: string): FieldValidationResult => {
    if (!apiKey.trim()) {
      return { isValid: false, error: "API key is required" };
    }
    if (apiKey.length < 10) {
      return { isValid: false, error: "API key seems too short" };
    }
    return { isValid: true };
  }, []);

  const validateDataDirectory = useCallback((path: string): FieldValidationResult => {
    if (!path.trim()) {
      return { isValid: false, error: "Data directory path is required" };
    }
    // Add more validation as needed
    return { isValid: true };
  }, []);

  // Enhanced FPS change handler with validation
  const handleFpsChange = useCallback((value: number[]) => {
    const fps = Math.max(0.1, Math.min(60, value[0]));
    handleSettingsChange({ fps }, true);
  }, [handleSettingsChange]);

  // Enhanced audio chunk duration handler
  const handleAudioChunkDurationChange = useCallback((value: number[]) => {
    const duration = Math.max(5, Math.min(3600, value[0]));
    handleSettingsChange({ audioChunkDuration: duration }, true);
  }, [handleSettingsChange]);

  // Enhanced Deepgram API key handler
  const handleDeepgramApiKeyChange = useCallback((value: string, isValid: boolean) => {
    handleSettingsChange({ deepgramApiKey: value }, true);
  }, [handleSettingsChange]);

  // Enhanced data directory change with validation
  const handleDataDirInputChange = useCallback((value: string, isValid: boolean) => {
    handleSettingsChange({ dataDir: value }, true);
  }, [handleSettingsChange]);

  // Optimized update function with better error handling
  const handleUpdate = async () => {
    // Check for validation errors
    if (Object.keys(validationErrors).length > 0) {
      toast({
        title: "Validation errors",
        description: "Please fix all validation errors before applying changes",
        variant: "destructive",
      });
      return;
    }

    setIsUpdating(true);
    setHasUnsavedChanges(false);
    
    toast({
      title: "Updating recording settings",
      description: "This may take a few moments...",
    });

    try {
      console.log("Applying settings:", settings);

      if (!settings.analyticsEnabled) {
        posthog.capture("telemetry", {
          enabled: false,
        });
        posthog.opt_out_capturing();
        Sentry.close();
        console.log("Telemetry disabled");
      } else {
        const isDebug = process.env.TAURI_ENV_DEBUG === "true";
        if (!isDebug) {
          posthog.opt_in_capturing();
          posthog.capture("telemetry", {
            enabled: true,
          });
          console.log("Telemetry enabled");
          Sentry.init({
            ...defaultOptions,
          });
        }
      }

      await commands.stopScreenpipe();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await commands.spawnScreenpipe(null);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      toast({
        title: "Settings updated successfully",
        description: "Screenpipe has been restarted with new settings",
      });
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast({
        title: "Error updating settings",
        description: "Please try again or check the logs for more information",
        variant: "destructive",
      });
      setHasUnsavedChanges(true);
    } finally {
      setIsUpdating(false);
    }
  };

  // Show validation status in the UI
  const getValidationStatus = () => {
    const errorCount = Object.keys(validationErrors).length;
    if (errorCount > 0) {
      return {
        variant: "destructive" as const,
        message: `${errorCount} validation error${errorCount > 1 ? 's' : ''} found`,
      };
    }
    if (hasUnsavedChanges) {
      return {
        variant: "secondary" as const,
        message: "Unsaved changes - restart required",
      };
    }
    return {
      variant: "default" as const,
      message: "All settings valid",
    };
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

    handleSettingsChange({ audioDevices: updatedDevices }, true);
  };

  const handlePiiRemovalChange = (checked: boolean) => {
    handleSettingsChange({ usePiiRemoval: checked }, true);
  };

  const handleDisableAudioChange = (checked: boolean) => {
    handleSettingsChange({ disableAudio: checked }, true);
  };

  const handleVadSensitivityChange = (value: number[]) => {
    const sensitivityMap: { [key: number]: VadSensitivity } = {
      2: "high",
      1: "medium",
      0: "low",
    };
    handleSettingsChange(
      {
        vadSensitivity: sensitivityMap[value[0]],
      },
      true
    );
  };

  const vadSensitivityToNumber = (sensitivity: VadSensitivity): number => {
    const sensitivityMap: { [key in VadSensitivity]: number } = {
      high: 2,
      medium: 1,
      low: 0,
    };
    return sensitivityMap[sensitivity];
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
      handleSettingsChange(
        {
          ignoredWindows: [...settings.ignoredWindows, newValue],
          // Remove from included windows if present
          includedWindows: settings.includedWindows.filter(
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

  const handleIgnoredUrlsChange = (values: string[]) => {
    const currentUrls = settings.ignoredUrls || [];
    const lowerCaseValues = values.map((v) => v.toLowerCase());
    const currentLowerCase = currentUrls.map((v) => v.toLowerCase());

    // Find added values
    const addedValues = values.filter(
      (v) => !currentLowerCase.includes(v.toLowerCase())
    );
    // Find removed values
    const removedValues = currentUrls.filter(
      (v) => !lowerCaseValues.includes(v.toLowerCase())
    );

    if (addedValues.length > 0) {
      const newValue = addedValues[0];
      handleSettingsChange(
        {
          ignoredUrls: [...currentUrls, newValue],
        },
        true
      );
    } else if (removedValues.length > 0) {
      const removedValue = removedValues[0];
      handleSettingsChange(
        {
          ignoredUrls: currentUrls.filter((u) => u !== removedValue),
        },
        true
      );
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Recording Settings
        </h1>
        <p className="text-muted-foreground text-lg">
          Configure screen and audio recording preferences
        </p>
      </div>

      {/* Validation and Status Alert */}
      {(Object.keys(validationErrors).length > 0 || hasUnsavedChanges) && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Configuration Status</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{getValidationStatus().message}</span>
            {hasUnsavedChanges && Object.keys(validationErrors).length === 0 && (
              <Button
                onClick={handleUpdate}
                disabled={isUpdating}
                size="sm"
                variant="outline"
              >
                {isUpdating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Apply Changes
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}


      {/* Enhanced Data Directory Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Folder className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Data Directory</h3>
        </div>

        {dataDirInputVisible ? (
          <ValidatedInput
            id="dataDir"
            label="Data Directory Path"
            value={settings.dataDir || ""}
            onChange={handleDataDirInputChange}
            validation={validateDataDirectory}
            onBlur={() => {
              setDataDirInputVisible(false);
              validateDataDirInput();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setDataDirInputVisible(false);
                validateDataDirInput();
              }
            }}
            placeholder="Enter data directory path"
            autoFocus={true}
            required={true}
          />
        ) : (
          <Button
            variant="outline"
            role="combobox"
            className="w-full justify-between"
            onClick={handleDataDirChange}
          >
            <div className="flex gap-4">
              {settings.dataDir ? "Change directory" : "Select directory"}
              <span className="text-muted-foreground">
                {settings.dataDir || "Default directory"}
              </span>
            </div>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        )}
      </div>

      {/* Rest of the existing UI sections remain the same but with improved validation feedback */}
      
      {/* Enhanced FPS Section */}
      <div className="flex flex-col space-y-2">
        <Label htmlFor="fps" className="flex items-center space-x-2">
          <span>Frames per second (FPS)</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 cursor-default" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  Adjust the recording frame rate. Lower values save resources,
                  higher values provide smoother recordings and are less likely to miss activity.
                  We optimize resource usage when your screen doesn&apos;t change much.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {validationErrors.fps && (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
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
        {validationErrors.fps && (
          <p className="text-sm text-destructive">{validationErrors.fps}</p>
        )}
      </div>

      {/* Enhanced Audio Chunk Duration Section */}
      <div className="flex flex-col space-y-2">
        <Label
          htmlFor="audioChunkDuration"
          className="flex items-center space-x-2"
        >
          <span>Audio chunk duration (seconds)</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 cursor-default" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  Adjust the duration of each audio chunk. Shorter durations may lower
                  resource usage spikes, while longer durations may increase transcription
                  quality. Deepgram generally works better than Whisper for higher quality transcription.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {validationErrors.audioChunkDuration && (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
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
        {validationErrors.audioChunkDuration && (
          <p className="text-sm text-destructive">{validationErrors.audioChunkDuration}</p>
        )}
      </div>

      <Separator />

      {/* Audio Transcription Engine */}
      <div className="flex flex-col space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <Mic className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Audio Transcription</h3>
        </div>
        <div className="space-y-4">
          {/* Screenpipe Cloud Subscription Status */}
          {settings.user && (
            <div className="flex items-center justify-between p-3 rounded-lg border bg-secondary/20 border-secondary/50">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  settings.user.cloud_subscribed ? "bg-foreground" : "bg-muted-foreground"
                )} />
                <span className="text-sm text-muted-foreground">
                  Screenpipe Cloud: {settings.user.cloud_subscribed ? "Subscribed" : "Not subscribed"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={isRefreshingSubscription}
                  onClick={async () => {
                    if (!settings.user?.token) return;
                    setIsRefreshingSubscription(true);
                    try {
                      await loadUser(settings.user.token, true);
                      toast({
                        title: "Subscription status refreshed",
                        description: settings.user.cloud_subscribed
                          ? "Your subscription is active"
                          : "Subscription status updated",
                      });
                    } catch (error) {
                      toast({
                        title: "Failed to refresh",
                        description: "Please try again",
                        variant: "destructive",
                      });
                    } finally {
                      setIsRefreshingSubscription(false);
                    }
                  }}
                >
                  <RefreshCw className={cn("h-3 w-3", isRefreshingSubscription && "animate-spin")} />
                </Button>
              </div>
              {!settings.user.cloud_subscribed && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const clientRefId = `${settings.user?.id}&customer_email=${encodeURIComponent(settings.user?.email ?? "")}`;
                    openUrl(`https://buy.stripe.com/7sIdRzbym4RA98c7sX?client_reference_id=${clientRefId}`);
                  }}
                >
                  Subscribe
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-col space-y-2">
            <Label htmlFor="audioTranscriptionEngine" className="flex items-center space-x-2">
              <span>Audio transcription engine</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4 cursor-default" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>
                      Choose the transcription engine. Deepgram provides higher quality but requires an API key or screenpipe cloud.
                      Whisper runs locally but may be slower.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Select
              value={settings.audioTranscriptionEngine}
              onValueChange={(value) => handleAudioTranscriptionModelChange(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select transcription engine" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="screenpipe-cloud" disabled={!settings.user?.cloud_subscribed}>
                  Screenpipe Cloud {!settings.user?.cloud_subscribed && "(requires subscription)"}
                </SelectItem>
                <SelectItem value="whisper-tiny">Whisper Tiny</SelectItem>
                <SelectItem value="whisper-tiny-quantized">Whisper Tiny Quantized</SelectItem>
                <SelectItem value="whisper-large">Whisper Large V3</SelectItem>
                <SelectItem value="whisper-large-quantized">Whisper Large V3 Quantized</SelectItem>
                <SelectItem value="whisper-large-v3-turbo">Whisper Large V3 Turbo</SelectItem>
                <SelectItem value="whisper-large-v3-turbo-quantized">Whisper Large V3 Turbo Quantized</SelectItem>
                <SelectItem value="deepgram">Deepgram</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Deepgram API Key - shown only when Deepgram is selected */}
          {settings.audioTranscriptionEngine === "deepgram" && (
            <div className="relative">
              <ValidatedInput
                id="deepgramApiKey"
                label="Deepgram API Key"
                type={showApiKey ? "text" : "password"}
                value={settings.deepgramApiKey || ""}
                onChange={handleDeepgramApiKeyChange}
                validation={validateDeepgramApiKey}
                placeholder="Enter your Deepgram API key"
                required={true}
                helperText="Get an API key from deepgram.com or use Screenpipe Cloud"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-7 h-8 w-8"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}

        </div>
      </div>

      <Separator />

      {/* Audio Devices */}
      <div className="flex flex-col space-y-2">
        <Label htmlFor="audioDevices" className="flex items-center space-x-2">
          <span>Audio devices</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 cursor-default" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  Select which audio devices to record from. You can select multiple devices.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        <Popover open={openAudioDevices} onOpenChange={setOpenAudioDevices}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openAudioDevices}
              className="w-full justify-between"
            >
              {settings.audioDevices.length > 0
                ? `${settings.audioDevices.length} device(s) selected`
                : "Select audio devices..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput placeholder="Search audio devices..." />
              <CommandList>
                <CommandEmpty>No audio devices found.</CommandEmpty>
                <CommandGroup>
                  {availableAudioDevices.map((device) => (
                    <CommandItem
                      key={device.name}
                      value={device.name}
                      onSelect={() => handleAudioDeviceChange(device.name)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          settings.audioDevices.includes(device.name)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      {device.name}
                      {device.is_default && (
                        <Badge variant="secondary" className="ml-2">
                          Default
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Languages */}
      <div className="flex flex-col space-y-2">
        <Label htmlFor="languages" className="flex items-center space-x-2">
          <Languages className="h-4 w-4" />
          <span>Languages</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 cursor-default" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  Select languages for audio transcription. Multiple languages can be selected.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
                ? `${settings.languages.length} language(s) selected`
                : "Select languages..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput placeholder="Search languages..." />
              <CommandList>
                <CommandEmpty>No languages found.</CommandEmpty>
                <CommandGroup>
                  {[
                    { code: "english", name: "English" },
                    { code: "spanish", name: "Spanish" },
                    { code: "french", name: "French" },
                    { code: "german", name: "German" },
                    { code: "italian", name: "Italian" },
                    { code: "portuguese", name: "Portuguese" },
                    { code: "russian", name: "Russian" },
                    { code: "japanese", name: "Japanese" },
                    { code: "korean", name: "Korean" },
                    { code: "chinese", name: "Chinese" },
                    { code: "arabic", name: "Arabic" },
                    { code: "hindi", name: "Hindi" },
                    { code: "dutch", name: "Dutch" },
                    { code: "swedish", name: "Swedish" },
                    { code: "indonesian", name: "Indonesian" },
                    { code: "finnish", name: "Finnish" },
                    { code: "hebrew", name: "Hebrew" },
                    { code: "ukrainian", name: "Ukrainian" },
                    { code: "greek", name: "Greek" },
                    { code: "malay", name: "Malay" },
                    { code: "czech", name: "Czech" },
                    { code: "romanian", name: "Romanian" },
                    { code: "danish", name: "Danish" },
                    { code: "hungarian", name: "Hungarian" },
                    { code: "norwegian", name: "Norwegian" },
                    { code: "thai", name: "Thai" },
                    { code: "urdu", name: "Urdu" },
                    { code: "croatian", name: "Croatian" },
                    { code: "bulgarian", name: "Bulgarian" },
                    { code: "lithuanian", name: "Lithuanian" },
                    { code: "latin", name: "Latin" },
                    { code: "welsh", name: "Welsh" },
                    { code: "slovak", name: "Slovak" },
                    { code: "persian", name: "Persian" },
                    { code: "latvian", name: "Latvian" },
                    { code: "bengali", name: "Bengali" },
                    { code: "serbian", name: "Serbian" },
                    { code: "azerbaijani", name: "Azerbaijani" },
                    { code: "slovenian", name: "Slovenian" },
                    { code: "estonian", name: "Estonian" },
                    { code: "macedonian", name: "Macedonian" },
                    { code: "nepali", name: "Nepali" },
                    { code: "mongolian", name: "Mongolian" },
                    { code: "bosnian", name: "Bosnian" },
                    { code: "kazakh", name: "Kazakh" },
                    { code: "albanian", name: "Albanian" },
                    { code: "swahili", name: "Swahili" },
                    { code: "galician", name: "Galician" },
                    { code: "marathi", name: "Marathi" },
                    { code: "punjabi", name: "Punjabi" },
                    { code: "sinhala", name: "Sinhala" },
                    { code: "khmer", name: "Khmer" },
                    { code: "afrikaans", name: "Afrikaans" },
                    { code: "belarusian", name: "Belarusian" },
                    { code: "gujarati", name: "Gujarati" },
                    { code: "amharic", name: "Amharic" },
                    { code: "yiddish", name: "Yiddish" },
                    { code: "lao", name: "Lao" },
                    { code: "uzbek", name: "Uzbek" },
                    { code: "faroese", name: "Faroese" },
                    { code: "pashto", name: "Pashto" },
                    { code: "maltese", name: "Maltese" },
                    { code: "sanskrit", name: "Sanskrit" },
                    { code: "luxembourgish", name: "Luxembourgish" },
                    { code: "myanmar", name: "Myanmar" },
                    { code: "tibetan", name: "Tibetan" },
                    { code: "tagalog", name: "Tagalog" },
                    { code: "assamese", name: "Assamese" },
                    { code: "tatar", name: "Tatar" },
                    { code: "hausa", name: "Hausa" },
                    { code: "javanese", name: "Javanese" },
                    { code: "turkish", name: "Turkish" },
                    { code: "polish", name: "Polish" },
                    { code: "catalan", name: "Catalan" },
                    { code: "malayalam", name: "Malayalam" },
                  ].map((language) => (
                    <CommandItem
                      key={language.code}
                      value={language.code}
                      onSelect={() => handleLanguageChange(language.code as Language)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          settings.languages.includes(language.code as Language)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      {language.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Audio Settings Toggles */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="disableAudio">Disable audio recording</Label>
            <p className="text-sm text-muted-foreground">
              Turn off audio recording completely
            </p>
          </div>
          <Switch
            id="disableAudio"
            checked={settings.disableAudio}
            onCheckedChange={handleDisableAudioChange}
          />
        </div>

      </div>

      {/* VAD Sensitivity */}
      <div className="flex flex-col space-y-2">
        <Label htmlFor="vadSensitivity" className="flex items-center space-x-2">
          <span>Voice activity detection sensitivity</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 cursor-default" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  Adjust how sensitive the voice activity detection is. Higher sensitivity
                  may capture more audio but also more background noise.
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
            value={[vadSensitivityToNumber(settings.vadSensitivity as VadSensitivity)]}
            onValueChange={handleVadSensitivityChange}
            className="flex-grow"
          />
          <span className="w-16 text-right capitalize">
            {settings.vadSensitivity}
          </span>
        </div>
      </div>

      <Separator />

      {/* Video Settings */}
      <div className="flex flex-col space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Monitor className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Video Recording</h3>
        </div>

        {/* Monitor Selection - hidden when useAllMonitors is enabled */}
        {!settings.useAllMonitors && (
          <div className="flex flex-col space-y-2">
            <Label htmlFor="monitors" className="flex items-center space-x-2">
              <span>Monitors</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4 cursor-default" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>
                      Select which monitors to record from. Multiple monitors can be selected.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* Default Monitor Option */}
              <div
                className={cn(
                  "flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-colors",
                  settings.monitorIds.includes("default")
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent"
                )}
                onClick={() => {
                  const isDefaultSelected = settings.monitorIds.includes("default");
                  if (isDefaultSelected) {
                    // Remove default selection
                    handleSettingsChange({
                      monitorIds: settings.monitorIds.filter(id => id !== "default")
                    }, true);
                  } else {
                    // Select default (clear other selections and add default)
                    handleSettingsChange({ monitorIds: ["default"] }, true);
                  }
                }}
              >
                <div className="flex-1">
                  <p className="font-medium">Default Monitor</p>
                  <p className="text-sm text-muted-foreground">
                    Automatically use the system&apos;s default monitor
                  </p>
                </div>
                <Check
                  className={cn(
                    "h-4 w-4",
                    settings.monitorIds.includes("default")
                      ? "opacity-100"
                      : "opacity-0"
                  )}
                />
              </div>

              {availableMonitors.map((monitor) => (
                <div
                  key={monitor.id}
                  className={cn(
                    "flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    settings.monitorIds.includes(monitor.id.toString())
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent"
                  )}
                  onClick={() => {
                    const currentIds = settings.monitorIds.filter(id => id !== "default"); // Remove default when selecting specific monitors
                    const monitorId = monitor.id.toString();
                    const updatedIds = currentIds.includes(monitorId)
                      ? currentIds.filter(id => id !== monitorId)
                      : [...currentIds, monitorId];

                    handleSettingsChange({ monitorIds: updatedIds }, true);
                  }}
                >
                  <div className="flex-1">
                    <p className="font-medium">{monitor.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {monitor.width}x{monitor.height}
                      {monitor.is_default && " (Default)"}
                    </p>
                  </div>
                  <Check
                    className={cn(
                      "h-4 w-4",
                      settings.monitorIds.includes(monitor.id.toString())
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OCR Engine */}
        <div className="flex flex-col space-y-2">
          <Label htmlFor="ocrEngine" className="flex items-center space-x-2">
            <span>OCR engine</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 cursor-default" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>
                    OCR (Optical Character Recognition) engine for extracting text from images.
                    Platform-optimized engine is automatically selected.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <Select
            value={settings.ocrEngine}
            onValueChange={handleOcrModelChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select OCR engine" />
            </SelectTrigger>
            <SelectContent>
              {isMacOS && <SelectItem value="apple-native">Apple Native</SelectItem>}
              {!isMacOS && platform() === "windows" && <SelectItem value="windows-native">Windows Native</SelectItem>}
              {!isMacOS && platform() !== "windows" && <SelectItem value="tesseract">Tesseract</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        {/* Video Settings Toggles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="disableVision">Disable screen recording</Label>
              <p className="text-sm text-muted-foreground">
                Turn off screen recording completely
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

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="useAllMonitors">Use all monitors</Label>
              <p className="text-sm text-muted-foreground">
                Automatically record from all available monitors
              </p>
            </div>
            <Switch
              id="useAllMonitors"
              checked={settings.useAllMonitors}
              onCheckedChange={(checked) =>
                handleSettingsChange({ useAllMonitors: checked }, true)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="usePiiRemoval">PII removal (recommended)</Label>
              <p className="text-sm text-muted-foreground">
                Redact sensitive data from OCR and audio: emails, phones, SSNs, credit cards, IP addresses, API keys
              </p>
            </div>
            <Switch
              id="usePiiRemoval"
              checked={settings.usePiiRemoval}
              onCheckedChange={handlePiiRemovalChange}
            />
          </div>

        </div>
      </div>

      <Separator />

      {/* Window Filtering */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <AppWindowMac className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Window Filtering</h3>
        </div>

        <div className="flex flex-col space-y-2">
          <Label htmlFor="ignoredWindows" className="flex items-center space-x-2">
            <span>Ignored windows</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 cursor-default" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>
                    Windows that will be excluded from recording. Useful for privacy or reducing noise.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <MultiSelect
            options={createWindowOptions(windowItems || [], settings.ignoredWindows)}
            defaultValue={settings.ignoredWindows}
            value={settings.ignoredWindows}
            onValueChange={handleIgnoredWindowsChange}
            placeholder="Select windows to ignore..."
          />
        </div>

        <div className="flex flex-col space-y-2">
          <Label htmlFor="includedWindows" className="flex items-center space-x-2">
            <span>Included windows (whitelist)</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 cursor-default" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>
                    Only these windows will be recorded. Leave empty to record all windows except ignored ones.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <MultiSelect
            options={createWindowOptions(windowItems || [], settings.includedWindows)}
            defaultValue={settings.includedWindows}
            value={settings.includedWindows}
            onValueChange={handleIncludedWindowsChange}
            placeholder="Select windows to include (optional)..."
          />
        </div>

        <div className="flex flex-col space-y-2">
          <Label htmlFor="ignoredUrls" className="flex items-center space-x-2">
            <span>Ignored URLs (privacy)</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 cursor-default" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-semibold mb-1">Block browser URLs from recording</p>
                  <p className="text-xs mb-2">
                    Use domain patterns like "wellsfargo.com" or "chase.com".
                    Works best with the active browser tab. For background tabs,
                    we also check window titles as a fallback.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tip: Use specific domains, not generic words like "bank" which may over-match.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <MultiSelect
            options={(settings.ignoredUrls || []).map((url) => ({
              label: url,
              value: url,
            }))}
            defaultValue={settings.ignoredUrls || []}
            value={settings.ignoredUrls || []}
            onValueChange={handleIgnoredUrlsChange}
            placeholder="Type domain patterns (e.g., wellsfargo.com, chase.com)..."
          />
          {(settings.ignoredUrls || []).some((url) =>
            url.length < 5 || ['bank', 'pay', 'money', 'finance'].includes(url.toLowerCase())
          ) && (
            <p className="text-xs text-yellow-600 dark:text-yellow-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Short or generic patterns may block unintended sites. Use specific domains.
            </p>
          )}
        </div>
      </div>

      <Separator />

      {/* System Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="h-5 w-5" />
          <h3 className="text-lg font-semibold">System Settings</h3>
        </div>

        {/* Port Configuration */}
        <ValidatedInput
          id="port"
          label="Server Port"
          type="number"
          value={settings.port.toString()}
          onChange={(value, isValid) => {
            const portValue = parseInt(value) || 3030;
            handleSettingsChange({ port: portValue }, true);
          }}
          validation={(value) => validateField("port", parseInt(value) || 0)}
          placeholder="Enter server port"
          required={true}
          helperText="Port for the Screenpipe server (requires restart)"
        />


        {/* System Toggles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="analyticsEnabled">Enable analytics</Label>
              <p className="text-sm text-muted-foreground">
                Help improve Screenpipe by sharing anonymous usage data and error reports
              </p>
            </div>
            <Switch
              id="analyticsEnabled"
              checked={settings.analyticsEnabled}
              onCheckedChange={handleAnalyticsToggle}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="useChineseMirror">Use Chinese mirror</Label>
              <p className="text-sm text-muted-foreground">
                Use Chinese mirror for downloads (for users in China)
              </p>
            </div>
            <Switch
              id="useChineseMirror"
              checked={settings.useChineseMirror}
              onCheckedChange={handleChineseMirrorToggle}
            />
          </div>

        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-6 border-t">
        <div className="text-sm text-muted-foreground">
          {hasUnsavedChanges && "Changes require restart to take effect"}
        </div>
        <div className="flex gap-2">
          {hasUnsavedChanges && (
            <Button
              onClick={handleUpdate}
              disabled={isUpdating || Object.keys(validationErrors).length > 0}
              className="flex items-center gap-2"
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Apply Changes
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
