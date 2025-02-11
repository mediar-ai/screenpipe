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
const workLog = zod_1.z.object({
    title: zod_1.z.string(),
    description: zod_1.z.string(),
    tags: zod_1.z.array(zod_1.z.string()),
});
function readObsidianFile(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const content = yield fs.readFile(filePath, "utf8");
            return content;
        }
        catch (err) {
            console.error(`failed to read file ${filePath}:`, err);
            return "";
        }
    });
}
function findVaultRoot(startPath) {
    return __awaiter(this, void 0, void 0, function* () {
        let currentPath = startPath;
        while (currentPath !== "/" && currentPath !== ".") {
            try {
                // Check if .obsidian exists in current directory
                yield fs.access(path.join(currentPath, ".obsidian"));
                return currentPath; // Found the vault root
            }
            catch (_a) {
                // Move up one directory
                currentPath = path.dirname(currentPath);
            }
        }
        throw new Error("could not find obsidian vault root (.obsidian folder)");
    });
}
function extractLinkedContent(prompt, basePath) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Find the vault root first
            const vaultRoot = yield findVaultRoot(basePath);
            // Match @[[file]] or @[[folder/file]] patterns
            const linkRegex = /@\[\[(.*?)\]\]/g;
            const matches = [...prompt.matchAll(linkRegex)];
            let enrichedPrompt = prompt;
            for (const match of matches) {
                const relativePath = match[1];
                // Handle .md extension if not present
                const fullPath = path.join(vaultRoot, relativePath.endsWith(".md") ? relativePath : `${relativePath}.md`);
                try {
                    const content = yield readObsidianFile(fullPath);
                    // Replace the @[[link]] with actual content
                    enrichedPrompt = enrichedPrompt.replace(match[0], `\n--- Content of ${relativePath} ---\n${content}\n---\n`);
                }
                catch (err) {
                    console.error(`failed to process link ${relativePath}:`, err);
                }
            }
            return enrichedPrompt;
        }
        catch (err) {
            console.error("failed to find vault root:", err);
            return prompt; // Return original prompt if we can't process links
        }
    });
}
function generateWorkLog(screenData, model, startTime, endTime, customPrompt, obsidianPath) {
    return __awaiter(this, void 0, void 0, function* () {
        let enrichedPrompt = customPrompt || "";
        if (customPrompt && obsidianPath) {
            enrichedPrompt = yield extractLinkedContent(customPrompt, obsidianPath);
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
            schema: workLog,
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
function syncLogToObsidian(logEntry, obsidianPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const normalizedPath = path.normalize(obsidianPath);
        yield fs.mkdir(normalizedPath, { recursive: true });
        const today = new Date();
        const filename = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}.md`;
        const filePath = path.join(normalizedPath, filename);
        const vaultName = path.basename(path.resolve(normalizedPath));
        const tableRow = `| ${logEntry.title} | ${logEntry.description} | ${logEntry.tags.join(", ")} | ${logEntry.startTime} | ${logEntry.endTime} |\n`;
        try {
            yield fs.access(filePath);
            yield fs.appendFile(filePath, tableRow, "utf8");
        }
        catch (_a) {
            const content = `| Title | Description | Tags | Start Time | End Time |\n|-------|-------------|------|------------|------------|\n${tableRow}`;
            yield fs.writeFile(filePath, content, "utf8");
        }
        return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filename)}`;
    });
}
function GET() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const settings = yield js_1.pipe.settings.getNamespaceSettings("obsidian");
            const interval = (settings === null || settings === void 0 ? void 0 : settings.interval) || 3600000;
            const obsidianPath = settings === null || settings === void 0 ? void 0 : settings.vaultPath;
            const customPrompt = settings === null || settings === void 0 ? void 0 : settings.prompt;
            const pageSize = (settings === null || settings === void 0 ? void 0 : settings.pageSize) || 100;
            const model = settings === null || settings === void 0 ? void 0 : settings.aiModel;
            if (!obsidianPath) {
                return server_1.NextResponse.json({ error: "obsidian path not configured" }, { status: 400 });
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
                return server_1.NextResponse.json({ message: "no activity detected" });
            }
            const logEntry = yield generateWorkLog(screenData.data, model, oneHourAgo, now, customPrompt, obsidianPath);
            const _ = yield syncLogToObsidian(logEntry, obsidianPath);
            yield js_1.pipe.captureEvent("obsidian_work_log_synced", {
                model,
                interval,
                pageSize,
            });
            return server_1.NextResponse.json({
                message: "work log synced successfully",
                logEntry,
            });
        }
        catch (error) {
            console.error("error in work log api:", error);
            return server_1.NextResponse.json({ error: `failed to process work log: ${error}` }, { status: 500 });
        }
    });
}
