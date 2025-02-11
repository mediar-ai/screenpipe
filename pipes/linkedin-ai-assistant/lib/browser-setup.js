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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDebuggerUrl = getDebuggerUrl;
exports.setupBrowser = setupBrowser;
exports.getActiveBrowser = getActiveBrowser;
exports.quitBrowser = quitBrowser;
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
const chrome_session_1 = require("./chrome-session");
const route_logger_1 = require("./route-logger");
let activeBrowser = null;
let activePage = null;
const defaultLogger = new route_logger_1.RouteLogger('browser-setup');
// Export this function so it can be used elsewhere if needed
function getDebuggerUrl() {
    return __awaiter(this, arguments, void 0, function* (logger = defaultLogger) {
        logger.log('attempting to get debugger url...');
        const response = yield fetch('http://127.0.0.1:9222/json/version');
        if (!response.ok) {
            logger.error(`failed to get debugger url: ${response.status} ${response.statusText}`);
            throw new Error('failed to get fresh websocket url');
        }
        const data = yield response.json();
        logger.log('got debugger url: ' + data.webSocketDebuggerUrl);
        return data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');
    });
}
// we rely on an existing or newly launched chrome instance
function setupBrowser() {
    return __awaiter(this, arguments, void 0, function* (logger = defaultLogger) {
        logger.log('checking for existing browser...');
        if (!activeBrowser) {
            const session = chrome_session_1.ChromeSession.getInstance();
            const wsUrl = session.getWsUrl() || (yield getDebuggerUrl(logger));
            let retries = 5;
            let lastError;
            while (retries > 0) {
                try {
                    logger.log(`connection attempt ${6 - retries}...`);
                    yield new Promise(resolve => setTimeout(resolve, 1000));
                    activeBrowser = yield puppeteer_core_1.default.connect({
                        browserWSEndpoint: wsUrl,
                        defaultViewport: null,
                    });
                    session.setActiveBrowser(activeBrowser);
                    logger.log('browser connected successfully');
                    yield new Promise(resolve => setTimeout(resolve, 1000));
                    let pages = yield activeBrowser.pages();
                    logger.log(`found ${pages.length} pages`);
                    // Find LinkedIn page or create new one without closing others
                    let linkedinPage = pages.find(page => {
                        const url = page.url();
                        return url.startsWith('https://www.linkedin.com') || url === 'about:blank';
                    });
                    if (linkedinPage) {
                        logger.log('found existing linkedin or blank page, reusing it');
                        activePage = linkedinPage;
                        // If it's a blank page, we don't need to do anything special
                        if (linkedinPage.url() === 'about:blank') {
                            logger.log('using blank page for linkedin');
                        }
                        yield activePage.bringToFront();
                        logger.log('brought linkedin page to front');
                    }
                    else {
                        logger.log('creating new tab for linkedin');
                        activePage = yield activeBrowser.newPage();
                        yield activePage.bringToFront();
                        logger.log('new tab created and brought to front');
                    }
                    session.setActivePage(activePage);
                    logger.log('browser setup complete');
                    break;
                }
                catch (error) {
                    lastError = error;
                    logger.error(`connection attempt ${6 - retries} failed: ${error}`);
                    retries--;
                    if (retries > 0) {
                        logger.log(`retrying in 2s... (${retries} attempts left)`);
                        yield new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }
            if (!activeBrowser) {
                logger.error(`all connection attempts failed: ${lastError}`);
                throw new Error(`failed to connect to browser after 5 attempts: ${lastError}`);
            }
        }
        else {
            logger.log('using existing browser connection');
        }
        if (!activeBrowser || !activePage) {
            logger.error('browser or page not properly initialized');
            throw new Error('browser or page not initialized');
        }
        return { browser: activeBrowser, page: activePage };
    });
}
// helper to return the active browser and page
function getActiveBrowser() {
    const session = chrome_session_1.ChromeSession.getInstance();
    return {
        browser: session.getActiveBrowser(),
        page: session.getActivePage()
    };
}
// used to disconnect puppeteer if desired
function quitBrowser() {
    return __awaiter(this, arguments, void 0, function* (logger = defaultLogger) {
        chrome_session_1.ChromeSession.getInstance().clear();
        if (activeBrowser) {
            try {
                yield activeBrowser.disconnect();
                logger.log('browser disconnected');
            }
            catch (error) {
                logger.error(`error disconnecting browser: ${error}`);
            }
            activeBrowser = null;
            activePage = null;
            logger.log('browser session cleared');
        }
    });
}
