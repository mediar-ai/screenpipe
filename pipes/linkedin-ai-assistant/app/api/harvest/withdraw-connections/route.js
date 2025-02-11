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
exports.fetchCache = exports.dynamic = void 0;
exports.POST = POST;
exports.GET = GET;
const server_1 = require("next/server");
const browser_setup_1 = require("@/lib/browser-setup");
const chrome_session_1 = require("@/lib/chrome-session");
const withdraw_connections_1 = require("@/lib/logic-sequence/withdraw-connections");
exports.dynamic = 'force-dynamic';
exports.fetchCache = 'force-no-store';
// Track withdrawal process state
let isWithdrawing = false;
function POST() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('stop withdraw requested');
        isWithdrawing = false;
        (0, withdraw_connections_1.setShouldStop)(true);
        return server_1.NextResponse.json({
            success: true,
            message: 'withdrawal process stopped',
            isWithdrawing: false
        });
    });
}
function GET(request) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const url = new URL(request.url);
            const shouldStart = url.searchParams.get('start') === 'true';
            if (shouldStart && !isWithdrawing) {
                isWithdrawing = true;
                (0, withdraw_connections_1.setShouldStop)(false);
                // First check if we have an active page in the session
                let page = chrome_session_1.ChromeSession.getInstance().getActivePage();
                // If no page in session, try to set up browser
                if (!page) {
                    const { page: newPage } = yield (0, browser_setup_1.setupBrowser)();
                    page = newPage;
                }
                if (!page) {
                    throw new Error('no active browser page available');
                }
                // Start withdrawal process in background
                (0, withdraw_connections_1.startWithdrawing)().catch(error => {
                    console.error('withdrawal process failed:', error);
                    isWithdrawing = false;
                });
            }
            return server_1.NextResponse.json({
                status: isWithdrawing ? 'running' : 'stopped',
                message: isWithdrawing ? 'withdrawal process running' : 'withdrawal process not running'
            });
        }
        catch (error) {
            console.error('withdrawal process failed:', error);
            isWithdrawing = false;
            return server_1.NextResponse.json({
                status: 'error',
                error: error.message
            }, { status: 200 });
        }
    });
}
