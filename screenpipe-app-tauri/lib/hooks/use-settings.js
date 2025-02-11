"use strict";
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
exports.store = exports.getStore = exports.Shortcut = void 0;
exports.createDefaultSettingsObject = createDefaultSettingsObject;
exports.useSettings = useSettings;
const path_1 = require("@tauri-apps/api/path");
const plugin_os_1 = require("@tauri-apps/plugin-os");
const easy_peasy_1 = require("easy-peasy");
const plugin_store_1 = require("@tauri-apps/plugin-store");
const path_2 = require("@tauri-apps/api/path");
const utils_1 = require("../utils");
const react_1 = require("react");
const posthog_js_1 = __importDefault(require("posthog-js"));
var Shortcut;
(function (Shortcut) {
    Shortcut["SHOW_SCREENPIPE"] = "show_screenpipe";
    Shortcut["START_RECORDING"] = "start_recording";
    Shortcut["STOP_RECORDING"] = "stop_recording";
})(Shortcut || (exports.Shortcut = Shortcut = {}));
const DEFAULT_SETTINGS = {
    openaiApiKey: "",
    deepgramApiKey: "", // for now we hardcode our key (dw about using it, we have bunch of credits)
    isLoading: true,
    aiModel: "gpt-4o",
    installedPipes: [],
    userId: "",
    customPrompt: `Rules:
- You can analyze/view/show/access videos to the user by putting .mp4 files in a code block (we'll render it) like this: \`/users/video.mp4\`, use the exact, absolute, file path from file_path property
- Do not try to embed video in links (e.g. [](.mp4) or https://.mp4) instead put the file_path in a code block using backticks
- Do not put video in multiline code block it will not render the video (e.g. \`\`\`bash\n.mp4\`\`\` IS WRONG) instead using inline code block with single backtick
- Always answer my question/intent, do not make up things

`,
    devMode: false,
    audioTranscriptionEngine: "deepgram",
    ocrEngine: "default",
    monitorIds: ["default"],
    audioDevices: ["default"],
    usePiiRemoval: false,
    restartInterval: 0,
    port: 3030,
    dataDir: "default",
    disableAudio: false,
    ignoredWindows: [],
    includedWindows: [],
    aiProviderType: "openai",
    aiUrl: "https://api.openai.com/v1",
    aiMaxContextChars: 512000,
    fps: 0.5,
    vadSensitivity: "high",
    analyticsEnabled: true,
    audioChunkDuration: 30, // default to 10 seconds
    useChineseMirror: false, // Add this line
    languages: [],
    embeddedLLM: {
        enabled: false,
        model: "llama3.2:1b-instruct-q4_K_M",
        port: 11434,
    },
    enableBeta: false,
    isFirstTimeUser: true,
    enableFrameCache: true, // Add this line
    enableUiMonitoring: false, // Change from true to false
    platform: "unknown", // Add this line
    disabledShortcuts: [],
    user: {},
    showScreenpipeShortcut: "Super+Alt+S",
    startRecordingShortcut: "Super+Alt+R",
    stopRecordingShortcut: "Super+Alt+X",
    startAudioShortcut: "",
    stopAudioShortcut: "",
    pipeShortcuts: {},
    enableRealtimeAudioTranscription: false,
    realtimeAudioTranscriptionEngine: "whisper-large-v3-turbo",
    disableVision: false,
    useAllMonitors: false,
};
const DEFAULT_IGNORED_WINDOWS_IN_ALL_OS = [
    "bit",
    "VPN",
    "Trash",
    "Private",
    "Incognito",
    "Wallpaper",
    "Settings",
    "Keepass",
    "Recorder",
    "Vaults",
    "OBS Studio",
];
const DEFAULT_IGNORED_WINDOWS_PER_OS = {
    macos: [
        ".env",
        "Item-0",
        "App Icon Window",
        "Battery",
        "Shortcuts",
        "WiFi",
        "BentoBox",
        "Clock",
        "Dock",
        "DeepL",
        "Control Center",
    ],
    windows: ["Nvidia", "Control Panel", "System Properties"],
    linux: ["Info center", "Discover", "Parted"],
};
function createDefaultSettingsObject() {
    var _a;
    let defaultSettings = Object.assign({}, DEFAULT_SETTINGS);
    try {
        const currentPlatform = (0, plugin_os_1.platform)();
        const ocrModel = currentPlatform === "macos"
            ? "apple-native"
            : currentPlatform === "windows"
                ? "windows-native"
                : "tesseract";
        defaultSettings.ocrEngine = ocrModel;
        defaultSettings.fps = currentPlatform === "macos" ? 0.5 : 1;
        defaultSettings.platform = currentPlatform;
        defaultSettings.ignoredWindows = [
            ...DEFAULT_IGNORED_WINDOWS_IN_ALL_OS,
            ...((_a = DEFAULT_IGNORED_WINDOWS_PER_OS[currentPlatform]) !== null && _a !== void 0 ? _a : []),
        ];
        return defaultSettings;
    }
    catch (e) {
        return DEFAULT_SETTINGS;
    }
}
// Create a singleton store instance
let storePromise = null;
/**
 * @warning Do not change autoSave to true, it causes race conditions
 */
