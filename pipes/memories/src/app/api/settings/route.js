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
exports.dynamic = exports.runtime = void 0;
exports.GET = GET;
exports.PUT = PUT;
// app/api/settings/route.ts
const js_1 = require("@screenpipe/js");
const server_1 = require("next/server");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
// Force Node.js runtime
exports.runtime = "nodejs"; // Add this line
exports.dynamic = "force-dynamic";
const DEFAULT_INTERVAL_MINUTES = 5;
function updateCronSchedule(intervalMinutes) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
            const pipeConfigPath = path_1.default.join(screenpipeDir, "pipes", "obsidian", "pipe.json");
            const settingsPath = path_1.default.join(screenpipeDir, "pipes", "obsidian", "settings.json");
            console.log(`updating cron schedule at: ${pipeConfigPath}`);
            // Load or initialize both configs
            let config = {};
            let settings = {};
            try {
                const content = yield fs_1.promises.readFile(pipeConfigPath, "utf8");
                config = JSON.parse(content);
            }
            catch (err) {
                console.log(`no existing config found, creating new one at ${pipeConfigPath}`);
                config = { crons: [] };
            }
            try {
                const settingsContent = yield fs_1.promises.readFile(settingsPath, "utf8");
                settings = JSON.parse(settingsContent);
            }
            catch (err) {
                console.log(`no existing settings found, creating new one at ${settingsPath}`);
                settings = { interval: intervalMinutes * 60000 };
            }
            // Update settings
            settings.interval = intervalMinutes * 60000;
            yield fs_1.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2));
            // Update cron config
            config.crons = [
                {
                    path: "/api/log",
                    schedule: `0 */${intervalMinutes} * * * *`,
                },
            ];
            config.enabled = (_a = config.enabled) !== null && _a !== void 0 ? _a : true;
            config.is_nextjs = (_b = config.is_nextjs) !== null && _b !== void 0 ? _b : true;
            yield fs_1.promises.writeFile(pipeConfigPath, JSON.stringify(config, null, 2));
            console.log(`updated cron schedule to run every ${intervalMinutes} minutes`);
        }
        catch (err) {
            console.error("failed to update cron schedule:", err);
            throw err;
        }
    });
}
function GET() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const settingsManager = js_1.pipe.settings;
            if (!settingsManager) {
                throw new Error("settingsManager not found");
            }
            // Load persisted settings if they exist
            const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
            const settingsPath = path_1.default.join(screenpipeDir, "pipes", "obsidian", "settings.json");
            try {
                const settingsContent = yield fs_1.promises.readFile(settingsPath, "utf8");
                const persistedSettings = JSON.parse(settingsContent);
                // Merge with current settings
                const rawSettings = yield settingsManager.getAll();
                return server_1.NextResponse.json(Object.assign(Object.assign({}, rawSettings), { customSettings: Object.assign(Object.assign({}, rawSettings.customSettings), { obsidian: Object.assign(Object.assign({}, (((_a = rawSettings.customSettings) === null || _a === void 0 ? void 0 : _a.obsidian) || {})), persistedSettings) }) }));
            }
            catch (err) {
                // If no persisted settings, return normal settings
                const rawSettings = yield settingsManager.getAll();
                return server_1.NextResponse.json(rawSettings);
            }
        }
        catch (error) {
            console.error("failed to get settings:", error);
            return server_1.NextResponse.json({ error: "failed to get settings" }, { status: 500 });
        }
    });
}
function PUT(request) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const settingsManager = js_1.pipe.settings;
            if (!settingsManager) {
                throw new Error("settingsManager not found");
            }
            const body = yield request.json();
            const { key, value, isPartialUpdate, reset, namespace } = body;
            // Handle obsidian namespace updates
            if (namespace === "obsidian" && isPartialUpdate) {
                // Use provided interval or default
                const intervalMs = value.interval || DEFAULT_INTERVAL_MINUTES * 60000;
                const intervalMinutes = Math.max(1, Math.floor(intervalMs / 60000));
                yield updateCronSchedule(intervalMinutes);
                console.log(`setting interval to ${intervalMinutes} minutes`);
            }
            if (reset) {
                if (namespace) {
                    if (key) {
                        // Reset single key in namespace
                        yield settingsManager.setCustomSetting(namespace, key, undefined);
                    }
                    else {
                        // Reset entire namespace
                        yield settingsManager.updateNamespaceSettings(namespace, {});
                    }
                }
                else {
                    if (key) {
                        yield settingsManager.resetKey(key);
                    }
                    else {
                        yield settingsManager.reset();
                    }
                }
                return server_1.NextResponse.json({ success: true });
            }
            if (namespace) {
                if (isPartialUpdate) {
                    const currentSettings = (yield settingsManager.getNamespaceSettings(namespace)) || {};
                    yield settingsManager.updateNamespaceSettings(namespace, Object.assign(Object.assign({}, currentSettings), value));
                }
                else {
                    yield settingsManager.setCustomSetting(namespace, key, value);
                }
            }
            else if (isPartialUpdate) {
                const serializedSettings = JSON.parse(JSON.stringify(value));
                yield settingsManager.update(serializedSettings);
            }
            else {
                const serializedValue = JSON.parse(JSON.stringify(value));
                yield settingsManager.set(key, serializedValue);
            }
            return server_1.NextResponse.json({ success: true });
        }
        catch (error) {
            console.error("failed to update settings:", error);
            return server_1.NextResponse.json({ error: "failed to update settings" }, { status: 500 });
        }
    });
}
