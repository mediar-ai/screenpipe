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
exports.GET = GET;
const server_1 = require("next/server");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
function fileExists(path) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield promises_1.default.access(path);
            return true;
        }
        catch (_a) {
            return false;
        }
    });
}
function readObsidianConfig(configPath) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const content = yield promises_1.default.readFile(configPath, "utf-8");
            return JSON.parse(content);
        }
        catch (_a) {
            return null;
        }
    });
}
function GET() {
    return __awaiter(this, void 0, void 0, function* () {
        const home = os_1.default.homedir();
        const platform = os_1.default.platform();
        // Define potential config locations based on OS
        const configPaths = {
            darwin: path_1.default.join(home, "Library/Application Support/obsidian/obsidian.json"),
            win32: path_1.default.join(home, "AppData/Roaming/obsidian/obsidian.json"),
            linux: path_1.default.join(home, ".config/obsidian/obsidian.json"),
        }[platform] || null;
        // Common paths to check
        const commonPaths = [
            path_1.default.join(home, "Documents/Obsidian"),
            path_1.default.join(home, "Obsidian"),
            path_1.default.join(home, "Documents/Knowledge Base"),
        ];
        if (platform === "darwin") {
            commonPaths.push(path_1.default.join(home, "Library/Mobile Documents/iCloud~md~obsidian/Documents"));
        }
        // Read actual vault paths from obsidian.json if it exists
        let vaultPaths = [];
        if (configPaths) {
            const config = yield readObsidianConfig(configPaths);
            if (config === null || config === void 0 ? void 0 : config.vaults) {
                vaultPaths = Object.values(config.vaults).map((vault) => vault.path);
            }
        }
        // Check which common paths actually exist
        const existingPaths = yield Promise.all([...new Set([...vaultPaths, ...commonPaths])].map((p) => __awaiter(this, void 0, void 0, function* () {
            const exists = yield fileExists(p);
            return exists ? p : null;
        })));
        return server_1.NextResponse.json({
            paths: existingPaths.filter(Boolean),
            configFound: Boolean(configPaths && (yield fileExists(configPaths))),
        });
    });
}
