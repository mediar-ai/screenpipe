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
const chrome_session_1 = require("@/lib/chrome-session");
const route_logger_1 = require("@/lib/route-logger");
const logger = new route_logger_1.RouteLogger('chrome-navigate');
function navigateToPage(page, url) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            logger.log('starting navigation');
            logger.log(`target url: ${url}`);
            // Set longer timeout but keep navigation simple
            yield page.setDefaultNavigationTimeout(60000);
            logger.log('navigation timeout set to 60s');
            // Navigate to the target URL with same settings as search navigation
            logger.log('navigating to page...');
            const response = yield page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });
            logger.log(`navigation response status: ${(response === null || response === void 0 ? void 0 : response.status()) || 0}`);
            // Wait for the main content to load
            logger.log('waiting for body element...');
            yield page.waitForSelector('body', { timeout: 30000 });
            logger.log('body element found');
            // Store the page in ChromeSession after successful navigation
            chrome_session_1.ChromeSession.getInstance().setActivePage(page);
            logger.log('page stored in chrome session');
            return {
                status: (response === null || response === void 0 ? void 0 : response.status()) || 0,
                finalUrl: page.url()
            };
        }
        catch (error) {
            logger.log(`navigation error: ${error}`);
            throw error;
        }
    });
}
function POST(request) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { url } = yield request.json();
            logger.log(`attempting to navigate to: ${url}`);
            // Setup the browser connection
            logger.log('setting up browser...');
            const { page } = yield (0, browser_setup_1.setupBrowser)(logger);
            // Perform the navigation
            const result = yield navigateToPage(page, url);
            logger.log(`navigation complete. final url: ${result.finalUrl}`);
            // Return a successful response with navigation details
            return server_1.NextResponse.json({
                success: true,
                status: result.status,
                finalUrl: result.finalUrl,
                logs: logger.getLogs()
            });
        }
        catch (error) {
            logger.log(`failed to navigate: ${error}`);
            // Return an error response with details
            return server_1.NextResponse.json({
                success: false,
                error: 'failed to navigate',
                details: error instanceof Error ? error.message : String(error),
                logs: logger.getLogs()
            }, { status: 500 });
        }
    });
}
