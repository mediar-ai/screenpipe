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
exports.SettingsManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const utils_1 = require("../../common/utils");
const DEFAULT_SETTINGS = (0, utils_1.getDefaultSettings)();
class SettingsManager {
    constructor() {
        this.initialized = false;
        this.settings = DEFAULT_SETTINGS;
        this.storePath = ""; // will be set in init()
    }
    getStorePath() {
        return __awaiter(this, void 0, void 0, function* () {
            const platform = process.platform;
            const home = os_1.default.homedir();
            // Get base screenpipe data directory path based on platform
            let baseDir;
            switch (platform) {
                case "darwin":
                    baseDir = path_1.default.join(home, "Library", "Application Support", "screenpipe");
                    break;
                case "linux":
                    const xdgData = process.env.XDG_DATA_HOME || path_1.default.join(home, ".local", "share");
                    baseDir = path_1.default.join(xdgData, "screenpipe");
                    break;
                case "win32":
                    baseDir = path_1.default.join(process.env.LOCALAPPDATA || path_1.default.join(home, "AppData", "Local"), "screenpipe");
                    break;
                default:
                    throw new Error(`unsupported platform: ${platform}`);
            }
            // First check profiles.bin to get active profile
            const profilesPath = path_1.default.join(baseDir, "profiles.bin");
            let activeProfile = "default";
            try {
                const profilesData = yield promises_1.default.readFile(profilesPath);
                const profiles = JSON.parse(profilesData.toString());
                if (profiles.activeProfile) {
                    activeProfile = profiles.activeProfile;
                }
            }
            catch (error) {
                // Profiles file doesn't exist yet, use default
            }
            // Return store path for active profile
            return activeProfile === "default"
                ? path_1.default.join(baseDir, "store.bin")
                : path_1.default.join(baseDir, `store-${activeProfile}.bin`);
        });
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            // if (this.initialized) return;
            if (!promises_1.default || !path_1.default)
                throw new Error("failed to load required modules");
            this.storePath = yield this.getStorePath();
            try {
                yield promises_1.default.mkdir(path_1.default.dirname(this.storePath), { recursive: true });
                const data = yield promises_1.default.readFile(this.storePath);
                const rawSettings = JSON.parse(data.toString());
                this.settings = Object.assign(Object.assign({}, DEFAULT_SETTINGS), (0, utils_1.unflattenObject)(rawSettings));
                this.initialized = true;
            }
            catch (error) {
                if (error.code === "ENOENT") {
                    yield this.save();
                    this.initialized = true;
                }
                else {
                    throw error;
                }
            }
        });
    }
    save() {
        return __awaiter(this, void 0, void 0, function* () {
            yield promises_1.default.mkdir(path_1.default.dirname(this.storePath), { recursive: true });
            const flattenedSettings = (0, utils_1.flattenObject)(this.settings);
            yield promises_1.default.writeFile(this.storePath, JSON.stringify(flattenedSettings, null, 2));
        });
    }
    get(key) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.initialized)
                yield this.init();
            return this.settings[key];
        });
    }
    set(key, value) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.initialized)
                yield this.init();
            this.settings[key] = value;
            yield this.save();
        });
    }
    getAll() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.init();
            return Object.assign({}, this.settings);
        });
    }
    update(newSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.initialized)
                yield this.init();
            this.settings = Object.assign(Object.assign({}, this.settings), newSettings);
            yield this.save();
        });
    }
    reset() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = Object.assign({}, DEFAULT_SETTINGS);
            yield this.save();
        });
    }
    resetKey(key) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.initialized)
                yield this.init();
            this.settings[key] = DEFAULT_SETTINGS[key];
            yield this.save();
        });
    }
    getCustomSetting(namespace, key) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!this.initialized)
                yield this.init();
            return (_b = (_a = this.settings.customSettings) === null || _a === void 0 ? void 0 : _a[namespace]) === null || _b === void 0 ? void 0 : _b[key];
        });
    }
    setCustomSetting(namespace, key, value) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.initialized)
                yield this.init();
            this.settings.customSettings = this.settings.customSettings || {};
            this.settings.customSettings[namespace] =
                this.settings.customSettings[namespace] || {};
            this.settings.customSettings[namespace][key] = value;
            yield this.save();
        });
    }
    getNamespaceSettings(namespace) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!this.initialized)
                yield this.init();
            return (_a = this.settings.customSettings) === null || _a === void 0 ? void 0 : _a[namespace];
        });
    }
    updateNamespaceSettings(namespace, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.initialized)
                yield this.init();
            this.settings.customSettings = this.settings.customSettings || {};
            this.settings.customSettings[namespace] = settings;
            yield this.save();
        });
    }
}
exports.SettingsManager = SettingsManager;
