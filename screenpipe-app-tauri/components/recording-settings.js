"use strict";
"use client";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecordingSettings = RecordingSettings;
const react_1 = __importStar(require("react"));
const label_1 = require("@/components/ui/label");
const select_1 = require("./ui/select");
const button_1 = require("@/components/ui/button");
const popover_1 = require("./ui/popover");
const lucide_react_1 = require("lucide-react");
const utils_1 = require("@/lib/utils");
const command_1 = require("./ui/command");
const use_settings_1 = require("@/lib/hooks/use-settings");
const use_toast_1 = require("@/components/ui/use-toast");
const use_health_check_1 = require("@/lib/hooks/use-health-check");
const core_1 = require("@tauri-apps/api/core");
const badge_1 = require("./ui/badge");
const tooltip_1 = require("./ui/tooltip");
const switch_1 = require("./ui/switch");
const input_1 = require("./ui/input");
const slider_1 = require("./ui/slider");
const plugin_os_1 = require("@tauri-apps/plugin-os");
const posthog_js_1 = __importDefault(require("posthog-js"));
const language_1 = require("@/lib/language");
const plugin_dialog_1 = require("@tauri-apps/plugin-dialog");
const plugin_fs_1 = require("@tauri-apps/plugin-fs");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const toast_1 = require("@/components/ui/toast");
const plugin_shell_2 = require("@tauri-apps/plugin-shell");
const separator_1 = require("./ui/separator");
const multi_select_1 = require("@/components/ui/multi-select");
const alert_1 = require("./ui/alert");
const use_sql_autocomplete_1 = require("@/lib/hooks/use-sql-autocomplete");
const Sentry = __importStar(require("@sentry/react"));
const tauri_plugin_sentry_api_1 = require("tauri-plugin-sentry-api");
const createWindowOptions = (windowItems, existingPatterns) => {
    const windowOptions = windowItems
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => ({
        value: item.name,
        label: item.name,
        icon: lucide_react_1.AppWindowMac,
    }));
    // Only add custom patterns that aren't already in windowItems
    const customOptions = existingPatterns
        .filter((pattern) => !windowItems.some((item) => item.name === pattern))
        .map((pattern) => ({
        value: pattern,
        label: pattern,
        icon: lucide_react_1.Asterisk,
    }));
    return [...windowOptions, ...customOptions];
};
function RecordingSettings() {
    var _a, _b;
    const { settings, updateSettings, getDataDir } = (0, use_settings_1.useSettings)();
    const [openAudioDevices, setOpenAudioDevices] = react_1.default.useState(false);
    const [openMonitors, setOpenMonitors] = react_1.default.useState(false);
    const [openLanguages, setOpenLanguages] = react_1.default.useState(false);
    const [dataDirInputVisible, setDataDirInputVisible] = react_1.default.useState(false);
    const [clickTimeout, setClickTimeout] = (0, react_1.useState)(null);
    const [windowsForIgnore, setWindowsForIgnore] = (0, react_1.useState)("");
    const [windowsForInclude, setWindowsForInclude] = (0, react_1.useState)("");
    const { items: windowItems, isLoading: isWindowItemsLoading } = (0, use_sql_autocomplete_1.useSqlAutocomplete)("window");
    const [availableMonitors, setAvailableMonitors] = (0, react_1.useState)([]);
    const [availableAudioDevices, setAvailableAudioDevices] = (0, react_1.useState)([]);
    const { toast } = (0, use_toast_1.useToast)();
    const [isUpdating, setIsUpdating] = (0, react_1.useState)(false);
    const { health } = (0, use_health_check_1.useHealthCheck)();
    const isDisabled = (health === null || health === void 0 ? void 0 : health.status_code) === 500;
    const [isMacOS, setIsMacOS] = (0, react_1.useState)(false);
    const [isSetupRunning, setIsSetupRunning] = (0, react_1.useState)(false);
    const [showApiKey, setShowApiKey] = (0, react_1.useState)(false);
    const { credits } = settings.user || {};
    // Add new state to track if settings have changed
    const [hasUnsavedChanges, setHasUnsavedChanges] = (0, react_1.useState)(false);
    // Modify setLocalSettings to track changes
    const handleSettingsChange = (newSettings, restart = true) => {
        updateSettings(newSettings);
        if (restart) {
            setHasUnsavedChanges(true);
        }
    };
    // Show toast when settings change
    (0, react_1.useEffect)(() => {
        if (hasUnsavedChanges && !settings.devMode) {
            toast({
                title: "settings changed",
                description: "restart required to apply changes",
                action: (<toast_1.ToastAction altText="restart now" onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Wrap in setTimeout to ensure event handling is complete
                        setTimeout(() => {
                            handleUpdate();
                        }, 0);
                        return false;
                    }} onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }} onMouseUp={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}>
            restart now
          </toast_1.ToastAction>),
                duration: 50000,
            });
        }
    }, [hasUnsavedChanges]);
    (0, react_1.useEffect)(() => {
        const checkPlatform = () => __awaiter(this, void 0, void 0, function* () {
            const currentPlatform = (0, plugin_os_1.platform)();
            setIsMacOS(currentPlatform === "macos");
        });
        checkPlatform();
    }, []);
    (0, react_1.useEffect)(() => {
        const loadDevices = () => __awaiter(this, void 0, void 0, function* () {
            try {
                // Fetch monitors
                const monitorsResponse = yield fetch("http://localhost:3030/vision/list");
                if (!monitorsResponse.ok) {
                    throw new Error("Failed to fetch monitors");
                }
                const monitors = yield monitorsResponse.json();
                console.log("monitors", monitors);
                setAvailableMonitors(monitors);
                // Fetch audio devices
                const audioDevicesResponse = yield fetch("http://localhost:3030/audio/list");
                if (!audioDevicesResponse.ok) {
                    throw new Error("Failed to fetch audio devices");
                }
                const audioDevices = yield audioDevicesResponse.json();
                console.log("audioDevices", audioDevices);
                setAvailableAudioDevices(audioDevices);
                console.log("settings", settings);
                // Update monitors
                const availableMonitorIds = monitors.map((monitor) => monitor.id.toString());
                let updatedMonitorIds = settings.monitorIds.filter((id) => availableMonitorIds.includes(id));
                if (updatedMonitorIds.length === 0 ||
                    (settings.monitorIds.length === 1 &&
                        settings.monitorIds[0] === "default" &&
                        monitors.length > 0)) {
                    updatedMonitorIds = [
                        monitors.find((monitor) => monitor.is_default).id.toString(),
                    ];
                }
                // Update audio devices
                const availableAudioDeviceNames = audioDevices.map((device) => device.name);
                let updatedAudioDevices = settings.audioDevices.filter((device) => availableAudioDeviceNames.includes(device));
                if (updatedAudioDevices.length === 0 ||
                    (settings.audioDevices.length === 1 &&
                        settings.audioDevices[0] === "default" &&
                        audioDevices.length > 0)) {
                    updatedAudioDevices = audioDevices
                        .filter((device) => device.is_default)
                        .map((device) => device.name);
                }
                handleSettingsChange({
                    monitorIds: updatedMonitorIds,
                    audioDevices: updatedAudioDevices,
                }, false);
            }
            catch (error) {
                console.error("Failed to load devices:", error);
            }
        });
        loadDevices();
    }, []);
    const handleUpdate = () => __awaiter(this, void 0, void 0, function* () {
        setIsUpdating(true);
        toast({
            title: "Updating screenpipe recording settings",
            description: "This may take a few moments...",
        });
        try {
            console.log("settings", settings);
            if (!settings.analyticsEnabled) {
                posthog_js_1.default.capture("telemetry", {
                    enabled: false,
                });
                // disable opentelemetry
                posthog_js_1.default.opt_out_capturing();
                // disable sentry
                Sentry.close();
                console.log("telemetry disabled");
            }
            else {
                const isDebug = process.env.TAURI_ENV_DEBUG === "true";
                if (!isDebug) {
                    posthog_js_1.default.opt_in_capturing();
                    posthog_js_1.default.capture("telemetry", {
                        enabled: true,
                    });
                    // enable opentelemetry
                    console.log("telemetry enabled");
                    // enable sentry
                    Sentry.init(Object.assign({}, tauri_plugin_sentry_api_1.defaultOptions));
                }
            }
            yield (0, core_1.invoke)("stop_screenpipe");
            yield new Promise((resolve) => setTimeout(resolve, 1000));
            // Start a new instance with updated settings
            yield (0, core_1.invoke)("spawn_screenpipe");
            yield new Promise((resolve) => setTimeout(resolve, 2000));
            // await relaunch();
            toast({
                title: "settings updated successfully",
                description: "screenpipe has been restarted with new settings.",
            });
            window.location.reload();
        }
        catch (error) {
            console.error("failed to update settings:", error);
            toast({
                title: "error updating settings",
                description: "please try again or check the logs for more information.",
                variant: "destructive",
            });
        }
        finally {
            setIsUpdating(false);
        }
    });
    const handleAudioTranscriptionModelChange = (value) => {
        var _a;
        if (value === "screenpipe-cloud" && !((_a = settings.user) === null || _a === void 0 ? void 0 : _a.cloud_subscribed)) {
            (0, plugin_shell_2.open)("https://buy.stripe.com/7sIdRzbym4RA98c7sX");
            return;
        }
        if (value === "screenpipe-cloud") {
            handleSettingsChange({
                audioTranscriptionEngine: value,
            });
        }
        else {
            handleSettingsChange({ audioTranscriptionEngine: value });
        }
    };
    const handleOcrModelChange = (value) => {
        handleSettingsChange({ ocrEngine: value });
    };
    const handleLanguageChange = (currentValue) => {
        const updatedLanguages = settings.languages.includes(currentValue)
            ? settings.languages.filter((id) => id !== currentValue)
            : [...settings.languages, currentValue];
        handleSettingsChange({ languages: updatedLanguages });
    };
    const handleAudioDeviceChange = (currentValue) => {
        const updatedDevices = settings.audioDevices.includes(currentValue)
            ? settings.audioDevices.filter((device) => device !== currentValue)
            : [...settings.audioDevices, currentValue];
        handleSettingsChange({ audioDevices: updatedDevices });
    };
    const handlePiiRemovalChange = (checked) => {
        handleSettingsChange({ usePiiRemoval: checked });
    };
    const handleDisableAudioChange = (checked) => {
        handleSettingsChange({ disableAudio: checked });
    };
    const handleFpsChange = (value) => {
        handleSettingsChange({ fps: value[0] });
    };
    const handleVadSensitivityChange = (value) => {
        const sensitivityMap = {
            2: "high",
            1: "medium",
            0: "low",
        };
        handleSettingsChange({
            vadSensitivity: sensitivityMap[value[0]],
        });
    };
    const vadSensitivityToNumber = (sensitivity) => {
        const sensitivityMap = {
            high: 2,
            medium: 1,
            low: 0,
        };
        return sensitivityMap[sensitivity];
    };
    const handleAudioChunkDurationChange = (value) => {
        handleSettingsChange({ audioChunkDuration: value[0] });
    };
    const renderOcrEngineOptions = () => {
        const currentPlatform = (0, plugin_os_1.platform)();
        return (<>
        {currentPlatform === "linux" && (<select_1.SelectItem value="tesseract">tesseract</select_1.SelectItem>)}
        {currentPlatform === "windows" && (<select_1.SelectItem value="windows-native">windows native</select_1.SelectItem>)}
        {currentPlatform === "macos" && (<select_1.SelectItem value="apple-native">apple native</select_1.SelectItem>)}
      </>);
    };
    const handleAnalyticsToggle = (checked) => {
        const newValue = checked;
        handleSettingsChange({ analyticsEnabled: newValue });
    };
    const handleChineseMirrorToggle = (checked) => __awaiter(this, void 0, void 0, function* () {
        handleSettingsChange({ useChineseMirror: checked });
        if (checked) {
            // Trigger setup when the toggle is turned on
            yield runSetup();
        }
    });
    const handleDataDirChange = () => __awaiter(this, void 0, void 0, function* () {
        if (clickTimeout) {
            // Double Click
            clearTimeout(clickTimeout);
            setClickTimeout(null);
            setDataDirInputVisible(true);
        }
        else {
            const timeout = setTimeout(() => {
                // Single Click
                selectDataDir();
                setClickTimeout(null);
            }, 250);
            setClickTimeout(timeout);
        }
        function selectDataDir() {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const dataDir = yield getDataDir();
                    const selected = yield (0, plugin_dialog_1.open)({
                        directory: true,
                        multiple: false,
                        defaultPath: dataDir,
                    });
                    // TODO: check permission of selected dir for server to write into
                    if (selected) {
                        handleSettingsChange({ dataDir: selected });
                    }
                    else {
                        console.log("canceled");
                    }
                }
                catch (error) {
                    console.error("failed to change data directory:", error);
                    toast({
                        title: "error",
                        description: "failed to change data directory.",
                        variant: "destructive",
                        duration: 3000,
                    });
                }
            });
        }
    });
    const handleDataDirInputChange = (e) => __awaiter(this, void 0, void 0, function* () {
        const newValue = e.target.value;
        handleSettingsChange({ dataDir: newValue });
    });
    const handleDataDirInputBlur = () => {
        console.log("wcw blur");
        setDataDirInputVisible(false);
        validateDataDirInput();
    };
    const handleDataDirInputKeyDown = (e) => {
        if (e.key === "Enter") {
            setDataDirInputVisible(false);
            validateDataDirInput();
        }
    };
    const validateDataDirInput = () => __awaiter(this, void 0, void 0, function* () {
        try {
            if (yield (0, plugin_fs_1.exists)(settings.dataDir)) {
                return;
            }
        }
        catch (err) { }
        toast({
            title: "error",
            description: "failed to change data directory.",
            variant: "destructive",
            duration: 3000,
        });
        handleSettingsChange({ dataDir: settings.dataDir });
    });
    const runSetup = () => __awaiter(this, void 0, void 0, function* () {
        setIsSetupRunning(true);
        try {
            const command = plugin_shell_1.Command.sidecar("screenpipe", ["setup"]);
            const child = yield command.spawn();
            toast({
                title: "Setting up Chinese mirror",
                description: "This may take a few minutes...",
            });
            const outputPromise = new Promise((resolve, reject) => {
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
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Setup timed out")), 900000) // 15 minutes
            );
            const result = yield Promise.race([outputPromise, timeoutPromise]);
            if (result === "ok") {
                toast({
                    title: "Chinese mirror setup complete",
                    description: "You can now use the Chinese mirror for downloads.",
                });
            }
            else {
                throw new Error("Setup failed or timed out");
            }
        }
        catch (error) {
            console.error("Error setting up Chinese mirror:", error);
            toast({
                title: "Error setting up Chinese mirror",
                description: "Please try again or check the logs for more information.",
                variant: "destructive",
            });
            // Revert the toggle if setup fails
            handleSettingsChange({ useChineseMirror: false });
        }
        finally {
            setIsSetupRunning(false);
        }
    });
    const handleFrameCacheToggle = (checked) => {
        handleSettingsChange({
            enableFrameCache: checked,
        });
    };
    const handleUiMonitoringToggle = (checked) => __awaiter(this, void 0, void 0, function* () {
        try {
            if (checked) {
                // Check accessibility permissions first
                const perms = yield (0, core_1.invoke)("do_permissions_check", {
                    initialCheck: false,
                });
                if (!perms.accessibility) {
                    toast({
                        title: "accessibility permission required",
                        description: "please grant accessibility permission in system preferences",
                        action: (<toast_1.ToastAction altText="open preferences" onClick={() => (0, core_1.invoke)("open_accessibility_preferences")}>
                open preferences
              </toast_1.ToastAction>),
                        variant: "destructive",
                    });
                    return;
                }
            }
            // Just update the local setting - the update button will handle the restart
            handleSettingsChange({ enableUiMonitoring: checked });
        }
        catch (error) {
            console.error("failed to toggle ui monitoring:", error);
            toast({
                title: "error checking accessibility permissions",
                description: "please try again or check the logs",
                variant: "destructive",
            });
        }
    });
    const handleIgnoredWindowsChange = (values) => {
        // Convert all values to lowercase for comparison
        const lowerCaseValues = values.map((v) => v.toLowerCase());
        const currentLowerCase = settings.ignoredWindows.map((v) => v.toLowerCase());
        // Find added values (in values but not in current)
        const addedValues = values.filter((v) => !currentLowerCase.includes(v.toLowerCase()));
        // Find removed values (in current but not in values)
        const removedValues = settings.ignoredWindows.filter((v) => !lowerCaseValues.includes(v.toLowerCase()));
        if (addedValues.length > 0) {
            // Handle adding new value
            const newValue = addedValues[0];
            handleSettingsChange({
                ignoredWindows: [...settings.ignoredWindows, newValue],
                // Remove from included windows if present
                includedWindows: settings.includedWindows.filter((w) => w.toLowerCase() !== newValue.toLowerCase()),
            });
        }
        else if (removedValues.length > 0) {
            // Handle removing value
            const removedValue = removedValues[0];
            handleSettingsChange({
                ignoredWindows: settings.ignoredWindows.filter((w) => w !== removedValue),
            });
        }
    };
    const handleIncludedWindowsChange = (values) => {
        // Convert all values to lowercase for comparison
        const lowerCaseValues = values.map((v) => v.toLowerCase());
        const currentLowerCase = settings.includedWindows.map((v) => v.toLowerCase());
        // Find added values (in values but not in current)
        const addedValues = values.filter((v) => !currentLowerCase.includes(v.toLowerCase()));
        // Find removed values (in current but not in values)
        const removedValues = settings.includedWindows.filter((v) => !lowerCaseValues.includes(v.toLowerCase()));
        if (addedValues.length > 0) {
            // Handle adding new value
            const newValue = addedValues[0];
            handleSettingsChange({
                includedWindows: [...settings.includedWindows, newValue],
                // Remove from ignored windows if present
                ignoredWindows: settings.ignoredWindows.filter((w) => w.toLowerCase() !== newValue.toLowerCase()),
            });
        }
        else if (removedValues.length > 0) {
            // Handle removing value
            const removedValue = removedValues[0];
            handleSettingsChange({
                includedWindows: settings.includedWindows.filter((w) => w !== removedValue),
            });
        }
    };
    return (<div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold mb-4">recording</h1>
      {settings.devMode || (!isUpdating && isDisabled) ? (<alert_1.Alert>
          <lucide_react_1.Terminal className="h-4 w-4"/>
          <alert_1.AlertTitle>heads up!</alert_1.AlertTitle>
          <alert_1.AlertDescription>
            make sure to turn off dev mode and start screenpipe recorder first
            (go to status)
          </alert_1.AlertDescription>
        </alert_1.Alert>) : (<></>)}
      <div className={(0, utils_1.cn)(isDisabled && "opacity-50 pointer-events-none cursor-not-allowed")}>
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
            <switch_1.Switch id="disableVision" checked={settings.disableVision} onCheckedChange={(checked) => handleSettingsChange({ disableVision: checked })}/>
          </div>

          {!settings.disableVision && (<>
              <div className="flex items-center justify-between mb-4">
                <div className="space-y-1">
                  <h4 className="font-medium">use all monitors</h4>
                  <p className="text-sm text-muted-foreground">
                    automatically detect and record all monitors, including
                    newly connected ones
                  </p>
                </div>
                <switch_1.Switch id="useAllMonitors" checked={settings.useAllMonitors} onCheckedChange={(checked) => handleSettingsChange({ useAllMonitors: checked })}/>
              </div>

              <div className="flex flex-col space-y-6">
                <div className="flex flex-col space-y-2">
                  <label_1.Label htmlFor="monitorIds" className="flex items-center space-x-2">
                    <lucide_react_1.Monitor className="h-4 w-4"/>
                    <span>monitors</span>
                  </label_1.Label>
                  <multi_select_1.MultiSelect options={availableMonitors.map((monitor) => ({
                value: monitor.id.toString(),
                label: `${monitor.id}. ${monitor.name} - ${monitor.width}x${monitor.height} ${monitor.is_default ? "(default)" : ""}`,
            }))} defaultValue={settings.monitorIds} onValueChange={(values) => values.length === 0
                ? handleSettingsChange({ disableVision: true })
                : handleSettingsChange({ monitorIds: values })} placeholder={settings.useAllMonitors
                ? "all monitors will be used"
                : "select monitors"} variant="default" modalPopover={true} animation={2} disabled={settings.useAllMonitors}/>
                </div>

                <div className="flex flex-col space-y-2">
                  <label_1.Label htmlFor="ocrModel" className="flex items-center space-x-2">
                    <lucide_react_1.Eye className="h-4 w-4"/>
                    <span>ocr model</span>
                  </label_1.Label>
                  <select_1.Select onValueChange={handleOcrModelChange} defaultValue={settings.ocrEngine}>
                    <select_1.SelectTrigger>
                      <select_1.SelectValue className="capitalize" placeholder="select ocr engine"/>
                    </select_1.SelectTrigger>
                    <select_1.SelectContent className="capitalize">
                      {renderOcrEngineOptions()}
                    </select_1.SelectContent>
                  </select_1.Select>
                </div>
                <div className="flex flex-col space-y-2">
                  <label_1.Label htmlFor="fps" className="flex items-center space-x-2">
                    <span>frames per second (fps)</span>
                    <tooltip_1.TooltipProvider>
                      <tooltip_1.Tooltip>
                        <tooltip_1.TooltipTrigger>
                          <lucide_react_1.HelpCircle className="h-4 w-4 cursor-default"/>
                        </tooltip_1.TooltipTrigger>
                        <tooltip_1.TooltipContent side="right">
                          <p>
                            adjust the recording frame rate. lower values save
                            <br />
                            resources, higher values provide smoother
                            recordings, less likely to miss activity.
                            <br />
                            (we do not use resources if your screen does not
                            change much)
                          </p>
                        </tooltip_1.TooltipContent>
                      </tooltip_1.Tooltip>
                    </tooltip_1.TooltipProvider>
                  </label_1.Label>
                  <div className="flex items-center space-x-4">
                    <slider_1.Slider id="fps" min={0.1} max={10} step={0.1} value={[settings.fps]} onValueChange={handleFpsChange} className="flex-grow"/>
                    <span className="w-12 text-right">
                      {settings.fps.toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="flex flex-col space-y-2">
                    <label_1.Label htmlFor="ignoredWindows" className="flex items-center space-x-2">
                      <span>ignored windows</span>
                      <tooltip_1.TooltipProvider>
                        <tooltip_1.Tooltip>
                          <tooltip_1.TooltipTrigger>
                            <lucide_react_1.HelpCircle className="h-4 w-4 cursor-default"/>
                          </tooltip_1.TooltipTrigger>
                          <tooltip_1.TooltipContent side="right">
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
                          </tooltip_1.TooltipContent>
                        </tooltip_1.Tooltip>
                      </tooltip_1.TooltipProvider>
                    </label_1.Label>
                    <multi_select_1.MultiSelect options={createWindowOptions(windowItems, settings.ignoredWindows)} defaultValue={settings.ignoredWindows} onValueChange={handleIgnoredWindowsChange} placeholder="add windows to ignore" variant="default" modalPopover={true} animation={2} allowCustomValues={true} validateCustomValue={(value) => value.length >= 2}/>
                  </div>

                  <div className="flex flex-col space-y-2">
                    <label_1.Label htmlFor="includedWindows" className="flex items-center space-x-2">
                      <span>included windows</span>
                      <tooltip_1.TooltipProvider>
                        <tooltip_1.Tooltip>
                          <tooltip_1.TooltipTrigger>
                            <lucide_react_1.HelpCircle className="h-4 w-4 cursor-default"/>
                          </tooltip_1.TooltipTrigger>
                          <tooltip_1.TooltipContent side="right">
                            <p>
                              windows to include during screen recording
                              (case-insensitive), example:
                              <br />
                              - &quot;chrome&quot; will match &quot;Google
                              Chrome&quot;
                              <br />- &quot;bitwarden&quot; will match
                              &quot;Bitwarden&quot; and &quot;bittorrent&quot;
                            </p>
                          </tooltip_1.TooltipContent>
                        </tooltip_1.Tooltip>
                      </tooltip_1.TooltipProvider>
                    </label_1.Label>
                    <multi_select_1.MultiSelect options={createWindowOptions(windowItems, settings.includedWindows)} defaultValue={settings.includedWindows} onValueChange={handleIncludedWindowsChange} placeholder="add window to include" variant="default" modalPopover={true} animation={2} allowCustomValues={true} validateCustomValue={(value) => value.length >= 2}/>
                  </div>
                </div>

                {/*  */}
              </div>
              <separator_1.Separator className="my-6"/>
            </>)}
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
            <switch_1.Switch id="disableAudio" checked={settings.disableAudio} onCheckedChange={handleDisableAudioChange}/>
          </div>

          {!settings.disableAudio && (<>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="font-medium">
                    enable realtime audio transcription
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    transcribe audio in real-time as you speak (dev preview) -{" "}
                    <a href="https://github.com/mediar-ai/screenpipe/blob/main/screenpipe-js/examples/basic-transcription/index.ts" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      view example
                    </a>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <switch_1.Switch id="enableRealtimeAudio" checked={settings.enableRealtimeAudioTranscription} onCheckedChange={(checked) => handleSettingsChange({
                enableRealtimeAudioTranscription: checked,
            })}/>
                </div>
              </div>

              {settings.enableRealtimeAudioTranscription && (<div className="flex flex-col space-y-2">
                  <label_1.Label htmlFor="realtimeAudioTranscriptionEngine" className="flex items-center space-x-2">
                    <lucide_react_1.Mic className="h-4 w-4"/>
                    <span>realtime transcription model</span>
                  </label_1.Label>
                  <select_1.Select onValueChange={(value) => handleSettingsChange({
                    realtimeAudioTranscriptionEngine: value,
                })} value={settings.realtimeAudioTranscriptionEngine}>
                    <select_1.SelectTrigger>
                      <select_1.SelectValue placeholder="select realtime transcription engine"/>
                    </select_1.SelectTrigger>
                    <select_1.SelectContent>
                      <select_1.SelectItem value="screenpipe-cloud">
                        <div className="flex items-center justify-between w-full space-x-2">
                          <span>screenpipe cloud</span>
                          <div className="flex items-center gap-2">
                            <badge_1.Badge variant="secondary">cloud</badge_1.Badge>
                            {!((_a = settings.user) === null || _a === void 0 ? void 0 : _a.cloud_subscribed) && (<badge_1.Badge variant="outline" className="text-xs">
                                get screenpipe cloud
                              </badge_1.Badge>)}
                          </div>
                        </div>
                      </select_1.SelectItem>
                      <select_1.SelectItem value="deepgram">
                        <div className="flex items-center justify-between w-full space-x-2">
                          <span>deepgram</span>
                          <badge_1.Badge variant="secondary">cloud</badge_1.Badge>
                        </div>
                      </select_1.SelectItem>
                    </select_1.SelectContent>
                  </select_1.Select>
                </div>)}

              <div className="flex flex-col space-y-2">
                <label_1.Label htmlFor="audioTranscriptionModel" className="flex items-center space-x-2">
                  <lucide_react_1.Mic className="h-4 w-4"/>
                  <span>audio transcription model</span>
                </label_1.Label>
                <select_1.Select onValueChange={handleAudioTranscriptionModelChange} value={settings.audioTranscriptionEngine}>
                  <select_1.SelectTrigger>
                    <select_1.SelectValue placeholder="select audio transcription engine"/>
                  </select_1.SelectTrigger>
                  <select_1.SelectContent>
                    <select_1.SelectItem value="screenpipe-cloud">
                      <div className="flex items-center justify-between w-full space-x-2">
                        <span>screenpipe cloud</span>
                        <div className="flex items-center gap-2">
                          <badge_1.Badge variant="secondary">cloud</badge_1.Badge>
                          {!((_b = settings.user) === null || _b === void 0 ? void 0 : _b.cloud_subscribed) && (<badge_1.Badge variant="outline" className="text-xs">
                              get screenpipe cloud
                            </badge_1.Badge>)}
                        </div>
                      </div>
                    </select_1.SelectItem>
                    <select_1.SelectItem value="deepgram">
                      <div className="flex items-center justify-between w-full space-x-2">
                        <span>deepgram</span>
                        <badge_1.Badge variant="secondary">cloud</badge_1.Badge>
                      </div>
                    </select_1.SelectItem>
                    <select_1.SelectItem value="whisper-tiny">whisper-tiny</select_1.SelectItem>
                    <select_1.SelectItem value="whisper-large">whisper-large</select_1.SelectItem>
                    <select_1.SelectItem value="whisper-large-v3-turbo">
                      whisper-large-turbo
                    </select_1.SelectItem>
                  </select_1.SelectContent>
                </select_1.Select>
              </div>

              {settings.audioTranscriptionEngine === "deepgram" && (<div className="mt-2">
                  <div className="flex flex-col space-y-2">
                    <label_1.Label htmlFor="deepgramApiKey" className="flex items-center gap-2">
                      <lucide_react_1.Key className="h-4 w-4"/>
                      <span>api key</span>
                    </label_1.Label>
                    <div className="flex-grow relative">
                      <input_1.Input id="deepgramApiKey" type={showApiKey ? "text" : "password"} value={settings.deepgramApiKey} onChange={(e) => {
                    const newValue = e.target.value;
                    handleSettingsChange({
                        deepgramApiKey: newValue,
                    });
                }} className="pr-10 w-full" placeholder="enter your Deepgram API key" autoCorrect="off" autoCapitalize="off" autoComplete="off"/>
                      <button_1.Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowApiKey(!showApiKey)}>
                        {showApiKey ? (<lucide_react_1.EyeOff className="h-4 w-4"/>) : (<lucide_react_1.Eye className="h-4 w-4"/>)}
                      </button_1.Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-left mt-1">
                    don&apos;t have an api key? get one from{" "}
                    <a href="https://console.deepgram.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      deepgram&apos;s website
                    </a>{" "}
                    or use screenpipe cloud
                  </p>
                </div>)}

              <div className="flex flex-col space-y-2">
                <label_1.Label htmlFor="audioDevices" className="flex items-center space-x-2">
                  <lucide_react_1.Mic className="h-4 w-4"/>
                  <span>audio devices</span>
                </label_1.Label>
                <popover_1.Popover open={openAudioDevices} onOpenChange={setOpenAudioDevices} modal={true}>
                  <popover_1.PopoverTrigger asChild>
                    <button_1.Button variant="outline" role="combobox" aria-expanded={openAudioDevices} className="w-full justify-between">
                      {settings.audioDevices.length > 0
                ? `${settings.audioDevices.length} device(s) selected`
                : "select audio devices"}
                      <lucide_react_1.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                    </button_1.Button>
                  </popover_1.PopoverTrigger>
                  <popover_1.PopoverContent className="w-full p-0">
                    <command_1.Command>
                      <command_1.CommandInput placeholder="search audio devices..."/>
                      <command_1.CommandList>
                        <command_1.CommandEmpty>no audio device found.</command_1.CommandEmpty>
                        <command_1.CommandGroup>
                          {availableAudioDevices.map((device) => (<command_1.CommandItem key={device.name} value={device.name} onSelect={() => handleAudioDeviceChange(device.name)}>
                              <div className="flex items-center">
                                <lucide_react_1.Check className={(0, utils_1.cn)("mr-2 h-4 w-4", settings.audioDevices.includes(device.name)
                    ? "opacity-100"
                    : "opacity-0")}/>
                                <span style={{
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    MozUserSelect: "none",
                    msUserSelect: "none",
                }}>
                                  {device.name}{" "}
                                  {device.is_default ? "(default)" : ""}
                                </span>
                              </div>
                            </command_1.CommandItem>))}
                        </command_1.CommandGroup>
                      </command_1.CommandList>
                    </command_1.Command>
                  </popover_1.PopoverContent>
                </popover_1.Popover>
              </div>

              <div className="flex flex-col space-y-2">
                <label_1.Label htmlFor="languages" className="flex items-center space-x-2">
                  <lucide_react_1.Languages className="h-4 w-4"/>
                  <span>languages</span>
                </label_1.Label>
                <popover_1.Popover open={openLanguages} onOpenChange={setOpenLanguages}>
                  <popover_1.PopoverTrigger asChild>
                    <button_1.Button variant="outline" role="combobox" aria-expanded={openLanguages} className="w-full justify-between">
                      {settings.languages.length > 0
                ? `${settings.languages.join(", ")}`
                : "select languages"}
                      <lucide_react_1.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                    </button_1.Button>
                  </popover_1.PopoverTrigger>
                  <popover_1.PopoverContent className="w-full p-0">
                    <command_1.Command>
                      <command_1.CommandInput placeholder="search languages..."/>
                      <command_1.CommandList>
                        <command_1.CommandEmpty>no language found.</command_1.CommandEmpty>
                        <command_1.CommandGroup>
                          {Object.entries(language_1.Language).map(([language, id]) => (<command_1.CommandItem key={language} value={language} onSelect={() => handleLanguageChange(id)}>
                              <div className="flex items-center">
                                <lucide_react_1.Check className={(0, utils_1.cn)("mr-2 h-4 w-4", settings.languages.includes(id)
                    ? "opacity-100"
                    : "opacity-0")}/>
                                {/* not selectable */}
                                <span style={{
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    MozUserSelect: "none",
                    msUserSelect: "none",
                }}>
                                  {language}
                                </span>
                              </div>
                            </command_1.CommandItem>))}
                        </command_1.CommandGroup>
                      </command_1.CommandList>
                    </command_1.Command>
                  </popover_1.PopoverContent>
                </popover_1.Popover>
              </div>

              <div className="flex flex-col space-y-2">
                <label_1.Label htmlFor="vadSensitivity" className="flex items-center space-x-2">
                  <span>voice activity detection sensitivity</span>
                  <tooltip_1.TooltipProvider>
                    <tooltip_1.Tooltip>
                      <tooltip_1.TooltipTrigger>
                        <lucide_react_1.HelpCircle className="h-4 w-4 cursor-default"/>
                      </tooltip_1.TooltipTrigger>
                      <tooltip_1.TooltipContent side="right">
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
                      </tooltip_1.TooltipContent>
                    </tooltip_1.Tooltip>
                  </tooltip_1.TooltipProvider>
                </label_1.Label>
                <div className="flex items-center space-x-4">
                  <slider_1.Slider id="vadSensitivity" min={0} max={2} step={1} value={[vadSensitivityToNumber(settings.vadSensitivity)]} onValueChange={handleVadSensitivityChange} className="flex-grow"/>
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
                <label_1.Label htmlFor="audioChunkDuration" className="flex items-center space-x-2">
                  <span>audio chunk duration (seconds)</span>
                  <tooltip_1.TooltipProvider>
                    <tooltip_1.Tooltip>
                      <tooltip_1.TooltipTrigger>
                        <lucide_react_1.HelpCircle className="h-4 w-4 cursor-default"/>
                      </tooltip_1.TooltipTrigger>
                      <tooltip_1.TooltipContent side="right">
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
                      </tooltip_1.TooltipContent>
                    </tooltip_1.Tooltip>
                  </tooltip_1.TooltipProvider>
                </label_1.Label>
                <div className="flex items-center space-x-4">
                  <slider_1.Slider id="audioChunkDuration" min={5} max={3000} step={1} value={[settings.audioChunkDuration]} onValueChange={handleAudioChunkDurationChange} className="flex-grow"/>
                  <span className="w-12 text-right">
                    {settings.audioChunkDuration} s
                  </span>
                </div>
              </div>
            </>)}
        </div>

        <separator_1.Separator className="my-6"/>

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
                <badge_1.Badge variant="secondary">experimental</badge_1.Badge>
                <switch_1.Switch id="piiRemoval" checked={settings.usePiiRemoval} onCheckedChange={handlePiiRemovalChange}/>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="font-medium">enable telemetry</h4>
                <p className="text-sm text-muted-foreground">
                  help improve screenpipe with anonymous usage data
                </p>
              </div>
              <switch_1.Switch id="analytics-toggle" checked={settings.analyticsEnabled} onCheckedChange={handleAnalyticsToggle}/>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="font-medium">use chinese mirror</h4>
                <p className="text-sm text-muted-foreground">
                  alternative download source for hugging face models in
                  mainland china
                </p>
              </div>
              <switch_1.Switch id="chinese-mirror-toggle" checked={settings.useChineseMirror} onCheckedChange={handleChineseMirrorToggle}/>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="font-medium">enable rewind</h4>
                <p className="text-sm text-muted-foreground">
                  experimental feature that provides a rewind interface for the
                  rewind pipe
                </p>
              </div>
              <switch_1.Switch id="frame-cache-toggle" checked={settings.enableFrameCache} onCheckedChange={handleFrameCacheToggle}/>
            </div>

            {isMacOS && (<div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="font-medium">enable ui monitoring</h4>
                  <p className="text-sm text-muted-foreground">
                    monitor ui elements for better search context (requires
                    accessibility permission)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <switch_1.Switch id="ui-monitoring-toggle" checked={settings.enableUiMonitoring} onCheckedChange={handleUiMonitoringToggle}/>
                </div>
              </div>)}

            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <lucide_react_1.Folder className="h-5 w-5"/>
                <h3 className="text-lg font-semibold">data directory</h3>
              </div>

              {!dataDirInputVisible ? (<button_1.Button variant="outline" role="combobox" className="w-full justify-between" onClick={handleDataDirChange}>
                  <div className="flex gap-4">
                    {!!settings.dataDir
                ? "change directory"
                : "select directory"}
                    <span className="text-muted-foreground">
                      {settings.dataDir === settings.dataDir
                ? `current at: ${settings.dataDir || "default directory"}`
                : `change to: ${settings.dataDir || "default directory"}`}
                    </span>
                  </div>
                  <lucide_react_1.ChevronsUpDown className="h-4 w-4 opacity-50"/>
                </button_1.Button>) : (<input_1.Input id="dataDir" type="text" autoFocus={true} value={settings.dataDir} onChange={handleDataDirInputChange} onBlur={handleDataDirInputBlur} onKeyDown={handleDataDirInputKeyDown}/>)}
            </div>

            {/*  */}
          </div>
        </div>
      </div>
    </div>);
}
