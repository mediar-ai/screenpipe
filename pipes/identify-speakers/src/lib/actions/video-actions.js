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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMediaFile = getMediaFile;
exports.getFileSize = getFileSize;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
function getMediaFile(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const absolutePath = (0, node_path_1.resolve)(filePath);
            const buffer = yield (0, promises_1.readFile)(absolutePath);
            // convert to base64
            const data = buffer.toString("base64");
            const getMimeType = (path) => {
                var _a;
                const ext = (_a = path.split(".").pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                const isAudio = path.toLowerCase().includes("input") ||
                    path.toLowerCase().includes("output");
                switch (ext) {
                    case "mp4":
                        return "video/mp4";
                    case "webm":
                        return "video/webm";
                    case "ogg":
                        return "video/ogg";
                    case "mp3":
                        return "audio/mpeg";
                    case "wav":
                        return "audio/wav";
                    default:
                        return isAudio ? "audio/mpeg" : "video/mp4";
                }
            };
            return {
                data,
                mimeType: getMimeType(filePath),
            };
        }
        catch (error) {
            console.error("failed to read media file:", error);
            throw new Error(`failed to read media file: ${error instanceof Error ? error.message : "unknown error"}`);
        }
    });
}
function getFileSize(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const { size } = yield (0, promises_1.stat)(filePath);
        return size;
    });
}
