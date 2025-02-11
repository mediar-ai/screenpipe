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
exports.startCheckingAcceptedConnections = startCheckingAcceptedConnections;
const browser_setup_1 = require("../browser-setup");
const state_1 = require("../../app/api/workflow/status/state");
const storage_1 = require("../storage/storage");
const extract_profile_details_from_page_1 = require("../simple-actions/extract-profile-details-from-page");
const extract_profiles_from_search_results_1 = require("../simple-actions/extract-profiles-from-search-results");
const withdraw_connections_1 = require("./withdraw-connections");
const port = process.env.PORT;
const BASE_URL = `http://127.0.0.1:${port}`;
let isCurrentlyChecking = false;
function startCheckingAcceptedConnections() {
    return __awaiter(this, void 0, void 0, function* () {
        if (isCurrentlyChecking) {
            console.log('check accepted connections process already in progress');
            return;
        }
        isCurrentlyChecking = true;
        console.log('starting check accepted connections process');
        try {
            // Browser setup
            (0, state_1.updateWorkflowStep)('browser', 'running', 'connecting to chrome');
            const statusResponse = yield fetch(`${BASE_URL}/api/chrome/status`);
            const statusData = yield statusResponse.json();
            if (statusData.status !== 'connected' || !statusData.wsUrl) {
                throw new Error('chrome not connected');
            }
            const { page } = yield (0, browser_setup_1.setupBrowser)();
            (0, state_1.updateWorkflowStep)('browser', 'done', 'browser connected');
            // Load all connections and filter for those pending > 14 days
            const connectionsStore = yield (0, storage_1.loadConnections)();
            const twoWeeksAgo = new Date();
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
            const pendingConnections = Object.values(connectionsStore.connections)
                .filter(conn => {
                if (conn.status !== 'pending')
                    return false;
                const connectionDate = new Date(conn.timestamp);
                return connectionDate < twoWeeksAgo;
            });
            console.log(`found ${pendingConnections.length} pending connections older than 14 days to check`);
            for (const connection of pendingConnections) {
                if (withdraw_connections_1.shouldStop) {
                    console.log('check accepted connections stopped by user');
                    return;
                }
                try {
                    console.log(`navigating to profile: ${connection.profileUrl}`);
                    yield page.goto(connection.profileUrl, {
                        waitUntil: 'domcontentloaded',
                        timeout: 15000
                    });
                    // Check for 404 page
                    const is404 = yield Promise.race([
                        page.$eval('.not-found__header', () => true).catch(() => false),
                        page.$eval('[data-test-not-found-error-container]', () => true).catch(() => false)
                    ]);
                    if (is404) {
                        console.log(`profile not found (404) for ${connection.profileUrl}`);
                        yield (0, storage_1.saveConnection)(Object.assign(Object.assign({}, connection), { status: 'invalid', timestamp: new Date().toISOString() }));
                        continue;
                    }
                    console.log('waiting for profile content to load...');
                    // Wait for either connect button or pending/message buttons to appear
                    const selectors = [
                        'button.artdeco-button--connect',
                        'button[aria-label*="Pending"]',
                        'button[aria-label*="Message"]'
                    ];
                    const button = yield Promise.race([
                        ...selectors.map(selector => page.waitForSelector(selector, { timeout: 45000 })
                            .catch(() => null))
                    ]);
                    console.log('button detection result:', !!button);
                    // Check connection status
                    const pendingButton = yield page.$('button[aria-label*="Pending"]');
                    const messageButton = yield page.$('button[aria-label*="Message"]');
                    const connectButton = yield page.$('button.artdeco-button--connect');
                    console.log('found buttons:', {
                        pending: !!pendingButton,
                        message: !!messageButton,
                        connect: !!connectButton
                    });
                    // If we have a message button or pending button but no connect button, they're connected
                    const isConnected = messageButton && !connectButton;
                    if (isConnected) {
                        console.log(`connection accepted for ${connection.profileUrl}`);
                        // Extract and save profile details
                        const profileDetails = yield (0, extract_profile_details_from_page_1.extractProfileText)(page);
                        const cleanUrl = (0, extract_profiles_from_search_results_1.cleanProfileUrl)(connection.profileUrl);
                        console.log('extracted profile details:', JSON.stringify(profileDetails).slice(0, 100) + '...');
                        yield (0, storage_1.saveProfile)(cleanUrl, profileDetails);
                        // Update connection status
                        yield (0, storage_1.saveConnection)(Object.assign(Object.assign({}, connection), { status: 'accepted', timestamp: new Date().toISOString() }));
                    }
                    else if (pendingButton) {
                        console.log(`connection still pending for ${connection.profileUrl}`);
                    }
                    else {
                        console.log(`unclear connection status for ${connection.profileUrl}`);
                    }
                    // Check for any potential blocks or captchas
                    const possibleCaptcha = yield page.$('iframe[title*="recaptcha"]');
                    if (possibleCaptcha) {
                        console.error('detected possible captcha, may need manual intervention');
                        throw new Error('captcha detected');
                    }
                    // Random delay between profile checks
                    const delay = 2000 + Math.random() * 3000;
                    console.log(`waiting ${Math.round(delay)}ms before next profile...`);
                    yield new Promise(resolve => setTimeout(resolve, delay));
                }
                catch (error) {
                    console.error(`error checking connection ${connection.profileUrl}:`, error);
                    // Take screenshot on error for debugging
                    try {
                        yield page.screenshot({
                            path: `error-${Date.now()}.png`,
                            fullPage: true
                        });
                        console.log('saved error screenshot');
                    }
                    catch (e) {
                        console.error('failed to save error screenshot:', e);
                    }
                    continue;
                }
            }
            console.log('completed checking all pending connections');
        }
        catch (error) {
            console.error('check accepted connections process failed:', error);
            throw error;
        }
        finally {
            isCurrentlyChecking = false;
        }
    });
}
