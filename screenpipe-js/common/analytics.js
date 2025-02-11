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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureEvent = captureEvent;
exports.captureMainFeatureEvent = captureMainFeatureEvent;
const posthog_js_1 = __importDefault(require("posthog-js"));
const POSTHOG_KEY = "phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce";
const POSTHOG_HOST = "https://eu.i.posthog.com";
let initialized = false;
function initPosthog(userId, email) {
    if (!initialized) {
        posthog_js_1.default.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            distinct_id: userId,
            email: email,
        });
        posthog_js_1.default.identify(userId, { email: email });
        initialized = true;
    }
}
function captureEvent(name, properties) {
    return __awaiter(this, void 0, void 0, function* () {
        initPosthog(properties === null || properties === void 0 ? void 0 : properties.distinct_id, properties === null || properties === void 0 ? void 0 : properties.email);
        const _a = properties || {}, { distinct_id } = _a, restProperties = __rest(_a, ["distinct_id"]);
        posthog_js_1.default.capture(name, restProperties);
    });
}
function captureMainFeatureEvent(name, properties) {
    return __awaiter(this, void 0, void 0, function* () {
        initPosthog(properties === null || properties === void 0 ? void 0 : properties.distinct_id, properties === null || properties === void 0 ? void 0 : properties.email);
        const _a = properties || {}, { distinct_id } = _a, restProperties = __rest(_a, ["distinct_id"]);
        posthog_js_1.default.capture(name, Object.assign({ feature: "main" }, restProperties));
    });
}
