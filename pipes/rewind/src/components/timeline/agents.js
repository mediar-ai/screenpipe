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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENTS = void 0;
exports.analyzeChunk = analyzeChunk;
function streamCompletion(openai, messages, userQuery, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        var _d, _e;
        const messagesWithQuery = [
            ...messages,
            {
                role: "user",
                content: `User question: "${userQuery}"\nPlease analyze the data in context of this question.`,
            },
        ];
        const stream = yield openai.chat.completions.create({
            model: options.model,
            messages: messagesWithQuery,
            stream: true,
        }, {
            signal: options.signal,
        });
        let fullResponse = "";
        try {
            for (var _f = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield stream_1.next(), _a = stream_1_1.done, !_a; _f = true) {
                _c = stream_1_1.value;
                _f = false;
                const chunk = _c;
                const content = ((_e = (_d = chunk.choices[0]) === null || _d === void 0 ? void 0 : _d.delta) === null || _e === void 0 ? void 0 : _e.content) || "";
                fullResponse += content;
                options.onProgress(fullResponse);
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_f && !_a && (_b = stream_1.return)) yield _b.call(stream_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
    });
}
function analyzeChunk(chunk, openai, model, signal) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const response = yield openai.chat.completions.create({
            model,
            messages: [
                {
                    role: "user",
                    content: "summarize this chunk of activity in 2-3 sentences, focus on key events and patterns",
                },
                {
                    role: "user",
                    content: JSON.stringify(chunk),
                },
            ],
        }, {
            signal,
        });
        return ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || "";
    });
}
exports.AGENTS = [
    {
        id: "recursive-summarizer",
        name: "recursive summarizer",
        description: "good at processing long time ranges but quality decreases with shorter time ranges",
        analyze: (frames_1, openai_1, _a, userQuery_1) => __awaiter(void 0, [frames_1, openai_1, _a, userQuery_1], void 0, function* (frames, openai, { model, onProgress = () => { }, signal }, userQuery) {
            console.log("userQuery", userQuery);
            console.log("frames", frames);
            if (!frames.length) {
                onProgress("no frames to analyze\n\n");
                return;
            }
            onProgress("analyzing chunks...\n\n");
            const chunkSize = 5 * 60 * 1000;
            const chunks = [];
            let currentChunk = [];
            frames.forEach((frame) => {
                const frameTime = new Date(frame.timestamp);
                if (currentChunk.length === 0 ||
                    frameTime.getTime() - new Date(currentChunk[0].timestamp).getTime() <
                        chunkSize) {
                    currentChunk.push({
                        timestamp: frame.timestamp,
                        apps: frame.devices.map((d) => d.metadata.app_name),
                        windows: frame.devices.map((d) => d.metadata.window_name),
                        text: frame.devices.map((d) => d.metadata.ocr_text).filter(Boolean),
                        audio: frame.devices.flatMap((d) => d.audio),
                    });
                }
                else {
                    chunks.push(currentChunk);
                    currentChunk = [frame];
                }
            });
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
            }
            const chunkSummaries = yield Promise.all(chunks.map((chunk, index) => __awaiter(void 0, void 0, void 0, function* () {
                const summary = yield analyzeChunk(chunk, openai, model, signal);
                onProgress(`chunk ${index + 1}/${chunks.length}: ${summary}\n`);
                return {
                    time: new Date(chunk[0].timestamp).toLocaleTimeString(),
                    summary,
                };
            })));
            onProgress("\ncreating final summary...\n\n");
            yield streamCompletion(openai, [
                {
                    role: "user",
                    content: `create a hierarchical summary with these sections:
                ### overview
                (one paragraph summary of entire time range, focusing on answering the user's question)
                
                ### timeline
                (list of chunk summaries with timestamps)
                
                ### patterns
                (key patterns or insights across chunks)`,
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        timeRange: {
                            start: new Date(frames[frames.length - 1].timestamp).toLocaleTimeString(),
                            end: new Date(frames[0].timestamp).toLocaleTimeString(),
                        },
                        chunkSummaries,
                    }),
                },
            ], userQuery, { model, onProgress, signal });
        }),
    },
    {
        id: "context-master",
        name: "context master",
        description: "analyzes everything: apps, windows, text & audio",
        analyze: (frames_1, openai_1, _a, userQuery_1) => __awaiter(void 0, [frames_1, openai_1, _a, userQuery_1], void 0, function* (frames, openai, { model, onProgress, signal }, userQuery) {
            const contextData = frames.map((frame) => ({
                timestamp: frame.timestamp,
                devices: frame.devices.map((device) => ({
                    device_id: device.device_id,
                    metadata: device.metadata,
                    audio: device.audio,
                })),
            }));
            yield streamCompletion(openai, [
                {
                    role: "user",
                    content: "analyze all context including apps, windows, text & audio. provide insights about user activity patterns",
                },
                {
                    role: "user",
                    content: JSON.stringify(contextData),
                },
            ], userQuery, { model, onProgress, signal });
        }),
    },
    {
        id: "window-tracker",
        name: "window tracker",
        description: "focuses on app & window usage data",
        analyze: (frames_1, openai_1, _a, userQuery_1) => __awaiter(void 0, [frames_1, openai_1, _a, userQuery_1], void 0, function* (frames, openai, { model, onProgress, signal }, userQuery) {
            const windowData = frames.map((frame) => ({
                timestamp: frame.timestamp,
                windows: frame.devices.map((device) => ({
                    app: device.metadata.app_name,
                    window: device.metadata.window_name,
                })),
            }));
            yield streamCompletion(openai, [
                {
                    role: "user",
                    content: "analyze app and window usage patterns, focus on work habits and application transitions",
                },
                {
                    role: "user",
                    content: JSON.stringify(windowData),
                },
            ], userQuery, { model, onProgress, signal });
        }),
    },
    {
        id: "text-scanner",
        name: "text scanner",
        description: "analyzes visible text (OCR)",
        analyze: (frames_1, openai_1, _a, userQuery_1) => __awaiter(void 0, [frames_1, openai_1, _a, userQuery_1], void 0, function* (frames, openai, { model, onProgress, signal }, userQuery) {
            const textData = frames.map((frame) => ({
                timestamp: frame.timestamp,
                text: frame.devices
                    .map((device) => device.metadata.ocr_text)
                    .filter(Boolean),
            }));
            yield streamCompletion(openai, [
                {
                    role: "user",
                    content: "analyze OCR text content, identify key topics and information being viewed",
                },
                {
                    role: "user",
                    content: JSON.stringify(textData),
                },
            ], userQuery, { model, onProgress, signal });
        }),
    },
    {
        id: "voice-analyzer",
        name: "voice analyzer",
        description: "focuses on audio transcriptions",
        analyze: (frames_1, openai_1, _a, userQuery_1) => __awaiter(void 0, [frames_1, openai_1, _a, userQuery_1], void 0, function* (frames, openai, { model, onProgress, signal }, userQuery) {
            const audioData = frames.map((frame) => ({
                timestamp: frame.timestamp,
                audio: frame.devices.flatMap((device) => device.audio),
            }));
            yield streamCompletion(openai, [
                {
                    role: "user",
                    content: "analyze audio transcriptions, identify key conversations and spoken content",
                },
                {
                    role: "user",
                    content: JSON.stringify(audioData),
                },
            ], userQuery, { model, onProgress, signal });
        }),
    },
];
