"use strict";
"use server";
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
exports.updatePipeConfig = updatePipeConfig;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
function updatePipeConfig(intervalMinutes) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const screenpipeDir = process.env.SCREENPIPE_DIR ||
                (process.env.HOME && path_1.default.join(process.env.HOME, ".screenpipe")) ||
                process.cwd();
            const pipeConfigPath = path_1.default.join(screenpipeDir, "pipes", "obsidian", "pipe.json");
            console.log(`updating cron schedule at: ${pipeConfigPath}`);
            // Load or initialize both configs
            let config = {};
            try {
                const content = yield fs_1.promises.readFile(pipeConfigPath, "utf8");
                config = JSON.parse(content);
            }
            catch (err) {
                console.log(`no existing config found, creating new one at ${pipeConfigPath}`);
                config = { crons: [] };
            }
            // Update cron config
            config.crons = [
                {
                    path: "/api/log",
                    schedule: `0 */${intervalMinutes} * * * *`,
                },
                {
                    path: "/api/intelligence",
                    schedule: "0 0 */1 * * *",
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
