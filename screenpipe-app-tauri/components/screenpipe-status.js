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
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const dialog_1 = require("@/components/ui/dialog");
const badge_1 = require("./ui/badge");
const core_1 = require("@tauri-apps/api/core");
const use_toast_1 = require("./ui/use-toast");
const button_1 = require("./ui/button");
const separator_1 = require("./ui/separator");
const use_health_check_1 = require("@/lib/hooks/use-health-check");
const lucide_react_1 = require("lucide-react");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const log_file_button_1 = require("./log-file-button");
const dev_mode_settings_1 = require("./dev-mode-settings");
const utils_1 = require("@/lib/utils");
const lucide_react_2 = require("lucide-react");
const use_settings_1 = require("@/lib/hooks/use-settings");
const use_status_dialog_1 = require("@/lib/hooks/use-status-dialog");
const plugin_os_1 = require("@tauri-apps/plugin-os");
const HealthStatus = ({ className }) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const { health } = (0, use_health_check_1.useHealthCheck)();
    const { isOpen, open, close } = (0, use_status_dialog_1.useStatusDialog)();
    const { settings, getDataDir } = (0, use_settings_1.useSettings)();
    const [localDataDir, setLocalDataDir] = (0, react_1.useState)("");
    const [permissions, setPermissions] = (0, react_1.useState)(null);
    const [isMacOS, setIsMacOS] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        const checkPermissions = () => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const perms = yield (0, core_1.invoke)("do_permissions_check", {
                    initialCheck: true,
                });
                setPermissions({
                    screenRecording: perms.screenRecording,
                    microphone: perms.microphone,
                    accessibility: perms.accessibility,
                });
            }
            catch (error) {
                console.error("Failed to check permissions:", error);
            }
        });
        checkPermissions();
    }, []);
    (0, react_1.useEffect)(() => {
        const checkPlatform = () => {
            const currentPlatform = (0, plugin_os_1.platform)();
            setIsMacOS(currentPlatform === "macos");
        };
        checkPlatform();
    }, []);
    const handleOpenDataDir = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const dataDir = yield getDataDir();
            yield (0, plugin_shell_1.open)(dataDir);
        }
        catch (error) {
            console.error("failed to open data directory:", error);
            (0, use_toast_1.toast)({
                title: "error",
                description: "failed to open data directory.",
                variant: "destructive",
                duration: 3000,
            });
        }
    });
    const getStatusColor = (status, frameStatus, audioStatus, uiStatus, audioDisabled, uiMonitoringEnabled) => {
        if (status === "loading")
            return "bg-yellow-500";
        const isVisionOk = frameStatus === "ok" || frameStatus === "disabled";
        const isAudioOk = audioStatus === "ok" || audioStatus === "disabled" || audioDisabled;
        const isUiOk = uiStatus === "ok" || uiStatus === "disabled" || !uiMonitoringEnabled;
        return isVisionOk && isAudioOk && isUiOk ? "bg-green-500" : "bg-red-500";
    };
    const getStatusMessage = (status, frameStatus, audioStatus, uiStatus, audioDisabled, uiMonitoringEnabled) => {
        if (status === "loading")
            return "screenpipe is starting up. this may take a few minutes...";
        let issues = [];
        if (frameStatus !== "ok" && frameStatus !== "disabled")
            issues.push("screen recording");
        if (!audioDisabled && audioStatus !== "ok" && audioStatus !== "disabled")
            issues.push("audio recording");
        if (uiMonitoringEnabled && uiStatus !== "ok" && uiStatus !== "disabled")
            issues.push("ui monitoring");
        if (issues.length === 0)
            return "screenpipe is running smoothly";
        return `there might be an issue with ${issues.join(" and ")}`;
    };
    const formatTimestamp = (timestamp) => {
        return timestamp ? new Date(timestamp).toLocaleString() : "n/a";
    };
    const statusColor = getStatusColor((_a = health === null || health === void 0 ? void 0 : health.status) !== null && _a !== void 0 ? _a : "", (_b = health === null || health === void 0 ? void 0 : health.frame_status) !== null && _b !== void 0 ? _b : "", (_c = health === null || health === void 0 ? void 0 : health.audio_status) !== null && _c !== void 0 ? _c : "", (_d = health === null || health === void 0 ? void 0 : health.ui_status) !== null && _d !== void 0 ? _d : "", settings.disableAudio, settings.enableUiMonitoring);
    const statusMessage = getStatusMessage((_e = health === null || health === void 0 ? void 0 : health.status) !== null && _e !== void 0 ? _e : "", (_f = health === null || health === void 0 ? void 0 : health.frame_status) !== null && _f !== void 0 ? _f : "", (_g = health === null || health === void 0 ? void 0 : health.audio_status) !== null && _g !== void 0 ? _g : "", (_h = health === null || health === void 0 ? void 0 : health.ui_status) !== null && _h !== void 0 ? _h : "", (_j = settings.disableAudio) !== null && _j !== void 0 ? _j : "", settings.enableUiMonitoring);
    const handleOpenStatusDialog = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const dir = yield getDataDir();
            setLocalDataDir(dir);
            open();
        }
        catch (error) {
            console.error("failed to open status dialog:", error);
            (0, use_toast_1.toast)({
                title: "error",
                description: "failed to open status dialog. please try again.",
                variant: "destructive",
                duration: 3000,
            });
        }
    });
    const handlePermissionButton = (type) => __awaiter(void 0, void 0, void 0, function* () {
        const toastId = (0, use_toast_1.toast)({
            title: `checking ${type} permissions`,
            description: "please wait...",
            duration: Infinity,
        });
        try {
            const permissionType = type === "screen"
                ? "screenRecording"
                : type === "audio"
                    ? "microphone"
                    : "accessibility";
            yield (0, core_1.invoke)("request_permission", {
                permission: permissionType,
            });
            const perms = yield (0, core_1.invoke)("do_permissions_check", {
                initialCheck: false,
            });
            setPermissions({
                screenRecording: perms.screenRecording,
                microphone: perms.microphone,
                accessibility: perms.accessibility,
            });
            const granted = type === "screen"
                ? perms.screenRecording === "Granted"
                : type === "audio"
                    ? perms.microphone === "Granted"
                    : perms.accessibility === "Granted";
            toastId.update({
                id: toastId.id,
                title: granted ? "permission granted" : "permission check complete",
                description: granted
                    ? `${type} permission was successfully granted`
                    : `please try granting ${type} permission again if needed`,
                duration: 3000,
            });
        }
        catch (error) {
            console.error(`failed to handle ${type} permission:`, error);
            toastId.update({
                id: toastId.id,
                title: "error",
                description: `failed to handle ${type} permission`,
                variant: "destructive",
                duration: 3000,
            });
        }
    });
    return (<>
      <badge_1.Badge variant="default" className={(0, utils_1.cn)("cursor-pointer bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground")} onClick={handleOpenStatusDialog}>
        {/* <Activity className="mr-2 h-4 w-4" /> */}
        <lucide_react_1.Power className="mr-2 h-4 w-4"/>
        <span className={`ml-1 w-2 h-2 rounded-full ${statusColor} inline-block ${statusColor === "bg-red-500" ? "animate-pulse" : ""}`}/>
      </badge_1.Badge>
      <dialog_1.Dialog open={isOpen} onOpenChange={close}>
        <dialog_1.DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-8" aria-describedby="status-dialog-description">
          <dialog_1.DialogHeader className="flex flex-row items-center justify-between">
            <dialog_1.DialogTitle>screenpipe status</dialog_1.DialogTitle>
            <div className="flex space-x-2">
              <log_file_button_1.LogFileButton size="10"/>

              <button_1.Button variant="outline" onClick={handleOpenDataDir} className="flex-shrink-0">
                <lucide_react_1.Folder className="h-4 w-4 mr-2"/>
                view saved data
              </button_1.Button>
            </div>
          </dialog_1.DialogHeader>
          <div className="flex-grow overflow-auto">
            <p className="text-sm mb-4 font-semibold">{statusMessage}</p>
            <div className="space-y-2 text-sm">
              {/* Screen Recording Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${(health === null || health === void 0 ? void 0 : health.frame_status) === "ok"
            ? "bg-green-500"
            : "bg-red-500"}`}/>
                  <span className="text-sm">screen recording</span>
                  <span className="text-sm text-muted-foreground">
                    status: {health ? health.frame_status : "error"}, last
                    update:{" "}
                    {formatTimestamp((_k = health === null || health === void 0 ? void 0 : health.last_frame_timestamp) !== null && _k !== void 0 ? _k : null)}
                  </span>
                </div>
                {isMacOS && (<div className="flex items-center gap-2">
                    {permissions && (<span>
                        {permissions.screenRecording ? (<lucide_react_2.Check className="h-4 w-4 text-green-500"/>) : (<lucide_react_2.X className="h-4 w-4 text-red-500"/>)}
                      </span>)}
                    <button_1.Button variant="outline" className="w-[260px] text-sm justify-start" onClick={() => handlePermissionButton("screen")}>
                      <lucide_react_1.Lock className="h-4 w-4 mr-2"/>
                      grant screen permission
                    </button_1.Button>
                  </div>)}
              </div>

              {/* Audio Recording Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${settings.disableAudio
            ? "bg-gray-400"
            : (health === null || health === void 0 ? void 0 : health.audio_status) === "ok"
                ? "bg-green-500"
                : "bg-red-500"}`}/>
                  <span className="text-sm">audio recording</span>
                  <span className="text-sm text-muted-foreground">
                    status:{" "}
                    {settings.disableAudio
            ? "turned off"
            : health
                ? health.audio_status
                : "error"}
                    , last update:{" "}
                    {settings.disableAudio
            ? "n/a"
            : formatTimestamp((_l = health === null || health === void 0 ? void 0 : health.last_audio_timestamp) !== null && _l !== void 0 ? _l : null)}
                  </span>
                </div>
                {isMacOS && (<div className="flex items-center gap-2">
                    {permissions && (<span>
                        {permissions.microphone ? (<lucide_react_2.Check className="h-4 w-4 text-green-500"/>) : (<lucide_react_2.X className="h-4 w-4 text-red-500"/>)}
                      </span>)}
                    <button_1.Button variant="outline" className="w-[260px] text-sm justify-start" onClick={() => handlePermissionButton("audio")} disabled={settings.disableAudio}>
                      <lucide_react_1.Lock className="h-4 w-4 mr-2"/>
                      grant audio permission
                    </button_1.Button>
                  </div>)}
              </div>

              {/* UI Monitoring Status */}
              {settings.enableUiMonitoring && (<div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${(health === null || health === void 0 ? void 0 : health.ui_status) === "ok"
                ? "bg-green-500"
                : "bg-red-500"}`}/>
                    <span className="text-sm">ui monitoring</span>
                    <span className="text-sm text-muted-foreground">
                      status: {health === null || health === void 0 ? void 0 : health.ui_status}, last update:{" "}
                      {formatTimestamp(health ? health.last_ui_timestamp : "error")}
                    </span>
                  </div>
                  {isMacOS && (<div className="flex items-center gap-2">
                      {permissions && (<span>
                          {permissions.accessibility ? (<lucide_react_2.Check className="h-4 w-4 text-green-500"/>) : (<lucide_react_2.X className="h-4 w-4 text-red-500"/>)}
                        </span>)}
                      <button_1.Button variant="outline" className="w-[260px] text-sm justify-start" onClick={() => handlePermissionButton("accessibility")}>
                        <lucide_react_1.Lock className="h-4 w-4 mr-2"/>
                        grant accessibility permission
                      </button_1.Button>
                    </div>)}
                </div>)}
            </div>

            <separator_1.Separator className="my-12"/>
            <dev_mode_settings_1.DevModeSettings localDataDir={localDataDir}/>
          </div>
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
    </>);
};
exports.default = HealthStatus;
