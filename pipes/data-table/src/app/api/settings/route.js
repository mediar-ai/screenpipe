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
const js_1 = require("@screenpipe/js");
const server_1 = require("next/server");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
exports.runtime = "nodejs";
exports.dynamic = "force-dynamic";
function GET() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const settingsManager = js_1.pipe.settings;
            if (!settingsManager) {
                throw new Error("settingsManager not found");
            }
            // get home dir
            const homeDir = process.env.HOME;
            // Load persisted settings if they exist
            const screenpipeDir = process.env.SCREENPIPE_DIR ||
                (homeDir && path_1.default.join(homeDir, ".screenpipe")) ||
                process.cwd();
            const settingsPath = path_1.default.join(screenpipeDir, "pipes", "obsidian", "pipe.json");
            try {
                const settingsContent = yield fs_1.promises.readFile(settingsPath, "utf8");
                const persistedSettings = JSON.parse(settingsContent);
                // Merge with current settings
                const rawSettings = yield settingsManager.getAll();
                return server_1.NextResponse.json(Object.assign(Object.assign({}, rawSettings), { customSettings: Object.assign(Object.assign({}, rawSettings.customSettings), { ["obsidian"]: Object.assign(Object.assign({}, (((_a = rawSettings.customSettings) === null || _a === void 0 ? void 0 : _a["obsidian"]) || {})), persistedSettings) }) }));
            }
            catch (err) {
                console.log("route err", err);
                // If no persisted settings, return normal settings
                const rawSettings = yield settingsManager.getAll();
                console.log("route rawSettings", rawSettings);
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
            if (reset) {
                if (namespace) {
                    if (key) {
                        yield settingsManager.setCustomSetting(namespace, key, undefined);
                    }
                    else {
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
