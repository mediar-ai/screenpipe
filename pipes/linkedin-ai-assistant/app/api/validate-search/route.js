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
exports.POST = POST;
const server_1 = require("next/server");
const go_to_search_results_1 = require("@/lib/simple-actions/go-to-search-results");
const browser_setup_1 = require("@/lib/browser-setup");
function POST(request) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { url, allowTruncate } = yield request.json();
            if (!url || !url.includes('linkedin.com/search')) {
                return server_1.NextResponse.json({ error: 'invalid linkedin search url' }, { status: 400 });
            }
            // Setup browser with the provided WebSocket URL
            yield (0, browser_setup_1.setupBrowser)();
            const { page } = (0, browser_setup_1.getActiveBrowser)();
            if (!page) {
                return server_1.NextResponse.json({ error: 'browser not connected' }, { status: 400 });
            }
            const { count } = yield (0, go_to_search_results_1.navigateToSearch)(page, url);
            if (count > 100 && !allowTruncate) {
                return server_1.NextResponse.json({ error: 'too many results (limit: 100). please refine your search' }, { status: 400 });
            }
            return server_1.NextResponse.json({ count });
        }
        catch (error) {
            console.error('search validation failed:', error);
            return server_1.NextResponse.json({ error: String(error) }, { status: 500 });
        }
    });
}
