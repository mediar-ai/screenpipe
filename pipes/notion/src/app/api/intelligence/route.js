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
const zod_1 = require("zod");
const ai_1 = require("ai");
const ollama_ai_provider_1 = require("ollama-ai-provider");
const client_1 = require("@notionhq/client");
const client_2 = require("@/lib/notion/client");
const js_1 = require("@screenpipe/js");
// rich schema for relationship intelligence
const contactSchema = zod_1.z.object({
    name: zod_1.z.string(),
    company: zod_1.z.string().optional(),
    lastInteraction: zod_1.z.string(),
    sentiment: zod_1.z.number(), // -1 to 1
    topics: zod_1.z.array(zod_1.z.string()),
    nextSteps: zod_1.z.array(zod_1.z.string()),
});
const relationshipIntelligence = zod_1.z.object({
    contacts: zod_1.z.array(contactSchema),
    insights: zod_1.z.object({
        followUps: zod_1.z.array(zod_1.z.string()),
        opportunities: zod_1.z.array(zod_1.z.string()),
    }),
});
function analyzeRelationships(recentLogs, model) {
    return __awaiter(this, void 0, void 0, function* () {
        const prompt = `analyze these work logs and create a comprehensive relationship intelligence report.
    focus on:
    - identifying key people and their roles
    - tracking interaction patterns and sentiment
    - spotting business opportunities
    - suggesting follow-ups and introductions
    - finding patterns in topics discussed

    recent logs: ${recentLogs}

    todays date: ${new Date().toISOString().split("T")[0]}
    local time: ${new Date().toLocaleTimeString()}
    timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}

    return a detailed json object following this structure for relationship intelligence.

    example response from you:

    {
      "contacts": [
        {
          "name": "John Doe",
          "company": "Acme Inc.",
          "lastInteraction": "2024-01-01",
          "sentiment": 0.8,
          "topics": ["sales", "marketing"],
          "nextSteps": ["schedule a call", "send a follow-up email"]
        }
      ],
      "insights": {
        "followUps": ["schedule a call", "send a follow-up email"],
        "opportunities": ["schedule a call", "send a follow-up email"]
      }
    }

    of course adapt the example response to the actual data you have, do not use John Doe in your example response, use the names and companies of the people you see in the logs.
    `;
        const provider = (0, ollama_ai_provider_1.ollama)(model);
        console.log("prompt", prompt);
        const response = yield (0, ai_1.generateObject)({
            model: provider,
            messages: [{ role: "user", content: prompt }],
            schema: relationshipIntelligence,
            maxRetries: 5,
        });
        console.log(response.object);
        return response.object;
    });
}
function readRecentLogs(client, databaseId, since) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield client.databases.query({
                database_id: databaseId,
                filter: {
                    and: [
                        {
                            property: "Date",
                            date: {
                                on_or_after: since.toISOString().split("T")[0],
                            },
                        },
                    ],
                },
                sorts: [
                    {
                        property: "Date",
                        direction: "ascending",
                    },
                ],
            });
            return response.results
                .map((page) => {
                var _a, _b, _c, _d, _e, _f;
                const title = ((_c = (_b = (_a = page.properties.Title) === null || _a === void 0 ? void 0 : _a.title[0]) === null || _b === void 0 ? void 0 : _b.text) === null || _c === void 0 ? void 0 : _c.content) || "";
                const description = ((_f = (_e = (_d = page.properties.Description) === null || _d === void 0 ? void 0 : _d.rich_text[0]) === null || _e === void 0 ? void 0 : _e.text) === null || _f === void 0 ? void 0 : _f.content) || "";
                return `${title}\n${description}`;
            })
                .join("\n\n");
        }
        catch (error) {
            console.error("Failed to read logs:", error);
            return "";
        }
    });
}
function GET() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            const settings = yield js_1.pipe.settings.getNamespaceSettings("notion");
            if (!((_a = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _a === void 0 ? void 0 : _a.accessToken) ||
                !((_b = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _b === void 0 ? void 0 : _b.databaseId) ||
                !((_c = settings === null || settings === void 0 ? void 0 : settings.notion) === null || _c === void 0 ? void 0 : _c.intelligenceDbId)) {
                return server_1.NextResponse.json({ error: "notion not configured" }, { status: 400 });
            }
            const client = new client_1.Client({ auth: settings.notion.accessToken });
            // Get last 24 hours of logs
            const today = new Date();
            const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
            const recentLogs = yield readRecentLogs(client, settings.notion.databaseId, yesterday);
            if (!recentLogs) {
                return server_1.NextResponse.json({ message: "no logs found for analysis" }, { status: 404 });
            }
            const intelligence = yield analyzeRelationships(recentLogs, settings.aiModel || "mistral");
            const notion = new client_2.NotionClient(settings.notion);
            const deepLink = yield notion.createIntelligence(intelligence);
            return server_1.NextResponse.json({
                message: "relationship intelligence updated",
                intelligence,
                deepLink,
                summary: {
                    contacts: intelligence.contacts.length,
                    opportunities: intelligence.insights.opportunities.length,
                    needsFollowUp: intelligence.insights.followUps.length,
                    logsAnalyzed: recentLogs.length,
                },
            });
        }
        catch (error) {
            console.error("error in intelligence api:", error);
            return server_1.NextResponse.json({ error: `failed to process intelligence: ${error}` }, { status: 500 });
        }
    });
}
