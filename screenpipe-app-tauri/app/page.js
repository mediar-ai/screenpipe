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
exports.default = Home;
const use_settings_1 = require("@/lib/hooks/use-settings");
const react_1 = __importStar(require("react"));
const notification_handler_1 = __importDefault(require("@/components/notification-handler"));
const header_1 = __importDefault(require("@/components/header"));
const use_toast_1 = require("@/components/ui/use-toast");
const onboarding_1 = __importDefault(require("@/components/onboarding"));
const use_onboarding_1 = require("@/lib/hooks/use-onboarding");
const changelog_dialog_1 = require("@/components/changelog-dialog");
const breaking_changes_instructions_dialog_1 = require("@/components/breaking-changes-instructions-dialog");
const use_changelog_dialog_1 = require("@/lib/hooks/use-changelog-dialog");
const use_status_dialog_1 = require("@/lib/hooks/use-status-dialog");
const use_settings_dialog_1 = require("@/lib/hooks/use-settings-dialog");
const pipe_store_1 = require("@/components/pipe-store");
const core_1 = require("@tauri-apps/api/core");
const event_1 = require("@tauri-apps/api/event");
const use_profiles_1 = require("@/lib/hooks/use-profiles");
const plugin_process_1 = require("@tauri-apps/plugin-process");
const api_1 = require("@/lib/api");
const localforage_1 = __importDefault(require("localforage"));
const plugin_deep_link_1 = require("@tauri-apps/plugin-deep-link");
function Home() {
    const { settings, updateSettings, loadUser } = (0, use_settings_1.useSettings)();
    const { setActiveProfile } = (0, use_profiles_1.useProfiles)();
    const { toast } = (0, use_toast_1.useToast)();
    const { showOnboarding, setShowOnboarding } = (0, use_onboarding_1.useOnboarding)();
    const { setShowChangelogDialog } = (0, use_changelog_dialog_1.useChangelogDialog)();
    const { open: openStatusDialog } = (0, use_status_dialog_1.useStatusDialog)();
    const { setIsOpen: setSettingsOpen } = (0, use_settings_dialog_1.useSettingsDialog)();
    const isProcessingRef = react_1.default.useRef(false);
    (0, react_1.useEffect)(() => {
        const interval = setInterval(() => {
            var _a;
            loadUser((_a = settings.user) === null || _a === void 0 ? void 0 : _a.token);
        }, 1000);
        return () => clearInterval(interval);
    }, [settings]);
    (0, react_1.useEffect)(() => {
        const getAudioDevices = () => __awaiter(this, void 0, void 0, function* () {
            const store = yield (0, use_settings_1.getStore)();
            const devices = (yield store.get("audioDevices"));
            return devices;
        });
        const setupDeepLink = () => __awaiter(this, void 0, void 0, function* () {
            const unsubscribeDeepLink = yield (0, plugin_deep_link_1.onOpenUrl)((urls) => __awaiter(this, void 0, void 0, function* () {
                console.log("received deep link urls:", urls);
                for (const url of urls) {
                    const parsedUrl = new URL(url);
                    // Handle API key auth
                    if (url.includes("api_key=")) {
                        const apiKey = parsedUrl.searchParams.get("api_key");
                        if (apiKey) {
                            updateSettings({ user: { token: apiKey } });
                            toast({
                                title: "logged in!",
                                description: "your api key has been set",
                            });
                        }
                    }
                    if (url.includes("settings")) {
                        setSettingsOpen(true);
                    }
                    if (url.includes("changelog")) {
                        setShowChangelogDialog(true);
                    }
                    if (url.includes("onboarding")) {
                        setShowOnboarding(true);
                    }
                    if (url.includes("status")) {
                        openStatusDialog();
                    }
                }
            }));
            return unsubscribeDeepLink;
        });
        let deepLinkUnsubscribe;
        setupDeepLink().then((unsubscribe) => {
            deepLinkUnsubscribe = unsubscribe;
        });
        const unlisten = Promise.all([
            (0, event_1.listen)("shortcut-start-recording", () => __awaiter(this, void 0, void 0, function* () {
                yield (0, core_1.invoke)("spawn_screenpipe");
                toast({
                    title: "recording started",
                    description: "screen recording has been initiated",
                });
            })),
            (0, event_1.listen)("shortcut-stop-recording", () => __awaiter(this, void 0, void 0, function* () {
                yield (0, core_1.invoke)("stop_screenpipe");
                toast({
                    title: "recording stopped",
                    description: "screen recording has been stopped",
                });
            })),
            (0, event_1.listen)("switch-profile", (event) => __awaiter(this, void 0, void 0, function* () {
                const profile = event.payload;
                setActiveProfile(profile);
                toast({
                    title: "profile switched",
                    description: `switched to ${profile} profile, restarting screenpipe now`,
                });
                yield (0, core_1.invoke)("stop_screenpipe");
                yield new Promise((resolve) => setTimeout(resolve, 1000));
                yield (0, core_1.invoke)("spawn_screenpipe");
                yield new Promise((resolve) => setTimeout(resolve, 1000));
                (0, plugin_process_1.relaunch)();
            })),
            (0, event_1.listen)("open-pipe", (event) => __awaiter(this, void 0, void 0, function* () {
                const pipeId = event.payload;
                const pipeApi = new api_1.PipeApi();
                const pipeList = yield pipeApi.listPipes();
                const pipe = pipeList.find((p) => p.id === pipeId);
                if (pipe) {
                    yield (0, core_1.invoke)("open_pipe_window", {
                        port: pipe.port,
                        title: pipe.id,
                    });
                }
            })),
            (0, event_1.listen)("shortcut-start-audio", () => __awaiter(this, void 0, void 0, function* () {
                if (isProcessingRef.current)
                    return;
                isProcessingRef.current = true;
                try {
                    const devices = yield getAudioDevices();
                    const pipeApi = new api_1.PipeApi();
                    console.log("audio-devices", devices);
                    yield Promise.all(devices.map((device) => pipeApi.startAudio(device)));
                    toast({
                        title: "audio started",
                        description: "audio has been started",
                    });
                }
                catch (error) {
                    console.error("error starting audio:", error);
                    toast({
                        title: "error starting audio",
                        description: error instanceof Error ? error.message : "unknown error occurred",
                        variant: "destructive",
                    });
                }
                finally {
                    isProcessingRef.current = false;
                }
            })),
            (0, event_1.listen)("shortcut-stop-audio", (event) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const devices = yield getAudioDevices();
                    const pipeApi = new api_1.PipeApi();
                    devices.forEach((device) => {
                        pipeApi.stopAudio(device);
                    });
                    toast({
                        title: "audio stopped",
                        description: "audio has been stopped",
                    });
                }
                catch (error) {
                    console.error("error stopping audio:", error);
                    toast({
                        title: "error stopping audio",
                        description: error instanceof Error ? error.message : "unknown error occurred",
                        variant: "destructive",
                    });
                }
            })),
        ]);
        return () => {
            unlisten.then((listeners) => {
                listeners.forEach((unlistenFn) => unlistenFn());
            });
            if (deepLinkUnsubscribe)
                deepLinkUnsubscribe();
        };
    }, [setSettingsOpen]);
    (0, react_1.useEffect)(() => {
        const checkScreenPermissionRestart = () => __awaiter(this, void 0, void 0, function* () {
            const restartPending = yield localforage_1.default.getItem("screenPermissionRestartPending");
            if (restartPending) {
                setShowOnboarding(true);
            }
        });
        checkScreenPermissionRestart();
    }, [setShowOnboarding]);
    return (<div className="flex flex-col items-center flex-1">
      <notification_handler_1.default />
      {showOnboarding ? (<onboarding_1.default />) : (<>
          <changelog_dialog_1.ChangelogDialog />
          <breaking_changes_instructions_dialog_1.BreakingChangesInstructionsDialog />
          <header_1.default />
          <div className=" w-[90%]">
            <pipe_store_1.PipeStore />
          </div>
        </>)}
    </div>);
}
