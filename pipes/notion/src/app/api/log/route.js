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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const js_1 = require("@screenpipe/js");
const helpers_1 = require("@/lib/helpers");
const client_1 = require("@/lib/notion/client");
const minute = (min) => min * 60 * 1000;
function GET() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const settings = yield js_1.pipe.settings.getNamespaceSettings("notion");
            const model = settings === null || settings === void 0 ? void 0 : settings.aiModel;
            const pageSize = (settings === null || settings === void 0 ? void 0 : settings.pageSize) || 50;
            const customPrompt = settings === null || settings === void 0 ? void 0 : settings.prompt;
            const interval = (settings === null || settings === void 0 ? void 0 : settings.interval) ? minute(settings.interval) : 3600000;
            if (!model) {
                return server_1.NextResponse.json({ error: "model not selected" }, { status: 401 });
            }
            if (!((_a = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _a === void 0 ? void 0 : _a.accessToken) || !((_b = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _b === void 0 ? void 0 : _b.databaseId)) {
                return server_1.NextResponse.json({ error: "notion not configured" }, { status: 400 });
            }
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - interval);
            const screenData = yield js_1.pipe.queryScreenpipe({
                startTime: oneHourAgo.toISOString(),
                endTime: now.toISOString(),
                limit: pageSize,
                contentType: "all",
            });
            if (!screenData || screenData.data.length === 0) {
                return server_1.NextResponse.json({ message: "no screen data found" }, { status: 404 });
            }
            const logEntry = yield (0, helpers_1.generateWorkLog)(screenData.data, model, oneHourAgo, now, customPrompt);
            console.log(logEntry);
            const notionClient = new client_1.NotionClient(settings.notion);
            const deepLink = yield notionClient.createLog(logEntry);
            return server_1.NextResponse.json({
                message: "work log synced successfully",
                logEntry,
                deepLink: deepLink,
            });
        }
        catch (error) {
            console.error("error in work log api:", error);
            return server_1.NextResponse.json({ error: `failed to process work log: ${error}` }, { status: 500 });
        }
    });
}
