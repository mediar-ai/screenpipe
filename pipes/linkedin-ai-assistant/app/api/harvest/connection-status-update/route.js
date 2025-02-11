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
const storage_1 = require("@/lib/storage/storage");
const browser_setup_1 = require("@/lib/browser-setup");
const chrome_session_1 = require("@/lib/chrome-session");
const click_cancel_connection_request_1 = require("@/lib/simple-actions/click-cancel-connection-request");
const check_if_restricted_1 = require("@/lib/simple-actions/check-if-restricted");
exports.dynamic = 'force-dynamic';
exports.fetchCache = 'force-no-store';
function checkConnectionStatus(page, profileUrl, connection) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const maxRetries = 3;
            const baseDelay = 60000; // base delay of 1 minute
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    // Add delay only after first attempt
                    if (attempt > 0 || (refreshProgress && refreshProgress.current > 1)) {
                        const nextDelay = Math.floor(Math.random() * 1000) + 20000;
                        yield new Promise(resolve => setTimeout(resolve, nextDelay));
                        if (yield (0, storage_1.getShouldStopRefresh)()) {
                            console.log('stop detected after delay, returning current status');
                            return connection.status;
                        }
                    }
                    // check if page is still valid
                    try {
                        yield page.evaluate(() => document.title);
                    }
                    catch (_a) {
                        // page is detached, get a new one
                        const browser = (0, browser_setup_1.getActiveBrowser)();
                        if (!browser.page)
                            throw new Error('failed to get new page');
                        page = browser.page;
                    }
                    // Navigate once at the start
                    yield page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
                    // Check for restriction after each navigation
                    const restrictionStatus = yield (0, check_if_restricted_1.checkIfRestricted)(page);
                    if (restrictionStatus.isRestricted) {
                        console.log('account restriction detected during status check:', restrictionStatus);
                        yield (0, storage_1.setShouldStopRefresh)(true);
                        if (restrictionStatus.restrictionEndDate) {
                            yield (0, storage_1.saveHarvestingState)('cooldown');
                            yield (0, storage_1.saveNextHarvestTime)(restrictionStatus.restrictionEndDate);
                            yield (0, storage_1.saveRestrictionInfo)({
                                isRestricted: true,
                                endDate: restrictionStatus.restrictionEndDate,
                                reason: 'linkedin has detected automated activity on your account'
                            });
                        }
                        else {
                            yield (0, storage_1.saveHarvestingState)('stopped');
                            yield (0, storage_1.saveRestrictionInfo)({
                                isRestricted: false
                            });
                        }
                        throw new Error(`account restricted until ${restrictionStatus.restrictionEndDate}`);
                    }
                    // check for rate limit error (429)
                    const is429 = yield page.evaluate(() => {
                        var _a;
                        return ((_a = document.body.textContent) === null || _a === void 0 ? void 0 : _a.includes('HTTP ERROR 429')) || false;
                    });
                    if (is429) {
                        const retryDelay = baseDelay + Math.floor(Math.random() * baseDelay);
                        console.log(`rate limited on ${profileUrl}, waiting ${retryDelay / 1000}s before retry ${attempt + 1}/${maxRetries}`);
                        yield new Promise(resolve => setTimeout(resolve, retryDelay));
                        continue;
                    }
                    // First check if we need to cancel old pending request
                    if (connection.status === 'pending' && connection.timestamp) {
                        const daysAsPending = (new Date().getTime() - new Date(connection.timestamp).getTime()) / (1000 * 60 * 60 * 24);
                        if (daysAsPending > 14) {
                            console.log(`connection request to ${profileUrl} has been pending for ${Math.floor(daysAsPending)} days, canceling...`);
                            const result = yield (0, click_cancel_connection_request_1.clickCancelConnectionRequest)(page);
                            if (result.success) {
                                return 'declined';
                            }
                        }
                    }
                    // Then check current connection status
                    yield page.waitForSelector('body', { timeout: 30000 });
                    const isAccepted = yield page.evaluate(() => {
                        var _a;
                        const distanceBadge = document.querySelector('.distance-badge');
                        return ((_a = distanceBadge === null || distanceBadge === void 0 ? void 0 : distanceBadge.textContent) === null || _a === void 0 ? void 0 : _a.trim().includes('1st')) || false;
                    });
                    return isAccepted ? 'accepted' : 'pending';
                }
                catch (error) {
                    console.error(`failed to check status for ${profileUrl} (attempt ${attempt + 1}/${maxRetries}):`, error);
                    if (error instanceof Error && error.message.includes('detached Frame')) {
                        const browser = (0, browser_setup_1.getActiveBrowser)();
                        if (!browser.page)
                            throw new Error('failed to get new page');
                        page = browser.page;
                    }
                    if (attempt === maxRetries - 1) {
                        return 'pending';
                    }
                    const retryDelay = baseDelay + Math.floor(Math.random() * baseDelay);
                    yield new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
            return 'pending';
        }
        catch (error) {
            console.error(`failed to check status for ${profileUrl}:`, error);
            return 'pending';
        }
    });
}
// Add progress tracking at module level
let refreshProgress = null;
// Add new endpoint to handle stop refresh
function POST() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('stop requested');
        yield (0, storage_1.setShouldStopRefresh)(true);
        return server_1.NextResponse.json({ message: 'refresh stop requested' });
    });
}
function GET(request) {
    return __awaiter(this, void 0, void 0, function* () {
        const nextDelay = 0;
        try {
            let connectionsStore = yield (0, storage_1.loadConnections)();
            const url = new URL(request.url);
            const shouldRefresh = url.searchParams.get('refresh') === 'true';
            // Only try to get browser page if we're actually refreshing connection statuses
            if (shouldRefresh) {
                yield (0, storage_1.setShouldStopRefresh)(false);
                // First check if we have an active page in the session
                let page = chrome_session_1.ChromeSession.getInstance().getActivePage();
                // If no page in session, try to set up browser
                if (!page) {
                    const { page: newPage } = yield (0, browser_setup_1.setupBrowser)();
                    page = newPage;
                }
                if (!page) {
                    console.warn('no active browser page, skipping connection status refresh');
                }
                else {
                    const startTime = Date.now();
                    // Get only pending connections for status check
                    const pendingConnections = Object.entries(connectionsStore.connections)
                        .filter(([, connection]) => connection.status === 'pending');
                    // Initialize progress at 0
                    refreshProgress = {
                        current: 0,
                        total: pendingConnections.length
                    };
                    // Check each pending connection
                    for (const [url, connection] of pendingConnections) {
                        if (yield (0, storage_1.getShouldStopRefresh)()) {
                            console.log('stop detected in main loop, exiting...');
                            refreshProgress = null;
                            return server_1.NextResponse.json({
                                harvestingStatus: 'stopped',
                                refreshProgress: null
                            });
                        }
                        const newStatus = yield checkConnectionStatus(page, url, connection);
                        if (newStatus !== connection.status) {
                            yield (0, storage_1.saveConnection)(Object.assign(Object.assign({}, connection), { status: newStatus, timestamp: new Date().toISOString() }));
                        }
                        refreshProgress.current++;
                    }
                    const totalDuration = Date.now() - startTime;
                    yield (0, storage_1.saveRefreshStats)(totalDuration, pendingConnections.length);
                    // Reload after updates
                    connectionsStore = yield (0, storage_1.loadConnections)();
                }
            }
            return server_1.NextResponse.json({
                harvestingStatus: connectionsStore.harvestingStatus,
                nextHarvestTime: connectionsStore.nextHarvestTime,
                connectionsSent: connectionsStore.connectionsSent || 0,
                dailyLimitReached: (connectionsStore.connectionsSent || 0) >= 35,
                weeklyLimitReached: false,
                refreshProgress,
                refreshError: null,
                rateLimitedUntil: null,
                nextProfileTime: nextDelay ? Date.now() + nextDelay : null,
                restrictionInfo: connectionsStore.restrictionInfo || null
            });
        }
        catch (error) {
            console.error('status check failed:', error);
            return server_1.NextResponse.json({
                harvestingStatus: 'stopped',
                error: error.message
            }, { status: 200 });
        }
    });
}
