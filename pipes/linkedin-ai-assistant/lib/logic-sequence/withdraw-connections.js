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
exports.shouldStop = void 0;
exports.setShouldStop = setShouldStop;
exports.startWithdrawing = startWithdrawing;
const browser_setup_1 = require("../browser-setup");
const state_1 = require("../../app/api/workflow/status/state");
const click_animation_1 = require("../simple-actions/click-animation");
const storage_1 = require("../storage/storage");
const check_accepted_connections_1 = require("./check-accepted-connections");
const check_recently_added_connections_1 = require("./check-recently-added-connections");
const port = process.env.PORT;
const BASE_URL = `http://127.0.0.1:${port}`;
let isCurrentlyWithdrawing = false;
exports.shouldStop = false;
function setShouldStop(value) {
    exports.shouldStop = value;
}
function startWithdrawing() {
    return __awaiter(this, void 0, void 0, function* () {
        if (isCurrentlyWithdrawing) {
            console.log('withdraw process already in progress');
            return;
        }
        isCurrentlyWithdrawing = true;
        yield (0, storage_1.setWithdrawingStatus)(true);
        console.log('starting withdraw process');
        try {
            // Reset the flag at start
            yield (0, storage_1.setWithdrawingStatus)(true);
            // Check if we should stop frequently during the process
            if (exports.shouldStop) {
                console.log('withdraw process stopped by user');
                yield (0, storage_1.setWithdrawingStatus)(false, {
                    reason: 'stopped by user',
                    timestamp: new Date().toISOString()
                });
                return;
            }
            // First check recently added connections
            console.log('checking recently added connections first');
            if (exports.shouldStop)
                return;
            yield (0, check_recently_added_connections_1.startCheckingRecentlyAddedConnections)();
            // Browser setup
            (0, state_1.updateWorkflowStep)('browser', 'running', 'connecting to chrome');
            const statusResponse = yield fetch(`${BASE_URL}/api/chrome/status`);
            const statusData = yield statusResponse.json();
            if (statusData.status !== 'connected' || !statusData.wsUrl) {
                throw new Error('chrome not connected');
            }
            const { page } = yield (0, browser_setup_1.setupBrowser)();
            (0, state_1.updateWorkflowStep)('browser', 'done', 'browser connected');
            // Navigate to sent invitations page
            (0, state_1.updateWorkflowStep)('navigation', 'running', 'navigating to sent invitations');
            yield navigateToSentInvitations(page);
            while (true) {
                if (exports.shouldStop) {
                    console.log('withdraw process stopped by user during main loop');
                    yield (0, storage_1.setWithdrawingStatus)(false, {
                        reason: 'stopped by user',
                        timestamp: new Date().toISOString()
                    });
                    return;
                }
                const foundProfilesToWithdraw = yield withdrawOldInvitations(page);
                if (!foundProfilesToWithdraw) {
                    const hasNextPage = yield goToNextPage(page);
                    if (!hasNextPage) {
                        console.log('goToNextPagefunction stopped');
                        break;
                    }
                }
            }
        }
        catch (error) {
            console.error('withdraw process failed:', error);
            yield (0, storage_1.setWithdrawingStatus)(false, {
                reason: `withdraw process failed: ${error}`,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
        finally {
            isCurrentlyWithdrawing = false;
        }
    });
}
function navigateToSentInvitations(page) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('navigating to sent invitations page');
        yield page.goto('https://www.linkedin.com/mynetwork/invitation-manager/sent/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });
    });
}
function randomDelay() {
    return __awaiter(this, arguments, void 0, function* (baseMs = 1000, variationMs = 500) {
        const delay = baseMs + Math.random() * variationMs;
        //   console.log(`waiting for ${Math.round(delay)}ms`);
        yield new Promise(resolve => setTimeout(resolve, delay));
    });
}
function withdrawOldInvitations(page) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('checking for old invitations');
        // Wait for cards to be present after any page update
        yield page.waitForSelector('.invitation-card__container', { timeout: 10000 });
        yield randomDelay(); // Add small delay after content load
        // Re-query cards after ensuring page is loaded
        const cards = yield page.$$('.invitation-card__container');
        let foundOldInvitation = false;
        for (const card of cards) {
            if (exports.shouldStop) {
                console.log('withdraw process stopped by user during card processing');
                return false;
            }
            try {
                // Re-query elements within each card to ensure fresh references
                const profileLink = yield card.$('a[href*="/in/"]');
                const profileUrl = yield (profileLink === null || profileLink === void 0 ? void 0 : profileLink.evaluate(el => el.getAttribute('href')));
                if (!profileUrl) {
                    console.log('no profile url found, skipping');
                    continue;
                }
                const timeBadge = yield card.$('.time-badge');
                const timeText = yield (timeBadge === null || timeBadge === void 0 ? void 0 : timeBadge.evaluate(el => { var _a; return (_a = el.textContent) === null || _a === void 0 ? void 0 : _a.trim(); }));
                if (!timeText)
                    continue;
                const isOldEnough = timeText.includes('month') ||
                    (timeText.toLowerCase().includes('sent') &&
                        timeText.includes('week') &&
                        parseInt(((_a = timeText.match(/\d+/)) === null || _a === void 0 ? void 0 : _a[0]) || '0') >= 2);
                if (isOldEnough) {
                    console.log(`found old invitation to withdraw - age: ${timeText}`);
                    foundOldInvitation = true;
                    // Re-query the withdraw button
                    const withdrawBtn = yield card.$('button[aria-label^="Withdraw invitation"]');
                    if (!withdrawBtn) {
                        console.log('withdraw button not found, skipping');
                        continue;
                    }
                    yield (0, click_animation_1.showClickAnimation)(page, withdrawBtn);
                    yield withdrawBtn.click();
                    yield randomDelay();
                    console.log('clicked withdraw button');
                    // Wait for and handle confirmation modal
                    const confirmBtn = yield page.waitForSelector('button.artdeco-modal__confirm-dialog-btn[data-test-dialog-primary-btn]', {
                        timeout: 5000
                    });
                    if (confirmBtn) {
                        yield (0, click_animation_1.showClickAnimation)(page, confirmBtn);
                        yield confirmBtn.click();
                        yield randomDelay();
                        console.log('confirmed withdrawal');
                        yield (0, storage_1.saveConnection)({
                            status: 'declined',
                            timestamp: new Date().toISOString(),
                            profileUrl
                        });
                        console.log(`updated status to declined for ${profileUrl}`);
                        yield randomDelay(2000); // Longer delay after confirmation
                    }
                }
            }
            catch (error) {
                console.error('error processing invitation card:', error);
                continue;
            }
        }
        return foundOldInvitation;
    });
}
function goToNextPage(page) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('checking for next page');
            const nextButton = yield page.$('button.artdeco-pagination__button--next:not([disabled])');
            if (!nextButton) {
                console.log('no next page available - reached last page');
                yield (0, storage_1.setWithdrawingStatus)(false, {
                    reason: 'completed: reached last page of invitations',
                    timestamp: new Date().toISOString()
                });
                // Start checking accepted connections after withdrawal completes
                console.log('starting accepted connections check flow');
                yield (0, check_accepted_connections_1.startCheckingAcceptedConnections)();
                return false;
            }
            const currentUrl = page.url();
            yield (0, click_animation_1.showClickAnimation)(page, nextButton);
            yield nextButton.click();
            console.log('navigating to next page');
            // Wait for URL to change
            yield page.waitForFunction((oldUrl) => window.location.href !== oldUrl, { timeout: 15000 }, currentUrl);
            // Check if we got redirected to the base page (LinkedIn's protection mechanism)
            const newUrl = page.url();
            if (newUrl.includes('invitationType=CONNECTION')) {
                console.log('detected linkedin protection redirect');
                yield (0, storage_1.setWithdrawingStatus)(false, {
                    reason: 'paused: linkedin daily withdrawal limit reached',
                    timestamp: new Date().toISOString()
                });
                return false;
            }
            // Wait for content
            yield page.waitForSelector('.invitation-card__container', {
                timeout: 10000
            });
            console.log('successfully navigated to next page:', newUrl);
            return true;
        }
        catch (error) {
            console.error('error during page navigation:', error);
            yield (0, storage_1.setWithdrawingStatus)(false, {
                reason: `error: page navigation failed - ${error}`,
                timestamp: new Date().toISOString()
            });
            return false;
        }
    });
}
