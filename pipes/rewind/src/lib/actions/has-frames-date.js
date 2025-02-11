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
exports.hasFramesForDate = hasFramesForDate;
function hasFramesForDate(date) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            // Set up start and end of the day
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            const query = `
            SELECT COUNT(*) as frame_count
            FROM frames f
            WHERE f.timestamp >= '${startOfDay.toISOString()}'
            AND f.timestamp <= '${endOfDay.toISOString()}'
            LIMIT 1
        `;
            const response = yield fetch("http://localhost:3030/raw_sql", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ query }),
            });
            if (!response.ok) {
                return {
                    error: "Error occurred while checking frames",
                    details: yield response.json(),
                };
            }
            const result = yield response.json();
            return ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.frame_count) > 0;
        }
        catch (e) {
            return {
                error: "Error occurred while checking frames",
                details: e,
            };
        }
    });
}
