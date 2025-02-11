"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Credentials = void 0;
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class Credentials {
    static getApiKey() {
        try {
            if (!fs_1.default.existsSync(this.configFile)) {
                return null;
            }
            const config = JSON.parse(fs_1.default.readFileSync(this.configFile, "utf-8"));
            return config.apiKey || null;
        }
        catch (error) {
            return null;
        }
    }
    static setApiKey(apiKey, developerId) {
        // Create .screenpipe directory if it doesn't exist
        if (!fs_1.default.existsSync(this.configDir)) {
            fs_1.default.mkdirSync(this.configDir);
        }
        // Save API key to config file
        fs_1.default.writeFileSync(this.configFile, JSON.stringify({
            apiKey,
            developerId,
        }, null, 2));
    }
    static clearCredentials() {
        if (fs_1.default.existsSync(this.configFile)) {
            fs_1.default.unlinkSync(this.configFile);
        }
    }
}
exports.Credentials = Credentials;
_a = Credentials;
Credentials.configDir = path_1.default.join(os_1.default.homedir(), ".screenpipe");
Credentials.configFile = path_1.default.join(_a.configDir, "config-developer.json");
