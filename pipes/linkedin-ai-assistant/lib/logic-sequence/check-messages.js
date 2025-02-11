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
exports.checkAllMessages = checkAllMessages;
exports.startMessageCheck = startMessageCheck;
const browser_setup_1 = require("../browser-setup");
const extract_messages_1 = require("../simple-actions/extract-messages");
const storage_1 = require("../storage/storage");
const close_dialogues_1 = require("../simple-actions/close-dialogues");
const click_message_1 = require("../simple-actions/click-message");
const check_if_connected_1 = require("../simple-actions/check-if-connected");
function checkAllMessages() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('starting message check automation...');
        const state = yield (0, storage_1.loadState)();
        // Check Chrome connection
        const statusResponse = yield fetch('/api/chrome/status');
        const statusData = yield statusResponse.json();
        if (statusData.status !== 'connected' || !statusData.wsUrl) {
            throw new Error('chrome not connected');
        }
        // Setup browser
        const { browser, page } = yield (0, browser_setup_1.setupBrowser)();
        try {
            // Get all profiles (both visited and to visit)
            const allProfiles = [
                ...state.visitedProfiles,
                ...state.toVisitProfiles
            ];
            console.log(`checking messages for ${allProfiles.length} profiles...`);
            for (const profile of allProfiles) {
                try {
                    console.log(`checking messages for profile: ${profile.profileUrl}`);
                    // Navigate to profile
                    yield page.goto(profile.profileUrl, { waitUntil: 'domcontentloaded' });
                    // Check if we're connected before proceeding
                    const isConnected = yield (0, check_if_connected_1.checkIfConnected)(page);
                    if (!isConnected) {
                        console.log(`skipping ${profile.profileUrl} - not connected`);
                        continue;
                    }
                    // Close any existing message dialogues
                    yield (0, close_dialogues_1.closeAllMessageDialogues)(page);
                    // Click message button
                    yield (0, click_message_1.clickFirstMessageButton)(page);
                    // Get messages
                    const messages = yield (0, extract_messages_1.getMessages)(page);
                    // Save messages
                    yield (0, storage_1.saveMessages)(profile.profileUrl, messages);
                    console.log(`saved ${messages.length} messages for ${profile.profileUrl}`);
                    // Close dialogues before next profile
                    yield (0, close_dialogues_1.closeAllMessageDialogues)(page);
                    // Add a small delay between profiles
                    const delay = Math.floor(Math.random() * (2000) + 1000);
                    yield new Promise(resolve => setTimeout(resolve, delay));
                }
                catch (error) {
                    console.error(`failed to check messages for ${profile.profileUrl}:`, error);
                    continue; // Continue with next profile even if one fails
                }
            }
        }
        finally {
            // Always close the browser
            yield browser.close();
            console.log('message check completed');
        }
    });
}
// Add error handling
function startMessageCheck() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield checkAllMessages();
            return { success: true };
        }
        catch (error) {
            console.error('message check automation failed:', error);
            return { success: false, error: error.message };
        }
    });
}
