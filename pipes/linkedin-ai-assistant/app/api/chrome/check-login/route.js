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
const browser_setup_1 = require("@/lib/browser-setup");
const route_logger_1 = require("@/lib/route-logger");
const logger = new route_logger_1.RouteLogger('chrome-check-login');
function POST(request) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield request.json(); // keep reading the request to avoid hanging
            logger.log('checking linkedin login status');
            logger.log('setting up browser...');
            yield (0, browser_setup_1.setupBrowser)(logger);
            const { page } = (0, browser_setup_1.getActiveBrowser)();
            if (!page) {
                logger.log('no active browser session found');
                throw new Error('no active browser session');
            }
            logger.log('evaluating login state...');
            // Check for elements that indicate logged-in state
            const isLoggedIn = yield page.evaluate(() => {
                // Check for feed-specific elements that only appear when logged in
                const feedElements = document.querySelector('.scaffold-layout__main');
                const navElements = document.querySelector('.global-nav__me');
                // Return true if we find elements specific to logged-in state
                return !!(feedElements || navElements);
            });
            logger.log(`login status: ${isLoggedIn ? 'logged in' : 'logged out'}`);
            return server_1.NextResponse.json({
                success: true,
                isLoggedIn: Boolean(isLoggedIn),
                logs: logger.getLogs()
            });
        }
        catch (error) {
            logger.error(`failed to check login status: ${error}`);
            return server_1.NextResponse.json({ success: false, error: String(error), logs: logger.getLogs() }, { status: 500 });
        }
    });
}
