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
exports.default = updatePipeConfig;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
function updatePipeConfig(redditSettings) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!redditSettings) {
            throw new Error("Reddit settings not found");
        }
        let cronSchedule = "";
        const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
        const pipeConfigPath = path_1.default.join(screenpipeDir, "pipes", "reddit-auto-posts", "pipe.json");
        if (redditSettings.summaryFrequency === "daily") {
            const [emailHour, emailMinute] = redditSettings.emailTime.split(":").map(Number);
            cronSchedule = `0 ${emailMinute} ${emailHour} * * *`;
        }
        else if (redditSettings.summaryFrequency.startsWith("hourly:")) {
            const hours = parseInt(redditSettings.summaryFrequency.split(":")[1], 10);
            cronSchedule = `0 0 */${hours} * * *`;
        }
        try {
            const fileContent = yield fs_1.promises.readFile(pipeConfigPath, 'utf-8');
            const configData = JSON.parse(fileContent);
            configData.crons = [
                {
                    path: "/api/pipeline",
                    schedule: cronSchedule,
                },
            ];
            yield fs_1.promises.writeFile(pipeConfigPath, JSON.stringify(configData, null, 2));
        }
        catch (error) {
            console.error("Failed to save Reddit settings:", error);
            throw error;
        }
    });
}
