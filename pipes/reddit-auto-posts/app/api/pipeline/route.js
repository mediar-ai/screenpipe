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
exports.dynamic = void 0;
exports.GET = GET;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const server_1 = require("next/server");
const js_1 = require("@screenpipe/js");
const send_email_1 = __importDefault(require("@/lib/actions/send-email"));
const generate_log_1 = __importDefault(require("@/lib/actions/generate-log"));
const generate_reddit_question_1 = __importDefault(require("@/lib/actions/generate-reddit-question"));
function saveDailyLog(logEntry) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!logEntry) {
            throw new Error("no log entry to save");
        }
        console.log("saving log entry:", logEntry);
        const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
        const logsDir = node_path_1.default.join(screenpipeDir, "pipes", "reddit-auto-posts", "logs");
        const timestamp = new Date()
            .toISOString()
            .replace(/:/g, "-")
            .replace(/\..+/, "");
        const filename = `${timestamp}-${(_a = logEntry.category) === null || _a === void 0 ? void 0 : _a.replace(/[\/\\?%*:|"<>']/g, "-")}.json`;
        const logFile = node_path_1.default.join(logsDir, filename);
        try {
            node_fs_1.default.writeFileSync(logFile, JSON.stringify(logEntry, null, 2));
        }
        catch (error) {
            console.log(`Failed to write log file: ${error}`);
            throw new Error(`failed to write log file: ${error}`);
        }
    });
}
function retry(fn_1) {
    return __awaiter(this, arguments, void 0, function* (fn, retries = 3, delay = 5000) {
        for (let i = 0; i < retries; i++) {
            try {
                const result = yield fn();
                if (result) {
                    return result;
                }
            }
            catch (error) {
                console.log(`Screenpipe query failed, retry, attempt: ${i + 1}`);
                if (i === retries - 1)
                    throw error;
                yield new Promise((res) => setTimeout(res, delay));
            }
        }
    });
}
exports.dynamic = "force-dynamic";
function GET(request) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            console.log("starting daily log pipeline");
            const settingsManager = js_1.pipe.settings;
            const redditSettings = yield js_1.pipe.settings.getNamespaceSettings("reddit-auto-posts");
            if (!settingsManager) {
                return server_1.NextResponse.json({ error: `no setting manager found` }, { status: 500 });
            }
            const rawSettings = yield settingsManager.getAll();
            const aiModel = rawSettings === null || rawSettings === void 0 ? void 0 : rawSettings.aiModel;
            const aiUrl = rawSettings === null || rawSettings === void 0 ? void 0 : rawSettings.aiUrl;
            const openaiApiKey = rawSettings === null || rawSettings === void 0 ? void 0 : rawSettings.openaiApiKey;
            const aiProvider = rawSettings === null || rawSettings === void 0 ? void 0 : rawSettings.aiProviderType;
            const userToken = (_a = rawSettings === null || rawSettings === void 0 ? void 0 : rawSettings.user) === null || _a === void 0 ? void 0 : _a.token;
            const interval = (redditSettings === null || redditSettings === void 0 ? void 0 : redditSettings.interval) * 1000 || 60000;
            const summaryFrequency = redditSettings === null || redditSettings === void 0 ? void 0 : redditSettings.summaryFrequency;
            const emailTime = redditSettings === null || redditSettings === void 0 ? void 0 : redditSettings.emailTime;
            const emailAddress = redditSettings === null || redditSettings === void 0 ? void 0 : redditSettings.emailAddress;
            const emailPassword = redditSettings === null || redditSettings === void 0 ? void 0 : redditSettings.emailPassword;
            const customPrompt = redditSettings === null || redditSettings === void 0 ? void 0 : redditSettings.customPrompt;
            const dailylogPrompt = redditSettings === null || redditSettings === void 0 ? void 0 : redditSettings.dailylogPrompt;
            const windowName = (redditSettings === null || redditSettings === void 0 ? void 0 : redditSettings.windowName) || "";
            const pageSize = redditSettings === null || redditSettings === void 0 ? void 0 : redditSettings.pageSize;
            const contentType = (redditSettings === null || redditSettings === void 0 ? void 0 : redditSettings.contentType) || "ocr";
            const emailEnabled = !!(emailAddress && emailPassword);
            const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
            const logsDir = node_path_1.default.join(screenpipeDir, "pipes", "reddit-auto-posts", "logs");
            const pipeConfigPath = node_path_1.default.join(screenpipeDir, "pipes", "reddit-auto-posts", "pipe.json");
            try {
                node_fs_1.default.mkdirSync(logsDir);
            }
            catch (_error) {
                console.warn("creating logs directory, probably already exists:", logsDir);
            }
            const fileContent = node_fs_1.default.readFileSync(pipeConfigPath, "utf-8");
            const configData = JSON.parse(fileContent);
            const url = new URL(request.url);
            const fromButton = url.searchParams.get("fromButton");
            if (emailEnabled && !(configData === null || configData === void 0 ? void 0 : configData.welcomeEmailSent)) {
                const welcomeEmail = `
        Welcome to the daily reddit questions pipeline!

        This pipe will send you a daily list of reddit questions based on your screen data.
        ${summaryFrequency === "daily"
                    ? `It will run at ${emailTime} every day.`
                    : `It will run every ${summaryFrequency} hours.`}
      `;
                try {
                    yield (0, send_email_1.default)(emailAddress, emailPassword, "daily reddit questions", welcomeEmail);
                    configData.welcomeEmailSent = true;
                    node_fs_1.default.writeFileSync(pipeConfigPath, JSON.stringify(configData, null, 2));
                }
                catch (error) {
                    configData.welcomeEmailSent = false;
                    node_fs_1.default.writeFileSync(pipeConfigPath, JSON.stringify(configData, null, 2));
                    return server_1.NextResponse.json({ error: `Error in sending welcome email: ${error}` }, { status: 500 });
                }
            }
            const now = new Date();
            const startTime = new Date(now.getTime() - interval);
            const screenData = yield retry(() => js_1.pipe.queryScreenpipe({
                startTime: startTime.toISOString(),
                endTime: now.toISOString(),
                windowName: windowName,
                limit: pageSize,
                contentType: contentType,
            }));
            if (screenData && screenData.data && screenData.data.length > 0) {
                if (aiProvider === "screenpipe-cloud" && !userToken) {
                    return server_1.NextResponse.json({ error: `seems like you don't have screenpipe-cloud access :(` }, { status: 500 });
                }
                let logEntry;
                logEntry = yield (0, generate_log_1.default)(screenData.data, dailylogPrompt, aiProvider, aiModel, aiUrl, openaiApiKey, userToken);
                yield saveDailyLog(logEntry);
                const redditQuestions = yield (0, generate_reddit_question_1.default)(screenData.data, customPrompt, aiProvider, aiModel, aiUrl, openaiApiKey, userToken);
                console.log("reddit questions:", redditQuestions);
                // only send mail in those request that are made from cron jobs,
                // cz at that time user, is not seeing the frontend of this pipe
                if (emailEnabled && redditQuestions && !fromButton) {
                    try {
                        yield (0, send_email_1.default)(emailAddress, emailPassword, "reddit questions", redditQuestions);
                    }
                    catch (error) {
                        return server_1.NextResponse.json({ error: `error in sending mail ${error}` }, { status: 500 });
                    }
                }
                else {
                    console.log("Failed to get reddit questions!!");
                }
                if (redditQuestions) {
                    try {
                        console.log("Sending screenpipe inbox notification");
                        yield js_1.pipe.inbox.send({
                            title: "reddit questions",
                            body: redditQuestions,
                        });
                    }
                    catch (error) {
                        return server_1.NextResponse.json({ error: `error in sending inbox notification ${error}` }, { status: 500 });
                    }
                }
                else {
                    console.log("Failed to get reddit questions!!");
                }
                try {
                    console.log("Sending desktop notification");
                }
                catch (error) {
                    return server_1.NextResponse.json({ error: `error in sending desktop notification ${error}` }, { status: 500 });
                }
                return server_1.NextResponse.json({
                    message: "pipe executed successfully",
                    suggestedQuestions: redditQuestions,
                }, { status: 200 });
            }
            else {
                return server_1.NextResponse.json({ message: "query is empty please wait & and try again!" }, { status: 200 });
            }
        }
        catch (error) {
            console.error("error in GET handler:", error);
            return server_1.NextResponse.json({ error: `${error}` }, { status: 400 });
        }
    });
}