const getStore = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!storePromise) {
        storePromise = (() => __awaiter(void 0, void 0, void 0, function* () {
            const dir = yield (0, path_2.localDataDir)();
            const profilesStore = new plugin_store_1.LazyStore(`${dir}/screenpipe/profiles.bin`, {
                autoSave: false,
            });
            const activeProfile = (yield profilesStore.get("activeProfile")) || "default";
            const file = activeProfile === "default"
                ? `store.bin`
                : `store-${activeProfile}.bin`;
            console.log("activeProfile", activeProfile, file);
            return new plugin_store_1.LazyStore(`${dir}/screenpipe/${file}`, {
                autoSave: false,
            });
        }))();
    }
    return storePromise;
});
exports.getStore = getStore;
const tauriStorage = {
    getItem: (_key) => __awaiter(void 0, void 0, void 0, function* () {
        const tauriStore = yield (0, exports.getStore)();
        const allKeys = yield tauriStore.keys();
        const values = {};
        for (const k of allKeys) {
            values[k] = yield tauriStore.get(k);
        }
        return { settings: (0, utils_1.unflattenObject)(values) };
    }),
    setItem: (_key, value) => __awaiter(void 0, void 0, void 0, function* () {
        const tauriStore = yield (0, exports.getStore)();
        const flattenedValue = (0, utils_1.flattenObject)(value.settings);
        // Delete all existing keys first
        const existingKeys = yield tauriStore.keys();
        for (const key of existingKeys) {
            yield tauriStore.delete(key);
        }
        // Set new flattened values
        for (const [key, val] of Object.entries(flattenedValue)) {
            yield tauriStore.set(key, val);
        }
        yield tauriStore.save();
    }),
    removeItem: (_key) => __awaiter(void 0, void 0, void 0, function* () {
        const tauriStore = yield (0, exports.getStore)();
        const keys = yield tauriStore.keys();
        for (const key of keys) {
            yield tauriStore.delete(key);
        }
        yield tauriStore.save();
    }),
};
exports.store = (0, easy_peasy_1.createContextStore)((0, easy_peasy_1.persist)({
    settings: createDefaultSettingsObject(),
    setSettings: (0, easy_peasy_1.action)((state, payload) => {
        state.settings = Object.assign(Object.assign({}, state.settings), payload);
    }),
    resetSettings: (0, easy_peasy_1.action)((state) => {
        state.settings = createDefaultSettingsObject();
    }),
    resetSetting: (0, easy_peasy_1.action)((state, key) => {
        const defaultValue = createDefaultSettingsObject()[key];
        state.settings[key] = defaultValue;
    }),
}, {
    storage: tauriStorage,
    mergeStrategy: "mergeDeep",
}));
function useSettings() {
    var _a;
    const settings = exports.store.useStoreState((state) => state.settings);
    const setSettings = exports.store.useStoreActions((actions) => actions.setSettings);
    const resetSettings = exports.store.useStoreActions((actions) => actions.resetSettings);
    const resetSetting = exports.store.useStoreActions((actions) => actions.resetSetting);
    (0, react_1.useEffect)(() => {
        var _a, _b, _c, _d, _e, _f, _g;
        if ((_a = settings.user) === null || _a === void 0 ? void 0 : _a.id) {
            posthog_js_1.default.identify((_b = settings.user) === null || _b === void 0 ? void 0 : _b.id, {
                email: (_c = settings.user) === null || _c === void 0 ? void 0 : _c.email,
                name: (_d = settings.user) === null || _d === void 0 ? void 0 : _d.name,
                github_username: (_e = settings.user) === null || _e === void 0 ? void 0 : _e.github_username,
                website: (_f = settings.user) === null || _f === void 0 ? void 0 : _f.website,
                contact: (_g = settings.user) === null || _g === void 0 ? void 0 : _g.contact,
            });
        }
    }, [(_a = settings.user) === null || _a === void 0 ? void 0 : _a.id]);
    const getDataDir = () => __awaiter(this, void 0, void 0, function* () {
        const homeDirPath = yield (0, path_1.homeDir)();
        if (settings.dataDir !== "default" &&
            settings.dataDir &&
            settings.dataDir !== "")
            return settings.dataDir;
        let p = "macos";
        try {
            p = (0, plugin_os_1.platform)();
        }
        catch (e) { }
        return p === "macos" || p === "linux"
            ? `${homeDirPath}/.screenpipe`
            : `${homeDirPath}\\.screenpipe`;
    });
    const loadUser = (token) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const response = yield fetch(`https://screenpi.pe/api/user`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ token }),
            });
            if (!response.ok) {
                throw new Error("failed to verify token");
            }
            const data = yield response.json();
            const userData = Object.assign({}, data.user);
            // if user was not logged in, send posthog event app_login with email
            if (!((_a = settings.user) === null || _a === void 0 ? void 0 : _a.id)) {
                posthog_js_1.default.capture("app_login", {
                    email: userData.email,
                });
            }
            setSettings({
                user: userData,
            });
        }
        catch (err) {
            console.error("failed to load user:", err);
        }
    });
    return {
        settings,
        updateSettings: setSettings,
        resetSettings,
        loadUser,
        resetSetting,
        getDataDir,
    };
}
