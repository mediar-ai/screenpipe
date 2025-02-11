"use strict";
/* eslint-disable @typescript-eslint/no-unused-vars */
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
exports.stopHarvesting = stopHarvesting;
exports.emitProgress = emitProgress;
exports.isHarvesting = isHarvesting;
exports.startHarvesting = startHarvesting;
exports.navigateToSearch = navigateToSearch;
exports.getHarvestingStatus = getHarvestingStatus;
const storage_1 = require("../storage/storage");
const browser_setup_1 = require("../browser-setup");
const state_1 = require("../../app/api/workflow/status/state");
const close_dialogues_1 = require("../simple-actions/close-dialogues");
const extract_profiles_from_search_results_1 = require("../simple-actions/extract-profiles-from-search-results");
const click_animation_1 = require("../simple-actions/click-animation");
const check_if_restricted_1 = require("../simple-actions/check-if-restricted");
const port = process.env.PORT;
const BASE_URL = `http://127.0.0.1:${port}`;
// Variables to track the harvesting status
// let stopRequested = false;
// Set to track profiles we've already attempted to connect with
const attemptedProfiles = new Set();
const emailVerificationProfiles = new Set();
const cooldownProfiles = new Set();
// Add state management to track active harvesting
let isCurrentlyHarvesting = false;
function stopHarvesting() {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, storage_1.setStopRequested)(true);
        isCurrentlyHarvesting = false;
        // Ensure we clean up state
        attemptedProfiles.clear();
        emailVerificationProfiles.clear();
        cooldownProfiles.clear();
    });
}
function emitProgress(connectionsSent) {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, storage_1.updateConnectionsSent)(connectionsSent);
    });
}
function isHarvesting() {
    return __awaiter(this, void 0, void 0, function* () {
        const store = yield (0, storage_1.loadConnections)();
        return store.harvestingStatus !== 'stopped';
    });
}
function startHarvesting() {
    return __awaiter(this, arguments, void 0, function* (maxDailyConnections = 35) {
        const processId = crypto.randomUUID(); // Unique ID for this run
        // Set up heartbeat interval
        const heartbeatInterval = setInterval(() => {
            (0, storage_1.updateHeartbeat)(processId).catch(console.error);
        }, 10000); // Update every 10 seconds
        try {
            // Reset stop flag at start
            yield (0, storage_1.setStopRequested)(false);
            // Prevent multiple harvesting processes
            if (isCurrentlyHarvesting) {
                console.log('harvest already in progress, checking browser state...');
                // Add validation of browser state
                const { browser, page } = (0, browser_setup_1.getActiveBrowser)();
                if (!browser || !page || page.isClosed()) {
                    console.log('browser connection lost, resetting state');
                    yield (0, storage_1.saveHarvestingState)('stopped');
                    isCurrentlyHarvesting = false;
                    // Continue to start new harvest
                }
                else {
                    const connections = yield (0, storage_1.loadConnections)();
                    return {
                        connectionsSent: connections.connectionsSent || 0,
                        weeklyLimitReached: false,
                        dailyLimitReached: false,
                        harvestingStatus: 'running'
                    };
                }
            }
            // Set flag before any async operations
            isCurrentlyHarvesting = true;
            console.log('starting new harvest process');
            try {
                const store = yield (0, storage_1.loadConnections)();
                // Check cooldown period first
                if (store.nextHarvestTime && new Date(store.nextHarvestTime) > new Date()) {
                    console.log('in cooldown period, cannot start');
                    yield (0, storage_1.saveHarvestingState)('cooldown', 'waiting for cooldown period to end');
                    return {
                        connectionsSent: store.connectionsSent || 0,
                        weeklyLimitReached: false,
                        dailyLimitReached: true,
                        nextHarvestTime: store.nextHarvestTime,
                        harvestingStatus: 'cooldown',
                        statusMessage: 'waiting for cooldown period to end'
                    };
                }
                // Initialize counters
                let connectionsSent = 0;
                let weeklyLimitReached = false;
                const dailyLimitReached = false;
                // Rest of harvesting logic...
                // Set harvesting state to running immediately
                yield (0, storage_1.saveHarvestingState)('running');
                yield (0, storage_1.updateConnectionsSent)(0);
                try {
                    // Reset the stop request flag
                    yield (0, storage_1.setStopRequested)(false);
                    const connections = yield (0, storage_1.loadConnections)();
                    // Check cooldown period
                    if (connections.nextHarvestTime) {
                        const nextTime = new Date(connections.nextHarvestTime);
                        if (nextTime > new Date()) {
                            return {
                                connectionsSent: 0,
                                weeklyLimitReached,
                                dailyLimitReached,
                                nextHarvestTime: connections.nextHarvestTime,
                                harvestingStatus: 'cooldown'
                            };
                        }
                    }
                    console.log('starting farming process with max daily connections:', maxDailyConnections);
                    yield (0, storage_1.saveNextHarvestTime)('');
                    // Load existing connections
                    (0, state_1.updateWorkflowStep)('setup', 'done', 'connections loaded');
                    // Browser setup
                    (0, state_1.updateWorkflowStep)('browser', 'running', 'connecting to chrome');
                    const statusResponse = yield fetch(`${BASE_URL}/api/chrome/status`);
                    const statusData = yield statusResponse.json();
                    if (statusData.status !== 'connected' || !statusData.wsUrl) {
                        throw new Error('chrome not connected');
                    }
                    const { page } = yield (0, browser_setup_1.setupBrowser)();
                    (0, state_1.updateWorkflowStep)('browser', 'done', 'browser connected');
                    // Navigate to LinkedIn search results
                    (0, state_1.updateWorkflowStep)('navigation', 'running', 'navigating to linkedin search');
                    const searchUrl = 'https://www.linkedin.com/search/results/people/?network=%5B%22S%22%5D';
                    yield navigateToSearch(page, searchUrl, { allowTruncate: true });
                    // Close any open message dialogues before starting
                    (0, state_1.updateWorkflowStep)('navigation', 'running', 'closing message dialogues');
                    yield (0, close_dialogues_1.closeAllMessageDialogues)(page);
                    // Wait for the search results to load
                    console.log('waiting for search results container...');
                    try {
                        yield page.waitForSelector([
                            'div[data-view-name="search-entity-result-universal-template"]',
                            'ul.reusable-search__entity-result-list',
                        ].join(','), {
                            visible: true,
                            timeout: 15000,
                        });
                        console.log('search results loaded successfully');
                    }
                    catch (error) {
                        console.error('failed to find search results:', error);
                        throw new Error('no search results found on page');
                    }
                    console.log('search results loaded');
                    (0, state_1.updateWorkflowStep)('navigation', 'done');
                    // Add stop handler
                    if (yield (0, storage_1.isStopRequested)()) {
                        const store = yield (0, storage_1.loadConnections)(); // Get current store to preserve message
                        yield (0, storage_1.saveHarvestingState)('stopped', store.statusMessage); // Keep existing message
                        return {
                            connectionsSent,
                            weeklyLimitReached,
                            dailyLimitReached: false,
                            stopped: true,
                            harvestingStatus: 'stopped',
                            statusMessage: store.statusMessage // Include message in return
                        };
                    }
                    while (connectionsSent < maxDailyConnections &&
                        !weeklyLimitReached &&
                        !(yield (0, storage_1.isStopRequested)())) {
                        // Check if stop was requested
                        if (yield (0, storage_1.isStopRequested)()) {
                            console.log('harvest process stopped by user');
                            const store = yield (0, storage_1.loadConnections)(); // Get current store to preserve message
                            yield (0, storage_1.saveHarvestingState)('stopped', store.statusMessage); // Keep existing message
                            return {
                                connectionsSent,
                                weeklyLimitReached,
                                dailyLimitReached: false,
                                stopped: true,
                                harvestingStatus: 'stopped',
                                statusMessage: store.statusMessage // Include message in return
                            };
                        }
                        (0, state_1.updateWorkflowStep)('processing', 'running', `processing connections`);
                        try {
                            const result = yield clickNextConnectButton(page, yield (0, storage_1.isStopRequested)());
                            if (yield (0, storage_1.isStopRequested)()) {
                                break;
                            }
                            if (result.success) {
                                connectionsSent++;
                                yield (0, storage_1.updateConnectionsSent)(connectionsSent);
                                const cleanUrl = result.profileUrl
                                    ? (0, extract_profiles_from_search_results_1.cleanProfileUrl)(result.profileUrl)
                                    : '';
                                console.log(`Connection sent to ${cleanUrl}, total: ${connectionsSent}`);
                                yield (0, storage_1.saveConnection)({
                                    profileUrl: cleanUrl,
                                    status: 'pending',
                                    timestamp: new Date().toISOString(),
                                });
                                // Update connectionsSent in the store
                                yield (0, storage_1.updateConnectionsSent)(connectionsSent);
                                // Add random delay between connections
                                const delay = 3000 + Math.floor(Math.random() * 1000);
                                yield new Promise((resolve) => setTimeout(resolve, delay));
                                continue; // Continue the loop instead of returning
                            }
                            else if (result.weeklyLimitReached) {
                                console.log('Weekly limit reached, stopping');
                                weeklyLimitReached = true;
                                break;
                            }
                            else if (result.cooldown) {
                                console.log('profile in cooldown period:', result.profileUrl);
                                // Try next button on the page instead of continuing
                                continue;
                            }
                            else if (result.emailRequired && result.profileUrl) {
                                console.log('email verification required for profile:', result.profileUrl);
                                yield (0, storage_1.saveConnection)({
                                    profileUrl: result.profileUrl,
                                    status: 'email_required',
                                    timestamp: new Date().toISOString(),
                                });
                                // Continue to next profile without incrementing connectionsSent
                                continue;
                            }
                            else {
                                // No valid connect buttons found, attempt to go to next page
                                const hasNextPage = yield goToNextPage(page, yield (0, storage_1.isStopRequested)());
                                if ((yield (0, storage_1.isStopRequested)()) || !hasNextPage) {
                                    console.log('no more pages available or stopped, ending harvest');
                                    break;
                                }
                                // Small delay after page navigation
                                yield new Promise((resolve) => setTimeout(resolve, 2000));
                                if (yield (0, storage_1.isStopRequested)()) {
                                    break;
                                }
                            }
                            // Add small delay between attempts
                            yield new Promise((resolve) => setTimeout(resolve, 1000));
                            if (yield (0, storage_1.isStopRequested)()) {
                                break;
                            }
                        }
                        catch (error) {
                            console.error('error processing connection:', error);
                            continue;
                        }
                    }
                    console.log(`Finished sending ${connectionsSent} connections`);
                }
                catch (error) {
                    yield (0, storage_1.saveHarvestingState)('stopped');
                    console.error('harvesting failed:', error);
                    throw error;
                }
                if (yield (0, storage_1.isStopRequested)()) {
                    const store = yield (0, storage_1.loadConnections)(); // Get current store to preserve message
                    yield (0, storage_1.saveHarvestingState)('stopped', store.statusMessage); // Keep existing message
                    return {
                        connectionsSent,
                        weeklyLimitReached: false,
                        dailyLimitReached: false,
                        stopped: true,
                        harvestingStatus: 'stopped',
                        statusMessage: store.statusMessage // Include message in return
                    };
                }
                if (weeklyLimitReached) {
                    // Weekly limit reached, set next time and keep harvesting state
                    const nextTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                    yield (0, storage_1.saveNextHarvestTime)(nextTime);
                    return {
                        connectionsSent,
                        weeklyLimitReached: true,
                        dailyLimitReached: false,
                        nextHarvestTime: nextTime,
                        harvestingStatus: 'running'
                    };
                }
                if (connectionsSent >= maxDailyConnections) {
                    // Daily limit reached, set next time but keep harvesting true
                    const nextTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                    yield (0, storage_1.saveNextHarvestTime)(nextTime);
                    yield (0, storage_1.saveHarvestingState)('cooldown');
                    return {
                        connectionsSent,
                        weeklyLimitReached: false,
                        dailyLimitReached: true,
                        nextHarvestTime: nextTime,
                        harvestingStatus: 'cooldown'
                    };
                }
                return {
                    connectionsSent,
                    weeklyLimitReached: false,
                    dailyLimitReached: false,
                    harvestingStatus: 'running'
                };
            }
            finally {
                isCurrentlyHarvesting = false;
            }
        }
        finally {
            clearInterval(heartbeatInterval);
        }
    });
}
// Update the function signature
function clickNextConnectButton(page, stopRequested) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Simple check if page is still valid
            if (page.isClosed()) {
                console.log('page is closed, cannot proceed');
                return { success: false };
            }
            const { connections } = yield (0, storage_1.loadConnections)();
            const connectButtonSelector = 'button[aria-label^="Invite"][aria-label$="to connect"]';
            // Use evaluateHandle for more stable element selection
            const connectButtons = yield page.$$(connectButtonSelector);
            console.log(`found ${connectButtons.length} connect buttons`);
            // Log page structure
            yield page.evaluate(() => {
                const searchResults = document.querySelector('.reusable-search__entity-result-list');
                console.log('search results html:', searchResults === null || searchResults === void 0 ? void 0 : searchResults.outerHTML);
                // Log all connect buttons found
                const buttons = document.querySelectorAll('button[aria-label*="Invite"][aria-label*="connect"]');
                console.log('all connect buttons found:', Array.from(buttons).map(b => {
                    var _a, _b, _c, _d;
                    return ({
                        ariaLabel: b.getAttribute('aria-label'),
                        text: (_a = b.textContent) === null || _a === void 0 ? void 0 : _a.trim(),
                        html: b.outerHTML,
                        // Log parent structure
                        parentStructure: {
                            immediate: (_b = b.parentElement) === null || _b === void 0 ? void 0 : _b.className,
                            entityResult: (_c = b.closest('.entity-result__item')) === null || _c === void 0 ? void 0 : _c.className,
                            linkedArea: (_d = b.closest('.linked-area')) === null || _d === void 0 ? void 0 : _d.className,
                            // Get all parent classes up to 3 levels
                            parents: Array.from({ length: 3 }).map((_, i) => {
                                let parent = b;
                                for (let j = 0; j <= i; j++) {
                                    parent = parent.parentElement;
                                }
                                return parent === null || parent === void 0 ? void 0 : parent.className;
                            })
                        }
                    });
                }));
                // Log all profile links in the page
                const profileLinks = document.querySelectorAll('a[href*="/in/"]');
                console.log('all profile links found:', Array.from(profileLinks).map(a => {
                    var _a, _b, _c;
                    return ({
                        href: a.getAttribute('href'),
                        text: (_a = a.textContent) === null || _a === void 0 ? void 0 : _a.trim(),
                        parentClass: (_b = a.parentElement) === null || _b === void 0 ? void 0 : _b.className,
                        closestEntityResult: (_c = a.closest('.entity-result__item')) === null || _c === void 0 ? void 0 : _c.className
                    });
                }));
            });
            for (const connectButton of connectButtons) {
                if (stopRequested) {
                    return { success: false };
                }
                const profileUrl = yield page.evaluate((button) => {
                    var _a;
                    let current = button;
                    let container = null;
                    for (let i = 0; i < 5 && current.parentElement; i++) {
                        current = current.parentElement;
                        if (current.querySelector('a[href*="/in/"]')) {
                            container = current;
                            break;
                        }
                    }
                    if (!container) {
                        console.log('no container with profile link found');
                        return null;
                    }
                    const profileLinks = container.querySelectorAll('a[href*="/in/"]');
                    return ((_a = profileLinks[0]) === null || _a === void 0 ? void 0 : _a.getAttribute('href')) || null;
                }, connectButton);
                if (!profileUrl) {
                    console.log('profile url extraction failed:', {
                        buttonExists: !!connectButton,
                        buttonHtml: yield connectButton.evaluate(el => el.outerHTML),
                        // Log the structure for debugging
                        structure: yield connectButton.evaluate(el => {
                            let current = el;
                            const path = [];
                            for (let i = 0; i < 5 && current.parentElement; i++) {
                                current = current.parentElement;
                                path.push({
                                    tag: current.tagName,
                                    hasProfileLink: !!current.querySelector('a[href*="/in/"]'),
                                    linkCount: current.querySelectorAll('a[href*="/in/"]').length,
                                    allLinks: Array.from(current.querySelectorAll('a')).map(a => {
                                        var _a;
                                        return ({
                                            href: a.getAttribute('href'),
                                            text: (_a = a.textContent) === null || _a === void 0 ? void 0 : _a.trim()
                                        });
                                    })
                                });
                            }
                            return path;
                        })
                    });
                    console.log('could not find profile url, trying next button');
                    continue;
                }
                const cleanUrl = (0, extract_profiles_from_search_results_1.cleanProfileUrl)(profileUrl);
                // Check stored connections state
                const existingConnection = connections[cleanUrl];
                if (existingConnection) {
                    console.log(`skipping profile ${cleanUrl}, already in state: ${existingConnection.status}`);
                    continue;
                }
                // Then check memory state
                if (cooldownProfiles.has(cleanUrl) ||
                    emailVerificationProfiles.has(cleanUrl) ||
                    attemptedProfiles.has(cleanUrl)) {
                    console.log('skipping profile due to memory state:', cleanUrl);
                    continue;
                }
                attemptedProfiles.add(cleanUrl);
                console.log('trying connect button for profile:', cleanUrl);
                // Click the connect button with an animation
                yield (0, click_animation_1.showClickAnimation)(page, connectButton);
                yield connectButton.click();
                console.log('clicked connect button');
                if (stopRequested) {
                    return { success: false };
                }
                // Check immediately for an error toast indicating cooldown
                try {
                    const errorToastSelector = 'div[data-test-artdeco-toast-item-type="error"]';
                    const errorToast = yield page.waitForSelector(errorToastSelector, { timeout: 2000 });
                    if (errorToast) {
                        const errorText = yield errorToast.evaluate((el) => el.textContent);
                        if (errorText === null || errorText === void 0 ? void 0 : errorText.includes('You can resend an invitation 3 weeks after')) {
                            console.log('connection in cooldown period');
                            // Add to cooldown set to avoid retrying during this session
                            cooldownProfiles.add(cleanUrl);
                            // Dismiss the toast
                            const dismissButton = yield page.$('button[aria-label^="Dismiss"]');
                            if (dismissButton)
                                yield dismissButton.click();
                            // Return cooldown result without saving connection
                            return {
                                success: false,
                                profileUrl: cleanUrl,
                                cooldown: true
                            };
                        }
                    }
                }
                catch (_) {
                    // No error toast appeared; proceed
                }
                if (stopRequested) {
                    return { success: false };
                }
                // Check for email verification modal
                try {
                    const emailVerificationSelector = 'div.artdeco-modal.send-invite input[type="email"]';
                    const emailInput = yield page.waitForSelector(emailVerificationSelector, {
                        timeout: 2000,
                    });
                    if (emailInput) {
                        console.log('email verification required for this profile');
                        // Add to email verification set
                        emailVerificationProfiles.add(cleanUrl);
                        // Close the modal
                        const closeButtonSelector = 'button.artdeco-modal__dismiss';
                        yield page.click(closeButtonSelector);
                        return {
                            success: false,
                            profileUrl: cleanUrl,
                            emailRequired: true,
                        };
                    }
                }
                catch (_) {
                    // No email verification modal appeared
                }
                if (stopRequested) {
                    return { success: false };
                }
                // Check for the connect modal and proceed
                try {
                    yield page.waitForSelector('.artdeco-modal[role="dialog"]', {
                        timeout: 5000,
                    });
                    console.log('connect modal appeared');
                    // Use the specific selector for "Send without a note"
                    const sendButtonSelector = 'button[aria-label="Send without a note"]';
                    yield page.waitForSelector(sendButtonSelector, { timeout: 5000 });
                    yield (0, click_animation_1.showClickAnimation)(page, sendButtonSelector);
                    yield page.click(sendButtonSelector);
                    console.log('clicked send without note button');
                    if (stopRequested) {
                        return { success: false };
                    }
                    // After clicking, check for potential error toast again
                    try {
                        const errorToastSelector = 'div[data-test-artdeco-toast-item-type="error"]';
                        const errorToast = yield page.waitForSelector(errorToastSelector, {
                            timeout: 2000,
                        });
                        if (errorToast) {
                            const errorText = yield errorToast.evaluate((el) => el.textContent);
                            if (errorText === null || errorText === void 0 ? void 0 : errorText.includes('You can resend an invitation 3 weeks after')) {
                                console.log('connection in cooldown period');
                                // Add to cooldown set
                                cooldownProfiles.add(cleanUrl);
                                // Dismiss the toast
                                const dismissButton = yield page.$('button[aria-label^="Dismiss"]');
                                if (dismissButton)
                                    yield dismissButton.click();
                                continue;
                            }
                        }
                    }
                    catch (_) {
                        // No error toast; connection was successful
                    }
                    if (stopRequested) {
                        return { success: false };
                    }
                    // Check for weekly limit modal
                    try {
                        const weeklyLimitHeader = yield page.waitForSelector('h2#ip-fuse-limit-alert__header', { timeout: 1000 });
                        if (weeklyLimitHeader) {
                            console.log('weekly invitation limit reached');
                            // Click the "Got it" button to dismiss
                            const gotItButtonSelector = 'button[aria-label="Got it"]';
                            yield page.waitForSelector(gotItButtonSelector, { timeout: 5000 });
                            yield (0, click_animation_1.showClickAnimation)(page, gotItButtonSelector);
                            yield page.click(gotItButtonSelector);
                            console.log('clicked got it button');
                            return { success: false, weeklyLimitReached: true };
                        }
                    }
                    catch (_) {
                        // No weekly limit modal; proceed
                    }
                    // Connection was successful
                    return { success: true, profileUrl: cleanUrl };
                }
                catch (e) {
                    console.error('failed to click connect button:', e);
                    continue;
                }
            }
            console.log('no valid connect buttons found on this page');
            return { success: false };
        }
        catch (e) {
            console.error('failed to click connect button:', e);
            return { success: false };
        }
    });
}
// Helper function to navigate to the next page
function goToNextPage(page, stopRequested) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (stopRequested) {
                return false;
            }
            console.log('attempting to find next page button...');
            yield page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            yield new Promise((resolve) => setTimeout(resolve, 1000));
            if (stopRequested) {
                return false;
            }
            const nextButtonSelectors = [
                'button[aria-label="Next"]',
                'button.artdeco-pagination__button--next',
                'button.artdeco-button[aria-label="Next"]',
                'button.artdeco-button[aria-label="Next"][type="button"]',
                'button.artdeco-pagination__button--next',
            ];
            for (const selector of nextButtonSelectors) {
                if (stopRequested) {
                    return false;
                }
                console.log(`trying selector: ${selector}`);
                const nextButton = yield page.$(selector);
                if (nextButton) {
                    const isDisabled = yield page.evaluate((button) => {
                        return (button.hasAttribute('disabled') ||
                            button.classList.contains('disabled') ||
                            button.getAttribute('aria-disabled') === 'true');
                    }, nextButton);
                    if (!isDisabled) {
                        console.log('found enabled next button');
                        yield page.evaluate((button) => {
                            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, nextButton);
                        yield new Promise((resolve) => setTimeout(resolve, 1000));
                        if (stopRequested) {
                            return false;
                        }
                        // Click and wait for URL change
                        const currentUrl = page.url();
                        yield nextButton.click();
                        // Wait for URL to change
                        yield page.waitForFunction((oldUrl) => window.location.href !== oldUrl, { timeout: 15000 }, currentUrl);
                        if (stopRequested) {
                            return false;
                        }
                        // Reuse the same selectors from initial page load
                        try {
                            yield page.waitForSelector([
                                'div[data-view-name="search-entity-result-universal-template"]',
                                'ul.reusable-search__entity-result-list',
                            ].join(','), {
                                visible: true,
                                timeout: 15000,
                            });
                            // Check for restrictions after navigation
                            const restrictionStatus = yield (0, check_if_restricted_1.checkIfRestricted)(page);
                            if (restrictionStatus.isRestricted) {
                                console.log('account restriction detected after page navigation:', restrictionStatus);
                                if (restrictionStatus.restrictionEndDate) {
                                    // Add 12 hours buffer to the restriction end date
                                    const endDate = new Date(restrictionStatus.restrictionEndDate);
                                    const bufferEndDate = new Date(endDate.getTime() + 12 * 60 * 60 * 1000).toISOString();
                                    yield (0, storage_1.saveHarvestingState)('cooldown');
                                    yield (0, storage_1.saveNextHarvestTime)(bufferEndDate);
                                    throw new Error(`account restricted until ${bufferEndDate}`);
                                }
                                else {
                                    yield (0, storage_1.saveHarvestingState)('stopped');
                                    throw new Error('account restricted with unknown end date');
                                }
                            }
                            console.log('search results loaded successfully');
                            return true;
                        }
                        catch (error) {
                            console.error('failed after page navigation:', error);
                            return false;
                        }
                    }
                }
            }
            console.log('no valid next button found - ending harvest process');
            yield (0, storage_1.setStopRequested)(true); // Request stop when no more pages
            yield (0, storage_1.saveHarvestingState)('stopped', 'last farming cycle: no more pages available');
            return false;
        }
        catch (error) {
            console.error('error in goToNextPage:', error);
            yield (0, storage_1.setStopRequested)(true);
            yield (0, storage_1.saveHarvestingState)('stopped', 'last farming cycle: error navigating to next page');
            return false;
        }
    });
}
function navigateToSearch(page_1, url_1) {
    return __awaiter(this, arguments, void 0, function* (page, url, options = {}) {
        console.log('navigating to linkedin search...');
        try {
            yield page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 60000,
            });
        }
        catch (error) {
            // If navigation was aborted but page loaded, we can continue
            if (error.message.includes('net::ERR_ABORTED')) {
                // Verify page actually loaded by checking for key elements
                try {
                    yield page.waitForSelector([
                        'div[data-view-name="search-entity-result-universal-template"]',
                        'ul.reusable-search__entity-result-list',
                    ].join(','), {
                        visible: true,
                        timeout: 15000,
                    });
                    console.log('page loaded despite navigation abort');
                    return;
                }
                catch (_) {
                    throw error;
                }
            }
            throw error;
        }
    });
}
function getHarvestingStatus() {
    return __awaiter(this, void 0, void 0, function* () {
        const store = yield (0, storage_1.loadConnections)();
        const isAlive = yield (0, storage_1.isHarvestingAlive)();
        if (store.harvestingStatus === 'running' && !isAlive) {
            console.log('detected dead harvest process, resetting state');
            yield (0, storage_1.saveHarvestingState)('stopped');
            return {
                harvestingStatus: 'stopped',
                connectionsSent: store.connectionsSent || 0,
                weeklyLimitReached: false,
                dailyLimitReached: false,
                nextHarvestTime: store.nextHarvestTime,
            };
        }
        return {
            harvestingStatus: store.harvestingStatus,
            connectionsSent: store.connectionsSent || 0,
            weeklyLimitReached: false,
            dailyLimitReached: false,
            nextHarvestTime: store.nextHarvestTime,
        };
    });
}
