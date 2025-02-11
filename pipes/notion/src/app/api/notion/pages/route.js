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
exports.GET = GET;
const server_1 = require("next/server");
const client_1 = require("@notionhq/client");
function GET(request) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { searchParams } = new URL(request.url);
            const query = (_a = searchParams.get("q")) === null || _a === void 0 ? void 0 : _a.toLowerCase().trim();
            const accessToken = searchParams.get("accessToken");
            if (!accessToken) {
                return server_1.NextResponse.json({ error: "notion not configured" }, { status: 400 });
            }
            const client = new client_1.Client({ auth: accessToken });
            const response = yield client.search(Object.assign({ filter: {
                    property: "object",
                    value: "page",
                }, sort: {
                    direction: "descending",
                    timestamp: "last_edited_time",
                } }, (query && { query })));
            const pages = response.results.map((page) => {
                var _a, _b, _c, _d;
                return ({
                    id: page.id,
                    title: ((_d = (_c = (_b = (_a = page.properties) === null || _a === void 0 ? void 0 : _a.title) === null || _b === void 0 ? void 0 : _b.title) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.plain_text) || "Untitled",
                    lastEdited: page.last_edited_time,
                    url: page.url,
                    icon: page.icon,
                    parent: {
                        type: page.parent.type,
                        id: page.parent.database_id || page.parent.page_id,
                    },
                });
            });
            return server_1.NextResponse.json({
                pages,
                next_cursor: response.next_cursor,
                has_more: response.has_more,
            });
        }
        catch (error) {
            console.error("error fetching pages:", error);
            return server_1.NextResponse.json({ error: "Failed to fetch pages" }, { status: 500 });
        }
    });
}
