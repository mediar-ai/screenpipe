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
exports.workLog = void 0;
exports.generateWorkLog = generateWorkLog;
const ai_1 = require("ai");
const ollama_ai_provider_1 = require("ollama-ai-provider");
const zod_1 = require("zod");
const client_1 = require("@notionhq/client");
const notion_to_md_1 = require("notion-to-md");
const get_screenpipe_app_settings_1 = require("./actions/get-screenpipe-app-settings");
exports.workLog = zod_1.z.object({
    title: zod_1.z.string(),
    description: zod_1.z.string(),
    tags: zod_1.z.array(zod_1.z.string()),
});
function extractLinkedContent(prompt) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            // Match @[[file]] or @[[folder/file]] patterns
            const linkRegex = /@\[\[(.*?)\]\]/g;
            const matches = [...prompt.matchAll(linkRegex)];
            const settings = yield (0, get_screenpipe_app_settings_1.getScreenpipeAppSettings)();
            let enrichedPrompt = prompt;
            const notion = new client_1.Client({
                auth: (_b = (_a = settings === null || settings === void 0 ? void 0 : settings.customSettings) === null || _a === void 0 ? void 0 : _a.notion) === null || _b === void 0 ? void 0 : _b.accessToken,
            });
            const n2m = new notion_to_md_1.NotionToMarkdown({ notionClient: notion });
            for (const match of matches) {
                const pageId = match[1];
                try {
                    const mdblocks = yield n2m.pageToMarkdown(pageId);
                    const mdString = n2m.toMarkdownString(mdblocks);
                    enrichedPrompt = enrichedPrompt.replace(match[0], `\n--- Content of ${pageId} ---\n${mdString.parent}\n---\n`);
                }
                catch (error) {
                    console.error(error, `of ${pageId}`);
                }
            }
            return enrichedPrompt;
        }
        catch (e) {
            console.error("not able to connect to notion", e);
            return prompt;
        }
    });
}
function generateWorkLog(screenData, model, startTime, endTime, customPrompt) {
    return __awaiter(this, void 0, void 0, function* () {
        let enrichedPrompt = customPrompt || "";
        if (customPrompt) {
            enrichedPrompt = yield extractLinkedContent(customPrompt);
        }
        const defaultPrompt = `Based on the following screen data, generate a concise work activity log entry.
    Rules:
    - use the screen data to generate the log entry
    - focus on describing the activity and tags
    - use the following context to better understand the user's goals and priorities:

    ${enrichedPrompt}

    Screen data: ${JSON.stringify(screenData)}

    Return a JSON object with:
    {
        "title": "Brief title of the activity",
        "description": "Concise description of what was done",
        "tags": ["#tag1", "#tag2", "#tag3"]
    }`;
        console.log("enrichedPrompt prompt:", enrichedPrompt);
        const provider = (0, ollama_ai_provider_1.ollama)(model);
        const response = yield (0, ai_1.generateObject)({
            model: provider,
            messages: [{ role: "user", content: defaultPrompt }],
            schema: exports.workLog,
        });
        const formatDate = (date) => {
            return date.toLocaleString("en-US", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            });
        };
        return Object.assign(Object.assign({}, response.object), { startTime: formatDate(startTime), endTime: formatDate(endTime) });
    });
}
