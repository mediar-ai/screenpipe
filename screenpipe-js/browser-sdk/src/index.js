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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultSettings = exports.pipe = void 0;
const utils_1 = require("../../common/utils");
const analytics_1 = require("../../common/analytics");
const PipesManager_1 = require("../../common/PipesManager");
const WS_URL = "ws://localhost:3030/ws/events";
// At the top of the file, add WebSocket instances
let wsWithImages = null;
let wsWithoutImages = null;
// Update the wsEvents generator to accept includeImages parameter and manage connections
function wsEvents() {
    return __asyncGenerator(this, arguments, function* wsEvents_1(includeImages = false) {
        // Reuse existing connection or create new one
        let ws = includeImages ? wsWithImages : wsWithoutImages;
        if (!ws || ws.readyState === WebSocket.CLOSED) {
            ws = new WebSocket(`${WS_URL}?images=${includeImages}`);
            if (includeImages) {
                wsWithImages = ws;
            }
            else {
                wsWithoutImages = ws;
            }
            // Wait for connection to establish
            yield __await(new Promise((resolve, reject) => {
                ws.onopen = resolve;
                ws.onerror = reject;
            }));
        }
        while (true) {
            const event = yield __await(new Promise((resolve) => {
                ws.addEventListener("message", (ev) => resolve(ev));
            }));
            yield yield __await(JSON.parse(event.data));
        }
    });
}
function sendInputControl(action) {
    return __awaiter(this, void 0, void 0, function* () {
        const apiUrl = "http://localhost:3030";
        try {
            const response = yield fetch(`${apiUrl}/experimental/input_control`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            if (!response.ok) {
                throw new Error(`http error! status: ${response.status}`);
            }
            const data = yield response.json();
            return data.success;
        }
        catch (error) {
            console.error("failed to control input:", error);
            return false;
        }
    });
}
class BrowserPipeImpl {
    constructor() {
        this.input = {
            type: (text) => sendInputControl({ type: "WriteText", data: text }),
            press: (key) => sendInputControl({ type: "KeyPress", data: key }),
            moveMouse: (x, y) => sendInputControl({ type: "MouseMove", data: { x, y } }),
            click: (button) => sendInputControl({ type: "MouseClick", data: button }),
        };
        this.pipes = {
            list: () => __awaiter(this, void 0, void 0, function* () {
                try {
                    const response = yield fetch("http://localhost:3030/pipes/list", {
                        method: "GET",
                        headers: { "Content-Type": "application/json" },
                    });
                    const data = yield response.json();
                    return data.data;
                }
                catch (error) {
                    console.error("failed to list pipes:", error);
                    return [];
                }
            }),
            download: (url) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const response = yield fetch("http://localhost:3030/pipes/download", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            url,
                        }),
                    });
                    return response.ok;
                }
                catch (error) {
                    console.error("failed to download pipe:", error);
                    return false;
                }
            }),
            enable: (pipeId) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const response = yield fetch("http://localhost:3030/pipes/enable", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            pipe_id: pipeId,
                        }),
                    });
                    return response.ok;
                }
                catch (error) {
                    console.error("failed to enable pipe:", error);
                    return false;
                }
            }),
            disable: (pipeId) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const response = yield fetch("http://localhost:3030/pipes/disable", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            pipe_id: pipeId,
                        }),
                    });
                    return response.ok;
                }
                catch (error) {
                    console.error("failed to disable pipe:", error);
                    return false;
                }
            }),
            update: (pipeId, config) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const response = yield fetch("http://localhost:3030/pipes/update", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            pipe_id: pipeId,
                            config,
                        }),
                    });
                    return response.ok;
                }
                catch (error) {
                    console.error("failed to update pipe:", error);
                    return false;
                }
            }),
        };
    }
    initAnalyticsIfNeeded() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Connect to settings SSE stream
                const settingsStream = new EventSource("http://localhost:11435/sse/settings");
                // Get initial settings
                const settings = yield new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        settingsStream.close();
                        reject(new Error("settings stream timeout"));
                    }, 5000);
                    settingsStream.onmessage = (event) => {
                        var _a, _b, _c, _d, _e, _f;
                        clearTimeout(timeout);
                        settingsStream.close();
                        // Parse the settings array and find analyticsEnabled
                        const settingsArray = JSON.parse(event.data);
                        const analyticsEnabled = (_b = (_a = settingsArray.find(([key]) => key === "analyticsEnabled")) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : false;
                        const userId = (_d = (_c = settingsArray.find(([key]) => key === "user.clerk_id")) === null || _c === void 0 ? void 0 : _c[1]) !== null && _d !== void 0 ? _d : undefined;
                        const userEmail = (_f = (_e = settingsArray.find(([key]) => key === "user.email")) === null || _e === void 0 ? void 0 : _e[1]) !== null && _f !== void 0 ? _f : undefined;
                        resolve({ analyticsEnabled, userId, email: userEmail });
                    };
                    settingsStream.onerror = (error) => {
                        clearTimeout(timeout);
                        settingsStream.close();
                        reject(error);
                    };
                });
                return {
                    analyticsEnabled: settings.analyticsEnabled,
                    userId: settings.userId,
                    email: settings.email,
                };
            }
            catch (error) {
                console.error("failed to fetch settings, defaulting to analytics enabled:", error);
                return {
                    analyticsEnabled: false,
                    userId: undefined,
                };
            }
        });
    }
    sendDesktopNotification(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const { userId, email } = yield this.initAnalyticsIfNeeded();
            const notificationApiUrl = "http://localhost:11435";
            try {
                yield fetch(`${notificationApiUrl}/notify`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(options),
                });
                yield this.captureEvent("notification_sent", {
                    distinct_id: userId,
                    email: email,
                    success: true,
                });
                return true;
            }
            catch (error) {
                yield this.captureEvent("error_occurred", {
                    feature: "notification",
                    error: "send_failed",
                    distinct_id: userId,
                    email: email,
                });
                return false;
            }
        });
    }
    queryScreenpipe(params) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("queryScreenpipe:", params);
            const { userId, email } = yield this.initAnalyticsIfNeeded();
            const queryParams = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== "") {
                    if (key === "speakerIds" && Array.isArray(value)) {
                        if (value.length > 0) {
                            queryParams.append((0, utils_1.toSnakeCase)(key), value.join(","));
                        }
                    }
                    else {
                        const snakeKey = (0, utils_1.toSnakeCase)(key);
                        queryParams.append(snakeKey, value.toString());
                    }
                }
            });
            const url = `http://localhost:3030/search?${queryParams}`;
            try {
                const response = yield fetch(url);
                if (!response.ok) {
                    const errorText = yield response.text();
                    let errorJson;
                    try {
                        errorJson = JSON.parse(errorText);
                        console.error("screenpipe api error:", {
                            status: response.status,
                            error: errorJson,
                        });
                    }
                    catch (_a) {
                        console.error("screenpipe api error:", {
                            status: response.status,
                            error: errorText,
                        });
                    }
                    throw new Error(`http error! status: ${response.status}`);
                }
                const data = yield response.json();
                yield (0, analytics_1.captureEvent)("search_performed", {
                    distinct_id: userId,
                    content_type: params.contentType,
                    result_count: data.pagination.total,
                    email: email,
                });
                return (0, utils_1.convertToCamelCase)(data);
            }
            catch (error) {
                yield (0, analytics_1.captureEvent)("error_occurred", {
                    feature: "search",
                    error: "query_failed",
                    distinct_id: userId,
                    email: email,
                });
                console.error("error querying screenpipe:", error);
                return null;
            }
        });
    }
    streamTranscriptions() {
        return __asyncGenerator(this, arguments, function* streamTranscriptions_1() {
            var _a, e_1, _b, _c;
            try {
                while (true) {
                    try {
                        for (var _d = true, _e = (e_1 = void 0, __asyncValues(wsEvents())), _f; _f = yield __await(_e.next()), _a = _f.done, !_a; _d = true) {
                            _c = _f.value;
                            _d = false;
                            const event = _c;
                            if (event.name === "transcription") {
                                let chunk = event.data;
                                yield yield __await({
                                    id: crypto.randomUUID(),
                                    object: "text_completion_chunk",
                                    created: Date.now(),
                                    model: "screenpipe-realtime",
                                    choices: [
                                        {
                                            text: chunk.transcription,
                                            index: 0,
                                            finish_reason: chunk.is_final ? "stop" : null,
                                        },
                                    ],
                                    metadata: {
                                        timestamp: chunk.timestamp,
                                        device: chunk.device,
                                        isInput: chunk.is_input,
                                    },
                                });
                            }
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                }
            }
            catch (error) {
                console.error("error streaming transcriptions:", error);
            }
        });
    }
    streamVision() {
        return __asyncGenerator(this, arguments, function* streamVision_1(includeImages = false) {
            var _a, e_2, _b, _c;
            try {
                try {
                    for (var _d = true, _e = __asyncValues(wsEvents(includeImages)), _f; _f = yield __await(_e.next()), _a = _f.done, !_a; _d = true) {
                        _c = _f.value;
                        _d = false;
                        const event = _c;
                        if (event.name === "ocr_result" || event.name === "ui_frame") {
                            let data = event.data;
                            yield yield __await({
                                type: event.name,
                                data,
                            });
                        }
                    }
                }
                catch (e_2_1) { e_2 = { error: e_2_1 }; }
                finally {
                    try {
                        if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                    }
                    finally { if (e_2) throw e_2.error; }
                }
            }
            catch (error) {
                console.error("error streaming vision:", error);
            }
        });
    }
    captureEvent(eventName, properties) {
        return __awaiter(this, void 0, void 0, function* () {
            const { analyticsEnabled } = yield this.initAnalyticsIfNeeded();
            if (!analyticsEnabled)
                return;
            return (0, analytics_1.captureEvent)(eventName, properties);
        });
    }
    captureMainFeatureEvent(featureName, properties) {
        return __awaiter(this, void 0, void 0, function* () {
            const { analyticsEnabled } = yield this.initAnalyticsIfNeeded();
            if (!analyticsEnabled)
                return;
            return (0, analytics_1.captureMainFeatureEvent)(featureName, properties);
        });
    }
    streamEvents() {
        return __asyncGenerator(this, arguments, function* streamEvents_1(includeImages = false) {
            var _a, e_3, _b, _c;
            try {
                for (var _d = true, _e = __asyncValues(wsEvents(includeImages)), _f; _f = yield __await(_e.next()), _a = _f.done, !_a; _d = true) {
                    _c = _f.value;
                    _d = false;
                    const event = _c;
                    yield yield __await(event);
                }
            }
            catch (e_3_1) { e_3 = { error: e_3_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                }
                finally { if (e_3) throw e_3.error; }
            }
        });
    }
}
const pipeImpl = new BrowserPipeImpl();
const pipeManager = new PipesManager_1.PipesManager();
exports.pipe = pipeImpl;
pipeImpl.pipes = pipeManager;
__exportStar(require("../../common/types"), exports);
var utils_2 = require("../../common/utils");
Object.defineProperty(exports, "getDefaultSettings", { enumerable: true, get: function () { return utils_2.getDefaultSettings; } });
