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
exports.runtime = void 0;
exports.POST = POST;
exports.DELETE = DELETE;
const server_1 = require("next/server");
const child_process_1 = require("child_process");
const util_1 = require("util");
const browser_setup_1 = require("@/lib/browser-setup");
const os_1 = __importDefault(require("os"));
const chrome_session_1 = require("@/lib/chrome-session");
const route_logger_1 = require("@/lib/route-logger");
// import { pipe } from "@screenpipe/js";
const logger = new route_logger_1.RouteLogger('chrome-route');
exports.runtime = 'nodejs'; // specify node runtime
const execPromise = (0, util_1.promisify)(child_process_1.exec);
// helper to get chrome path based on platform
function getChromePath() {
    switch (os_1.default.platform()) {
        case "darwin": {
            const isArm = os_1.default.arch() === 'arm64';
            logger.log(`mac architecture: ${os_1.default.arch()}`);
            return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
        }
        case "linux":
            return "/usr/bin/google-chrome";
        case "win32":
            return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
        default:
            throw new Error("unsupported platform");
    }
}
function getScreenDimensions(requestDims) {
    const defaultDims = { width: 2560, height: 1440 };
    if (requestDims) {
        logger.log(`using client screen dimensions: ${requestDims.width}x${requestDims.height}`);
        return requestDims;
    }
    logger.log(`no dimensions provided, using defaults: ${defaultDims.width}x${defaultDims.height}`);
    return defaultDims;
}
function POST(request) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            logger.log('starting POST request');
            // Get dimensions from request first
            const body = yield request.json();
            const screenDims = getScreenDimensions(body.screenDims);
            const additionalFlags = [
                '--remote-debugging-port=9222',
                '--restore-last-session',
                '--no-first-run',
                '--no-default-browser-check',
                `--window-position=${screenDims.width / 2},0`,
                `--window-size=${screenDims.width / 2},${screenDims.height}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-background-networking',
                '--disable-features=TranslateUI',
                '--disable-features=IsolateOrigins',
                '--disable-site-isolation-trials',
            ].flat();
            // Log environment info
            logger.log(`environment: ${process.env.NODE_ENV}`);
            logger.log(`current platform: ${os_1.default.platform()}`);
            logger.log(`system architecture: ${os_1.default.arch()}`);
            logger.log(`cpu info: ${JSON.stringify(os_1.default.cpus()[0], null, 2)}`);
            logger.log("checking for existing chrome instance...");
            let wsUrl = null;
            try {
                const response = yield fetch('http://127.0.0.1:9222/json/version');
                if (response.ok) {
                    const data = yield response.json();
                    wsUrl = data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');
                    logger.log(`found existing chrome instance at ${wsUrl}`);
                }
                else {
                    logger.log('no existing chrome instance found, launching a new one');
                }
            }
            catch (error) {
                logger.error(`error checking for existing chrome instance: ${error}`);
                logger.log('launching a new chrome instance');
            }
            if (!wsUrl) {
                logger.log("attempting to launch chrome");
                logger.log("killing existing chrome instances...");
                yield quitChrome(); // only kill if we are about to launch a new one
                yield (0, browser_setup_1.quitBrowser)(logger);
                const chromePath = getChromePath();
                logger.log(`using chrome path: ${chromePath}`);
                logger.log(`checking if chrome exists: ${require('fs').existsSync(chromePath)}`);
                logger.log("spawning chrome with debugging port 9222...");
                const isArmMac = os_1.default.platform() === 'darwin' && os_1.default.arch() === 'arm64';
                const spawnCommand = isArmMac ? 'arch' : chromePath;
                const spawnArgs = isArmMac ? [
                    '-arm64',
                    chromePath,
                    ...additionalFlags
                ] : [
                    ...additionalFlags
                ];
                const chromeProcess = (0, child_process_1.spawn)(spawnCommand, spawnArgs, {
                    detached: true,
                    stdio: 'ignore'
                });
                chromeProcess.unref();
                logger.log("chrome process spawned and detached");
                logger.log("waiting for chrome to initialize...");
                yield new Promise(resolve => setTimeout(resolve, 3000));
                let attempts = 0;
                const maxAttempts = 5;
                logger.log(`attempting to connect to debug port (max ${maxAttempts} attempts)`);
                while (attempts < maxAttempts) {
                    try {
                        logger.log(`connection attempt ${attempts + 1}/${maxAttempts}`);
                        const response = yield fetch('http://127.0.0.1:9222/json/version');
                        const data = yield response.json();
                        if (response.ok && data.webSocketDebuggerUrl) {
                            logger.log('chrome debug port responding');
                            wsUrl = data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');
                            logger.log(`websocket url: ${wsUrl}`);
                            if (wsUrl) {
                                chrome_session_1.ChromeSession.getInstance().setWsUrl(wsUrl);
                            }
                            break; // exit retry loop on success
                        }
                    }
                    catch (err) {
                        logger.error(`attempt ${attempts + 1} failed: ${err}`);
                    }
                    attempts++;
                    logger.log(`waiting 1s before retry ${attempts}/${maxAttempts}`);
                    yield new Promise(resolve => setTimeout(resolve, 1000));
                }
                if (!wsUrl) {
                    throw new Error('failed to connect to chrome debug port after all attempts');
                }
            }
            return server_1.NextResponse.json({
                success: true,
                wsUrl,
                logs: logger.getLogs()
            });
        }
        catch (err) {
            logger.error(`chrome launch failed with error: ${err}`);
            return server_1.NextResponse.json({
                success: false,
                error: String(err),
                logs: logger.getLogs()
            }, { status: 500 });
        }
    });
}
function DELETE() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            logger.log('starting DELETE request');
            yield quitChrome();
            yield (0, browser_setup_1.quitBrowser)(logger);
            logger.log('chrome processes terminated');
            chrome_session_1.ChromeSession.getInstance().clear();
            logger.log('chrome session cleared');
            return server_1.NextResponse.json({ success: true, logs: logger.getLogs() });
        }
        catch (error) {
            logger.error(`failed to kill chrome: ${error}`);
            return server_1.NextResponse.json({ success: false, error: String(error), logs: logger.getLogs() }, { status: 500 });
        }
    });
}
function quitChrome() {
    return __awaiter(this, void 0, void 0, function* () {
        const platform = os_1.default.platform();
        logger.log(`quitting chrome on platform: ${platform}`);
        const killCommand = platform === "win32"
            ? `taskkill /F /IM chrome.exe`
            : `pkill -f -- "Google Chrome"`;
        try {
            logger.log('executing kill command:', killCommand);
            yield execPromise(killCommand);
            logger.log("chrome killed successfully");
        }
        catch (error) {
            logger.log("no chrome process found to kill", error);
        }
    });
}
