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
exports.startCheckingRecentlyAddedConnections = startCheckingRecentlyAddedConnections;
const browser_setup_1 = require("../browser-setup");
const state_1 = require("../../app/api/workflow/status/state");
const storage_1 = require("../storage/storage");
const storage_2 = require("../storage/storage");
const withdraw_connections_1 = require("./withdraw-connections");
const port = process.env.PORT;
const BASE_URL = `http://127.0.0.1:${port}`;
let isCurrentlyChecking = false;
function startCheckingRecentlyAddedConnections() {
    return __awaiter(this, void 0, void 0, function* () {
        if (isCurrentlyChecking) {
            console.log('check recently added connections process already in progress');
            return;
        }
        isCurrentlyChecking = true;
        console.log('starting check recently added connections process');
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
            // Load connections store to get pending connections
            const connectionsStore = yield (0, storage_1.loadConnections)();
            const pendingConnections = Object.values(connectionsStore.connections)
                .filter(conn => conn.status === 'pending')
                .map(conn => conn.profileUrl);
            console.log(`found ${pendingConnections.length} pending connections to check against recently added`);
            // Visit connections page
            yield page.goto('https://www.linkedin.com/mynetwork/invite-connect/connections/', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            // Wait for the sort button to be visible
            yield page.waitForFunction(`document.querySelector('button[aria-label*="Sort by"]') !== null`, {
                timeout: 10000
            });
            // Verify sort is set to "Recently Added"
            console.log('checking sort button status');
            const sortButton = yield page.$('button[aria-label*="Sort by"]');
            const sortText = yield (sortButton === null || sortButton === void 0 ? void 0 : sortButton.evaluate(el => el.textContent));
            console.log('current sort:', sortText);
            if (!(sortText === null || sortText === void 0 ? void 0 : sortText.toLowerCase().includes('recently added'))) {
                console.log('changing sort to recently added');
                yield (sortButton === null || sortButton === void 0 ? void 0 : sortButton.click());
                yield page.waitForFunction(`new Promise(r => setTimeout(r, 1000))`);
                const recentlyAddedOption = yield page.$('button:has-text("Recently added")');
                if (!recentlyAddedOption) {
                    console.log('could not find recently added option');
                    throw new Error('recently added sort option not found');
                }
                yield recentlyAddedOption.click();
                yield page.waitForFunction(`new Promise(r => setTimeout(r, 2000))`);
            }
            // Extract recently added connections
            console.log('starting to extract connections');
            const recentlyAddedProfiles = new Set();
            let scrollTries = 0;
            const maxScrollTries = 5;
            let initialCardCount = yield page.$$eval('.mn-connection-card', cards => cards.length);
            const maxConnections = 100;
            while (scrollTries < maxScrollTries) {
                if (withdraw_connections_1.shouldStop) {
                    console.log('check recently added connections stopped by user during scrolling');
                    return;
                }
                console.log(`scroll attempt ${scrollTries + 1}/${maxScrollTries}`);
                yield page.keyboard.press('PageDown');
                yield page.keyboard.press('PageDown');
                yield new Promise(resolve => setTimeout(resolve, 2000));
                const currentCardCount = yield page.$$eval('.mn-connection-card', cards => {
                    console.log('after scroll: found', cards.length, 'cards');
                    return cards.length;
                });
                if (currentCardCount >= maxConnections) {
                    console.log(`reached max connections limit (${maxConnections})`);
                    break;
                }
                // Check for "Show more" button at bottom
                if (scrollTries === maxScrollTries - 1) {
                    const showMoreButton = yield page.$('button.scaffold-finite-scroll__load-button');
                    if (showMoreButton) {
                        console.log('found show more button, clicking...');
                        yield showMoreButton.click();
                        yield new Promise(resolve => setTimeout(resolve, 1000));
                        scrollTries = 0;
                        initialCardCount = currentCardCount;
                        continue;
                    }
                }
                if (currentCardCount > initialCardCount) {
                    console.log(`found ${currentCardCount - initialCardCount} new cards`);
                    initialCardCount = currentCardCount;
                }
                else {
                    console.log('no new cards, trying again...');
                    scrollTries++;
                }
            }
            // Compare with pending connections
            const recentlyAddedPending = pendingConnections.filter(pendingUrl => {
                const cleanPendingUrl = pendingUrl.replace(/\/$/, '').toLowerCase();
                return Array.from(recentlyAddedProfiles).some(profile => profile.url.replace(/\/$/, '').toLowerCase() === cleanPendingUrl);
            });
            console.log(`found ${recentlyAddedPending.length} pending connections that were recently added`);
            console.log('recently added pending connections:', recentlyAddedPending);
            // Update their status to accepted
            for (const profileUrl of recentlyAddedPending) {
                yield (0, storage_2.saveConnection)({
                    profileUrl,
                    status: 'accepted',
                    timestamp: new Date().toISOString()
                });
            }
            console.log(`updated ${recentlyAddedPending.length} connections to accepted status`);
        }
        catch (error) {
            console.error('check recently added connections process failed:', error);
            throw error;
        }
        finally {
            isCurrentlyChecking = false;
        }
    });
}
