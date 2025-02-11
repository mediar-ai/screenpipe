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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultSettings = exports.pipe = void 0;
const utils_1 = require("../../common/utils");
const SettingsManager_1 = require("./SettingsManager");
const InboxManager_1 = require("./InboxManager");
const PipesManager_1 = require("../../common/PipesManager");
const analytics_1 = require("../../common/analytics");
class NodePipe {
    constructor() {
        this.analyticsInitialized = false;
        this.analyticsEnabled = true;
        this.input = {
            type: (text) => this.sendInputControl({ type: "WriteText", data: text }),
            press: (key) => this.sendInputControl({ type: "KeyPress", data: key }),
            moveMouse: (x, y) => this.sendInputControl({ type: "MouseMove", data: { x, y } }),
            click: (button) => this.sendInputControl({ type: "MouseClick", data: button }),
        };
        this.settings = new SettingsManager_1.SettingsManager();
        this.inbox = new InboxManager_1.InboxManager();
        this.pipes = new PipesManager_1.PipesManager();
    }
    sendDesktopNotification(options) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initAnalyticsIfNeeded();
            const notificationApiUrl = "http://localhost:11435";
            try {
                yield fetch(`${notificationApiUrl}/notify`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(options),
                });
                yield (0, analytics_1.captureEvent)("notification_sent", {
                    success: true,
                });
                return true;
            }
            catch (error) {
                yield (0, analytics_1.captureEvent)("error_occurred", {
                    feature: "notification",
                    error: "send_failed",
                });
                console.error("failed to send notification:", error);
                return false;
            }
        });
    }
    sendInputControl(action) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initAnalyticsIfNeeded();
            const apiUrl = process.env.SCREENPIPE_SERVER_URL || "http://localhost:3030";
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
    queryScreenpipe(params) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initAnalyticsIfNeeded();
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
                    content_type: params.contentType,
                    result_count: data.pagination.total,
                });
                return (0, utils_1.convertToCamelCase)(data);
            }
            catch (error) {
                yield (0, analytics_1.captureEvent)("error_occurred", {
                    feature: "search",
                    error: "query_failed",
                });
                console.error("error querying screenpipe:", error);
                return null;
            }
        });
    }
    initAnalyticsIfNeeded() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.analyticsInitialized)
                return;
            const settings = yield this.settings.getAll();
            this.analyticsEnabled = settings.analyticsEnabled;
            if (settings.analyticsEnabled) {
                this.analyticsInitialized = true;
            }
        });
    }
    captureEvent(eventName, properties) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.analyticsEnabled)
                return;
            yield this.initAnalyticsIfNeeded();
            const settings = yield this.settings.getAll();
            return (0, analytics_1.captureEvent)(eventName, Object.assign({ distinct_id: settings.user.id, email: settings.user.email }, properties));
        });
    }
    captureMainFeatureEvent(featureName, properties) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.analyticsEnabled)
                return;
            yield this.initAnalyticsIfNeeded();
            return (0, analytics_1.captureMainFeatureEvent)(featureName, properties);
        });
    }
}
const pipe = new NodePipe();
exports.pipe = pipe;
__exportStar(require("../../common/types"), exports);
var utils_2 = require("../../common/utils");
Object.defineProperty(exports, "getDefaultSettings", { enumerable: true, get: function () { return utils_2.getDefaultSettings; } });
