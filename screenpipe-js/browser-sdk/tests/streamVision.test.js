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
const bun_test_1 = require("bun:test");
const index_1 = require("../../node-sdk/src/index");
(0, bun_test_1.describe)("streamVision", () => {
    (0, bun_test_1.test)("should receive and format vision events without images", () => __awaiter(void 0, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        const events = [];
        try {
            for (var _d = true, _e = __asyncValues(index_1.pipe.streamVision()), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                _c = _f.value;
                _d = false;
                const event = _c;
                events.push(event);
                if (events.length === 2)
                    break; // Break after receiving two events
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
            }
            finally { if (e_1) throw e_1.error; }
        }
        (0, bun_test_1.expect)(events).toHaveLength(2);
        // verify event format
        (0, bun_test_1.expect)(events[0]).toHaveProperty("type", "vision_stream");
        (0, bun_test_1.expect)(events[0].data).toHaveProperty("text");
        (0, bun_test_1.expect)(events[0].data).toHaveProperty("timestamp");
        (0, bun_test_1.expect)(events[0].data.image || undefined).toBeUndefined(); // images disabled by default
    }), { timeout: 15000 });
    (0, bun_test_1.test)("should receive and format vision events with images", () => __awaiter(void 0, void 0, void 0, function* () {
        var _a, e_2, _b, _c;
        const events = [];
        try {
            for (var _d = true, _e = __asyncValues(index_1.pipe.streamVision(true)), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                _c = _f.value;
                _d = false;
                const event = _c;
                events.push(event);
                if (events.length === 2)
                    break; // Break after receiving two events
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
            }
            finally { if (e_2) throw e_2.error; }
        }
        (0, bun_test_1.expect)(events).toHaveLength(2);
        // verify event format with images
        (0, bun_test_1.expect)(events[0]).toHaveProperty("type", "vision_stream");
        (0, bun_test_1.expect)(events[0].data).toHaveProperty("text");
        (0, bun_test_1.expect)(events[0].data).toHaveProperty("timestamp");
        (0, bun_test_1.expect)(events[0].data).toHaveProperty("image");
        (0, bun_test_1.expect)(typeof events[0].data.image).toBe("string");
    }), { timeout: 10000 });
    (0, bun_test_1.test)("should handle server errors gracefully", () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const generator = index_1.pipe.streamVision();
            yield generator.next();
            (0, bun_test_1.expect)(true).toBe(false); // should not reach here
        }
        catch (error) {
            (0, bun_test_1.expect)(error).toBeDefined();
        }
    }));
});
