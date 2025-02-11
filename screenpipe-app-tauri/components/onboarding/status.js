"use strict";
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
const react_1 = __importStar(require("react"));
const lucide_react_1 = require("lucide-react");
const dialog_1 = require("@/components/ui/dialog");
const navigation_1 = __importDefault(require("@/components/onboarding/navigation"));
const button_1 = require("../ui/button");
const switch_1 = require("../ui/switch");
const tooltip_1 = require("../ui/tooltip");
const use_settings_1 = require("@/lib/hooks/use-settings");
const label_1 = require("../ui/label");
const plugin_os_1 = require("@tauri-apps/plugin-os");
const log_file_button_1 = require("../log-file-button");
const separator_1 = require("../ui/separator");
const core_1 = require("@tauri-apps/api/core");
const posthog_js_1 = __importDefault(require("posthog-js"));
const use_toast_1 = require("@/components/ui/use-toast");
const localforage_1 = __importDefault(require("localforage"));
const setRestartPending = () => __awaiter(void 0, void 0, void 0, function* () {
    yield localforage_1.default.setItem("screenPermissionRestartPending", true);
});
const OnboardingStatus = ({ className = "", handlePrevSlide, handleNextSlide, }) => {
    const [status, setStatus] = (0, react_1.useState)(null);
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const [useChineseMirror, setUseChineseMirror] = (0, react_1.useState)(false);
    const { updateSettings } = (0, use_settings_1.useSettings)();
    const [permissions, setPermissions] = (0, react_1.useState)(null);
    const [isRestartNeeded, setIsRestartNeeded] = (0, react_1.useState)(false);
    const [stats, setStats] = (0, react_1.useState)(null);
    const [isMacOS, setIsMacOS] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        const checkRestartStatus = () => __awaiter(void 0, void 0, void 0, function* () {
            const restartPending = yield localforage_1.default.getItem("screenPermissionRestartPending");
            if (restartPending) {
                // Clear the flag
                yield localforage_1.default.removeItem("screenPermissionRestartPending");
                // Recheck permissions
                const perms = yield (0, core_1.invoke)("do_permissions_check", {
                    initialCheck: true,
                });
                setPermissions(perms);
            }
        });
        checkRestartStatus();
    }, []);
    (0, react_1.useEffect)(() => {
        const checkPermissions = () => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const perms = yield (0, core_1.invoke)("do_permissions_check", {
                    initialCheck: true,
                });
                setPermissions(perms);
            }
            catch (error) {
                console.error("Failed to check permissions:", error);
            }
        });
        checkPermissions();
    }, []);
    (0, react_1.useEffect)(() => {
        const fetchStats = () => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const screenshotsResponse = yield fetch("http://localhost:3030/raw_sql", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        query: `SELECT COUNT(*) as count FROM frames`,
                    }),
                });
                const screenshotsResult = yield screenshotsResponse.json();
                const audioResponse = yield fetch("http://localhost:3030/raw_sql", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        query: `
              SELECT 
                ROUND(SUM((end_time - start_time)), 2) as total_seconds
              FROM audio_transcriptions 
              WHERE start_time IS NOT NULL 
              AND end_time IS NOT NULL
            `,
                    }),
                });
                const audioResult = yield audioResponse.json();
                setStats({
                    screenshots: screenshotsResult[0].count,
                    audioSeconds: audioResult[0].total_seconds || 0,
                });
            }
            catch (error) {
                console.error("failed to fetch stats:", error);
            }
        });
        // initial fetch
        fetchStats();
        // set up interval for periodic updates
        const interval = setInterval(fetchStats, 1000); // refresh every second
        // cleanup interval on unmount
        return () => clearInterval(interval);
    }, []);
    (0, react_1.useEffect)(() => {
        const checkPlatform = () => {
            const currentPlatform = (0, plugin_os_1.platform)();
            setIsMacOS(currentPlatform === "macos");
        };
        checkPlatform();
    }, []);
    const handlePermissionButton = (type) => __awaiter(void 0, void 0, void 0, function* () {
        const toastId = (0, use_toast_1.toast)({
            title: `checking ${type} permissions`,
            description: "please wait...",
            duration: Infinity,
        });
        try {
            const os = (0, plugin_os_1.platform)();
            const permissionType = type === "screen"
                ? "screenRecording"
                : type === "audio"
                    ? "microphone"
                    : "accessibility";
            yield (0, core_1.invoke)("request_permission", {
                permission: permissionType,
            });
            // Only handle macOS screen recording special case after requesting permission
            if (os === "macos" && type === "screen") {
                setIsRestartNeeded(true);
                yield setRestartPending();
                (0, use_toast_1.toast)({
                    title: "restart required",
                    description: "please restart the app after enabling screen recording permission",
                    duration: 10000,
                });
                return;
            }
            // Immediately check permissions after granting
            const perms = yield (0, core_1.invoke)("do_permissions_check", {
                initialCheck: false,
            });
            setPermissions(perms);
            const granted = type === "screen"
                ? perms.screenRecording.toLowerCase() === "granted"
                : type === "audio"
                    ? perms.microphone.toLowerCase() === "granted"
                    : perms.accessibility.toLowerCase() === "granted";
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
    const handleStartScreenpipe = () => __awaiter(void 0, void 0, void 0, function* () {
        posthog_js_1.default.capture("screenpipe_setup_start");
        setIsLoading(true);
        const toastId = (0, use_toast_1.toast)({
            title: "starting screenpipe",
            description: "please wait as we download AI models and start recording\nplease check logs if this is taking longer than expected (30s)",
            duration: Infinity,
        });
        try {
            yield (0, core_1.invoke)("stop_screenpipe");
            yield new Promise((resolve) => setTimeout(resolve, 1000));
            yield (0, core_1.invoke)("spawn_screenpipe");
            yield new Promise((resolve) => setTimeout(resolve, 5000));
            toastId.update({
                id: toastId.id,
                title: "screenpipe started",
                description: "screenpipe is now running.",
                duration: 3000,
            });
            setStatus("ok");
        }
        catch (error) {
            console.error("failed to start screenpipe:", error);
            toastId.update({
                id: toastId.id,
                title: "error",
                description: "failed to start screenpipe.",
                variant: "destructive",
                duration: 3000,
            });
        }
        finally {
            toastId.dismiss();
            setIsLoading(false);
        }
    });
    const handleNext = () => {
        setStatus(null);
        handleNextSlide();
    };
    const handlePrev = () => {
        setStatus(null);
        handlePrevSlide();
    };
    const handleChineseMirrorToggle = (checked) => __awaiter(void 0, void 0, void 0, function* () {
        setUseChineseMirror(checked);
        updateSettings({ useChineseMirror: checked });
    });
    return (<div className={`${className} w-full flex justify-between flex-col items-center`}>
      <dialog_1.DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img className="w-24 h-24 " src="/128x128.png" alt="screenpipe-logo"/>
        <dialog_1.DialogTitle className="text-center text-2xl">
          setting up screenpipe
        </dialog_1.DialogTitle>
      </dialog_1.DialogHeader>

      {isMacOS && (<div className="w-3/4 space-y-4 mt-4 flex flex-col items-center">
          <div className="flex items-center justify-between mx-auto w-full">
            <div className="flex items-right gap-2">
              {permissions && (<span>
                  {permissions.screenRecording.toLowerCase() === "granted" ? (<lucide_react_1.Check className="h-4 w-4 text-green-500"/>) : (<lucide_react_1.X className="h-4 w-4 text-red-500"/>)}
                </span>)}
              <span className="text-sm">screen recording permission</span>
            </div>
            <button_1.Button variant="outline" className="w-[260px] text-sm justify-start" onClick={() => handlePermissionButton("screen")}>
              <lucide_react_1.Lock className="h-4 w-4 mr-2"/>
              grant screen permission
            </button_1.Button>
          </div>

          <div className="flex items-center justify-between mx-auto w-full">
            <div className="flex items-center gap-2">
              {permissions && (<span>
                  {permissions.microphone.toLowerCase() === "granted" ? (<lucide_react_1.Check className="h-4 w-4 text-green-500"/>) : (<lucide_react_1.X className="h-4 w-4 text-red-500"/>)}
                </span>)}
              <span className="text-sm">audio recording permission</span>
            </div>
            <button_1.Button variant="outline" className="w-[260px] text-sm justify-start" onClick={() => handlePermissionButton("audio")}>
              <lucide_react_1.Lock className="h-4 w-4 mr-2"/>
              grant audio permission
            </button_1.Button>
          </div>

          <div className="flex items-center justify-between mx-auto w-full">
            <div className="flex items-center gap-2">
              {permissions && (<span>
                  {permissions.accessibility.toLowerCase() === "granted" ? (<lucide_react_1.Check className="h-4 w-4 text-green-500"/>) : (<lucide_react_1.X className="h-4 w-4 text-red-500"/>)}
                </span>)}
              <span className="text-sm">accessibility permission</span>
            </div>
            <button_1.Button variant="outline" className="w-[260px] text-sm justify-start" onClick={() => handlePermissionButton("accessibility")}>
              <lucide_react_1.Lock className="h-4 w-4 mr-2"/>
              grant accessibility permission
            </button_1.Button>
          </div>
        </div>)}

      <separator_1.Separator className="w-full my-2"/>

      <div className="flex items-center space-x-2 mt-4">
        <switch_1.Switch id="chinese-mirror-toggle" checked={useChineseMirror} onCheckedChange={handleChineseMirrorToggle}/>
        <label_1.Label htmlFor="chinese-mirror-toggle" className="flex items-center space-x-2">
          <span>use chinese mirror for model downloads</span>
          <tooltip_1.TooltipProvider>
            <tooltip_1.Tooltip>
              <tooltip_1.TooltipTrigger>
                <lucide_react_1.HelpCircle className="h-4 w-4 cursor-default"/>
              </tooltip_1.TooltipTrigger>
              <tooltip_1.TooltipContent side="right">
                <p>
                  enable this option to use a chinese mirror for
                  <br />
                  downloading hugging face models
                  <br />
                  (e.g. whisper, embedded llama, etc.)
                  <br />
                  which are blocked in mainland china.
                </p>
              </tooltip_1.TooltipContent>
            </tooltip_1.Tooltip>
          </tooltip_1.TooltipProvider>
        </label_1.Label>
      </div>
      <div className="w-full flex flex-col items-center justify-center gap-2 my-1">
        {status === null ? (<button_1.Button onClick={handleStartScreenpipe} disabled={isLoading} className="mt-4">
            {isLoading ? (<svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" className="size-5 animate-spin stroke-zinc-400 mr-2">
                <path d="M12 3v3m6.366-.366-2.12 2.12M21 12h-3m.366 6.366-2.12-2.12M12 21v-3m-6.366.366 2.12-2.12M3 12h3m-.366-6.366 2.12 2.12"></path>
              </svg>) : (<lucide_react_1.Video className="h-4 w-4 mr-2"/>)}
            {isLoading ? "starting..." : "start recording"}
          </button_1.Button>) : status === "ok" ? (<div className="flex flex-col items-center mt-4">
            <lucide_react_1.Check className="size-5 stroke-zinc-400"/>
            <p className="text-sm text-zinc-600 mt-2 text-center">
              screenpipe setup complete. <br />
              AI models downloaded.
            </p>
          </div>) : (<p className="text-center mt-4">{status}</p>)}

        <log_file_button_1.LogFileButton />
      </div>

      <navigation_1.default handlePrevSlide={handlePrev} handleNextSlide={handleNext} prevBtnText="previous" nextBtnText="next"/>

      {/* Replace stats display with better styling */}
      {stats && (<div className="w-full p-4 space-y-3 rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <lucide_react_1.Video className="h-4 w-4 text-muted-foreground"/>
              <span className="text-sm text-muted-foreground">screenshots</span>
            </div>
            <span className="font-mono text-sm">
              {stats.screenshots.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <lucide_react_1.Video className="h-4 w-4 text-muted-foreground"/>
              <span className="text-sm text-muted-foreground">audio</span>
            </div>
            <span className="font-mono text-sm">
              {Math.round(stats.audioSeconds / 60)}m
            </span>
          </div>
        </div>)}
    </div>);
};
exports.default = OnboardingStatus;
