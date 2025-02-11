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
exports.VideoComponent = void 0;
const react_1 = require("react");
const utils_1 = require("@/lib/utils");
const video_actions_1 = require("@/lib/actions/video-actions");
exports.VideoComponent = (0, react_1.memo)(function VideoComponent({ filePath, customDescription, className, }) {
    const [mediaSrc, setMediaSrc] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    const [isAudio, setIsAudio] = (0, react_1.useState)(false);
    const sanitizeFilePath = (0, react_1.useCallback)((path) => {
        const isWindows = navigator.userAgent.includes("Windows");
        if (isWindows) {
            return path; // no sanitization on windows
        }
        return path
            .replace(/^["']|["']$/g, "")
            .trim()
            .replace(/\//g, "/");
    }, []);
    const renderFileLink = () => (<div className="mt-2 text-center text-xs text-gray-500 truncate px-2" title={filePath}>
      {customDescription || filePath}
    </div>);
    const getMimeType = (path) => {
        var _a;
        const ext = (_a = path.split(".").pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase();
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
    (0, react_1.useEffect)(() => {
        function loadMedia() {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    console.log("Loading media:", filePath);
                    const sanitizedPath = sanitizeFilePath(filePath);
                    console.log("Sanitized path:", sanitizedPath);
                    if (!sanitizedPath) {
                        throw new Error("Invalid file path");
                    }
                    setIsAudio(sanitizedPath.toLowerCase().includes("input") ||
                        sanitizedPath.toLowerCase().includes("output"));
                    const { data, mimeType } = yield (0, video_actions_1.getMediaFile)(sanitizedPath);
                    const binaryData = atob(data);
                    const bytes = new Uint8Array(binaryData.length);
                    for (let i = 0; i < binaryData.length; i++) {
                        bytes[i] = binaryData.charCodeAt(i);
                    }
                    const blob = new Blob([bytes], { type: mimeType });
                    setMediaSrc(URL.createObjectURL(blob));
                }
                catch (error) {
                    console.warn("Failed to load media:", error);
                    setError(`Failed to load media: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
            });
        }
        loadMedia();
        return () => {
            if (mediaSrc)
                URL.revokeObjectURL(mediaSrc);
        };
    }, [filePath, sanitizeFilePath]);
    if (error) {
        return (<div className="w-full p-4 bg-red-100 border border-red-300 rounded-md">
        <p className="text-red-700">{error}</p>
        {renderFileLink()}
      </div>);
    }
    if (!mediaSrc) {
        return (<div className={(0, utils_1.cn)("w-full h-48 bg-gray-200 animate-pulse rounded-md flex items-center justify-center", className)}>
        <span className="text-gray-500">Loading media...</span>
      </div>);
    }
    return (<div className={(0, utils_1.cn)("w-full max-w-2xl text-center", className)}>
      {isAudio ? (<div className="bg-gray-100 p-4 rounded-md">
          <audio controls className="w-full">
            <source src={mediaSrc} type="audio/mpeg"/>
            Your browser does not support the audio element.
          </audio>
        </div>) : (<video controls className="w-full rounded-md">
          <source src={mediaSrc} type='video/mp4; codecs="hvc1"'/>
          <source src={mediaSrc} type='video/mp4; codecs="hvec"'/>
          <source src={mediaSrc} type="video/mp4"/>
          Your browser does not support the video tag.
        </video>)}
      {renderFileLink()}
    </div>);
});
