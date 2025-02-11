"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const js_1 = require("@screenpipe/js");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
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
function saveToGraph(intelligence, obsidianPath) {
    return __awaiter(this, void 0, void 0, function* () {
        // normalize path for cross-platform compatibility
        const normalizedPath = path.normalize(obsidianPath);
        const graphPath = path.join(normalizedPath, "relationship-graph");
        yield fs.mkdir(graphPath, { recursive: true });
        // create markdown file with mermaid graph
        let mermaidGraph = "```mermaid\ngraph TD\n";
        // add nodes for each contact
        intelligence.contacts.forEach((contact) => {
            mermaidGraph += `    ${contact.name.replace(/\s+/g, "_")}["${contact.name}\n${contact.company || ""}"]\n`;
        });
        // add basic relationships between contacts that share topics
        const contactsByTopic = new Map();
        intelligence.contacts.forEach((contact) => {
            contact.topics.forEach((topic) => {
                var _a;
                if (!contactsByTopic.has(topic)) {
                    contactsByTopic.set(topic, []);
                }
                (_a = contactsByTopic.get(topic)) === null || _a === void 0 ? void 0 : _a.push(contact.name);
            });
        });
        // create edges for contacts sharing topics
        contactsByTopic.forEach((contacts) => {
            for (let i = 0; i < contacts.length; i++) {
                for (let j = i + 1; j < contacts.length; j++) {
                    mermaidGraph += `    ${contacts[i].replace(/\s+/g, "_")} --- ${contacts[j].replace(/\s+/g, "_")}\n`;
                }
            }
        });
        mermaidGraph += "```\n";
        // save as markdown with frontmatter
        const content = `---
created: ${new Date().toISOString()}
tags: [relationship-intelligence, crm, network]
---

# relationship intelligence report

## network graph
${mermaidGraph}

## key contacts
${intelligence.contacts
            .map((c) => `
### ${c.name}
- company: ${c.company || "n/a"}
- last interaction: ${c.lastInteraction}
- sentiment: ${c.sentiment}
- topics: ${c.topics.join(", ")}
- next steps: ${c.nextSteps.join(", ")}
`)
            .join("\n")}

## insights
### follow-ups needed
${intelligence.insights.followUps.map((f) => `- ${f}`).join("\n")}

### opportunities
${intelligence.insights.opportunities.map((o) => `- ${o}`).join("\n")}
`;
        const filename = `${new Date().toISOString().split("T")[0]}-intelligence.md`;
        yield fs.writeFile(path.join(graphPath, filename), content, "utf8");
        // get vault name safely for windows paths
        const relativePath = obsidianPath
            .replace(normalizedPath, "")
            .replace(/^\//, "");
        // Return the deep link
        return `obsidian://search?vault=${encodeURIComponent(relativePath)}&query=relationship-intelligence`;
    });
}
function readRecentLogs(obsidianPath, since) {
    return __awaiter(this, void 0, void 0, function* () {
        const today = new Date().toISOString().split("T")[0];
        const yesterday = since.toISOString().split("T")[0];
        try {
            // just read today and yesterday's logs as raw text
            const todayContent = yield fs
                .readFile(path.join(obsidianPath, `${today}.md`), "utf8")
                .catch(() => "");
            const yesterdayContent = yield fs
                .readFile(path.join(obsidianPath, `${yesterday}.md`), "utf8")
                .catch(() => "");
            return `${yesterdayContent}\n${todayContent}`;
        }
        catch (error) {
            console.error("failed to read logs:", error);
            return "";
        }
    });
}
function GET() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const settings = yield js_1.pipe.settings.getNamespaceSettings("obsidian");
            const obsidianPath = settings === null || settings === void 0 ? void 0 : settings.vaultPath;
            const model = settings === null || settings === void 0 ? void 0 : settings.aiModel;
            if (!obsidianPath) {
                return server_1.NextResponse.json({ error: "obsidian path not configured" }, { status: 400 });
            }
            // get last 24 hours of logs
            const today = new Date();
            const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
            const recentLogs = yield readRecentLogs(obsidianPath, yesterday);
            if (recentLogs.length === 0) {
                return server_1.NextResponse.json({ message: "no logs found for analysis" });
            }
            const intelligence = yield analyzeRelationships(recentLogs, model);
            const deepLink = yield saveToGraph(intelligence, obsidianPath);
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
