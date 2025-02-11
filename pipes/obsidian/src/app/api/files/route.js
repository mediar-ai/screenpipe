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
exports.dynamic = exports.runtime = void 0;
exports.GET = GET;
const server_1 = require("next/server");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const js_1 = require("@screenpipe/js");
// Force Node.js runtime
exports.runtime = "nodejs";
exports.dynamic = "force-dynamic";
// Cache for vault files - invalidated every 5 minutes
let filesCache = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
function findObsidianRoot(startPath) {
    return __awaiter(this, void 0, void 0, function* () {
        let currentPath = startPath;
        while (currentPath !== path_1.default.parse(currentPath).root) {
            try {
                const hasObsidianDir = yield promises_1.default
                    .access(path_1.default.join(currentPath, ".obsidian"))
                    .then(() => true)
                    .catch(() => false);
                if (hasObsidianDir) {
                    return currentPath;
                }
                currentPath = path_1.default.dirname(currentPath);
            }
            catch (error) {
                return null;
            }
        }
        return null;
    });
}
function getAllFiles(vaultPath) {
    return __awaiter(this, void 0, void 0, function* () {
        // Check cache first
        if (filesCache &&
            filesCache.vaultPath === vaultPath &&
            Date.now() - filesCache.timestamp < CACHE_DURATION) {
            return filesCache.files;
        }
        function getFiles(dir) {
            return __awaiter(this, void 0, void 0, function* () {
                const entries = yield promises_1.default.readdir(dir, { withFileTypes: true });
                const files = yield Promise.all(entries.map((entry) => __awaiter(this, void 0, void 0, function* () {
                    const res = path_1.default.resolve(dir, entry.name);
                    // Skip .obsidian directory
                    if (entry.isDirectory() && entry.name !== ".obsidian") {
                        return getFiles(res);
                    }
                    return entry.isFile() && entry.name.endsWith(".md") ? res : [];
                })));
                return files.flat();
            });
        }
        const allFiles = yield getFiles(vaultPath);
        const relativeFiles = allFiles.map((file) => path_1.default.relative(vaultPath, file));
        // Update cache
        filesCache = {
            files: relativeFiles,
            vaultPath,
            timestamp: Date.now(),
        };
        return relativeFiles;
    });
}
function getSearchScore(file, searchTerms) {
    const lowerFile = file.toLowerCase();
    const fileName = path_1.default.basename(file).toLowerCase();
    let score = 0;
    // Exact filename match gets highest score
    if (fileName === searchTerms.join(" ").toLowerCase()) {
        score += 1000;
    }
    // Filename contains all terms in order
    if (fileName.includes(searchTerms.join(" ").toLowerCase())) {
        score += 500;
    }
    // Individual term matches in filename
    for (const term of searchTerms) {
        if (fileName.includes(term)) {
            score += 100;
        }
    }
    // Path matches
    for (const term of searchTerms) {
        if (lowerFile.includes(term)) {
            score += 10;
        }
    }
    return score;
}
function GET(request) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const { searchParams } = new URL(request.url);
            const search = searchParams.get("search") || "";
            console.log("search term:", search);
            const settingsManager = js_1.pipe.settings;
            if (!settingsManager) {
                throw new Error("settingsManager not found");
            }
            const settings = yield settingsManager.getAll();
            const initialPath = (_b = (_a = settings.customSettings) === null || _a === void 0 ? void 0 : _a.obsidian) === null || _b === void 0 ? void 0 : _b.path;
            if (!initialPath) {
                return server_1.NextResponse.json({ files: [] });
            }
            const vaultPath = yield findObsidianRoot(initialPath);
            console.log("vault root path:", vaultPath);
            if (!vaultPath) {
                return server_1.NextResponse.json({ files: [] });
            }
            const allFiles = yield getAllFiles(vaultPath);
            // Optimize search with lowercase and pre-split search terms
            const searchTerms = search.toLowerCase().split(/\s+/);
            const matchingFiles = allFiles
                .filter((file) => {
                const lowerFile = file.toLowerCase();
                return searchTerms.every((term) => lowerFile.includes(term));
            })
                .map((file) => ({
                file,
                score: getSearchScore(file, searchTerms),
            }))
                .sort((a, b) => b.score - a.score) // Sort by score descending
                .map(({ file }) => file) // Extract just the filename
                .slice(0, 50); // Limit results to 50 files
            return server_1.NextResponse.json({ files: matchingFiles });
        }
        catch (error) {
            console.error("Error fetching files:", error);
            return server_1.NextResponse.json({ files: [] });
        }
    });
}
