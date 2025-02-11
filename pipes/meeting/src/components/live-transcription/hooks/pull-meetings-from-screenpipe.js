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
exports.useRecentChunks = useRecentChunks;
const react_1 = require("react");
const browser_1 = require("@screenpipe/browser");
function useRecentChunks() {
    const [chunks, setChunks] = (0, react_1.useState)([]);
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    const fetchRecentChunks = () => __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('fetching recent chunks');
            const results = yield browser_1.pipe.queryScreenpipe({
                contentType: "audio",
                limit: 10,
                offset: 0,
            });
            console.log('recent chunks:', results);
            if (!results) {
                console.log('no results returned from queryScreenpipe');
                return;
            }
            const recentChunks = results.data
                .filter((item) => item.type === 'Audio' && item.content)
                .map((item) => {
                var _a, _b;
                const content = item.content;
                console.log('processing chunk content:', content);
                return {
                    id: item.id || crypto.randomUUID(),
                    timestamp: content.timestamp || new Date().toISOString(),
                    text: content.transcription || '',
                    isInput: ((_a = content.deviceType) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === 'input',
                    device: content.deviceName || 'unknown',
                    speaker: (_b = content.speaker) === null || _b === void 0 ? void 0 : _b.id,
                    error: content.error
                };
            })
                .reverse();
            console.log('processed chunks:', recentChunks);
            setChunks(prevChunks => [...recentChunks, ...prevChunks]);
        }
        catch (error) {
            console.error("failed to fetch recent chunks:", error);
        }
        finally {
            setIsLoading(false);
        }
    });
    return { chunks, setChunks, isLoading, fetchRecentChunks };
}
