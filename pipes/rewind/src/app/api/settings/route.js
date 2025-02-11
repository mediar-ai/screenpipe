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
exports.dynamic = exports.runtime = void 0;
exports.GET = GET;
exports.PUT = PUT;
// app/api/settings/route.ts
const js_1 = require("@screenpipe/js");
const server_1 = require("next/server");
const browser_1 = require("@screenpipe/browser");
// Force Node.js runtime
exports.runtime = "nodejs"; // Add this line
exports.dynamic = "force-dynamic";
function GET() {
    return __awaiter(this, void 0, void 0, function* () {
        const defaultSettings = (0, browser_1.getDefaultSettings)();
        try {
            const settingsManager = js_1.pipe.settings;
            if (!settingsManager) {
                throw new Error("settingsManager not found");
            }
            const rawSettings = yield settingsManager.getAll();
            return server_1.NextResponse.json(rawSettings);
        }
        catch (error) {
            console.error("failed to get settings:", error);
            return server_1.NextResponse.json(defaultSettings);
        }
    });
}
function PUT(request) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const settingsManager = js_1.pipe.settings;
            if (!settingsManager) {
                throw new Error("settingsManager not found");
            }
            const body = yield request.json();
            const { key, value, isPartialUpdate, reset } = body;
            if (reset) {
                if (key) {
                    yield settingsManager.resetKey(key);
                }
                else {
                    yield settingsManager.reset();
                }
                return server_1.NextResponse.json({ success: true });
            }
            if (isPartialUpdate) {
                const serializedSettings = JSON.parse(JSON.stringify(value));
                yield settingsManager.update(serializedSettings);
            }
            else {
                const serializedValue = JSON.parse(JSON.stringify(value));
                yield settingsManager.set(key, serializedValue);
            }
            return server_1.NextResponse.json({ success: true });
        }
        catch (error) {
            console.error("failed to update settings:", error);
            return server_1.NextResponse.json({ error: "failed to update settings" }, { status: 500 });
        }
    });
}
