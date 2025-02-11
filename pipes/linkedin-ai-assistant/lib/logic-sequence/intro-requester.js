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
exports.startAutomation = startAutomation;
const extract_profiles_from_search_results_1 = require("../simple-actions/extract-profiles-from-search-results");
const go_to_search_results_1 = require("../simple-actions/go-to-search-results");
const templates_json_1 = __importDefault(require("../storage/templates.json"));
const browser_setup_1 = require("../browser-setup");
const extract_profile_details_from_page_1 = require("../simple-actions/extract-profile-details-from-page");
const click_mutual_connection_1 = require("../simple-actions/click-mutual-connection");
const click_message_1 = require("../simple-actions/click-message");
const click_first_profile_in_the_list_1 = require("../simple-actions/click-first-profile-in-the-list");
const extract_messages_1 = require("../simple-actions/extract-messages");
const storage_1 = require("../storage/storage");
const llm_call_1 = require("../simple-actions/llm-call");
const write_message_1 = require("../simple-actions/write-message");
const click_send_1 = require("../simple-actions/click-send");
const extract_profiles_from_search_results_2 = require("../simple-actions/extract-profiles-from-search-results");
const close_dialogues_1 = require("../simple-actions/close-dialogues");
const check_recent_messages_1 = require("../simple-actions/check-recent-messages");
const state_1 = require("../../app/api/workflow/status/state");
function startAutomation() {
    return __awaiter(this, arguments, void 0, function* (maxProfiles = Infinity) {
        try {
            (0, state_1.setRunningState)(true);
            (0, state_1.updateWorkflowStep)('setup', 'running', 'initializing automation');
            const state = yield (0, storage_1.loadState)();
            (0, state_1.updateWorkflowStep)('setup', 'done', 'state loaded');
            // Chrome setup
            (0, state_1.updateWorkflowStep)('browser', 'running', 'connecting to chrome');
            const statusResponse = yield fetch(`/api/chrome/status`);
            const statusData = yield statusResponse.json();
            if (statusData.status !== 'connected' || !statusData.wsUrl) {
                throw new Error('chrome not connected');
            }
            // Use the shared browser setup
            const { page } = yield (0, browser_setup_1.setupBrowser)();
            (0, state_1.updateWorkflowStep)('browser', 'done', 'browser connected');
            // Navigation
            (0, state_1.updateWorkflowStep)('navigation', 'running', 'navigating to linkedin search');
            yield (0, go_to_search_results_1.navigateToSearch)(page, templates_json_1.default['paste-here-url-from-linkedin-with-2nd-grade-connections'], { allowTruncate: true });
            (0, state_1.updateWorkflowStep)('navigation', 'done');
            // Close any open dialogues before proceeding
            console.log('closing any open message dialogues...');
            yield (0, close_dialogues_1.closeAllMessageDialogues)(page);
            // Profile extraction
            (0, state_1.updateWorkflowStep)('extraction', 'running', 'extracting profiles from search');
            const profileElements = yield (0, extract_profiles_from_search_results_1.extractProfileElements)(page, { maxProfiles: 100 });
            (0, state_1.updateWorkflowStep)('extraction', 'done', `found ${profileElements.length} profiles (truncated to 100 if needed)`);
            const profiles = profileElements.map((element) => {
                var _a, _b, _c;
                const cleanUrl = (0, extract_profiles_from_search_results_2.cleanProfileUrl)(element.href || '');
                const name = ((_c = (_b = (_a = element.text) === null || _a === void 0 ? void 0 : _a.match(/View (.*?)(?:'s|’s|’) profile/)) === null || _b === void 0 ? void 0 : _b[1]) === null || _c === void 0 ? void 0 : _c.trim()) || 'unknown';
                console.log(`extracted name: "${name}" from text: "${element.text}"`);
                return {
                    timestamp: new Date().toISOString(),
                    profileUrl: cleanUrl,
                    actions: {
                        [`to request intro to ${name}`]: 'not done'
                    }
                };
            }).filter(profile => profile.profileUrl);
            const queueSummary = yield (0, storage_1.updateMultipleProfileVisits)(state, profiles);
            (0, state_1.updateWorkflowStep)('queueing', 'done', `queued ${queueSummary.newlyQueued} new profiles ` +
                `(${queueSummary.alreadyVisited} already visited, ` +
                `${queueSummary.alreadyQueued} already queued)`);
            (0, state_1.updateQueueStats)(queueSummary);
            let processedCount = 0;
            // Process up to maxProfiles profiles in the queue
            while (state.toVisitProfiles.length > 0 && processedCount < maxProfiles) {
                (0, state_1.updateWorkflowStep)('processing', 'running', `processed ${processedCount}/${maxProfiles} profiles`);
                const profileToVisit = state.toVisitProfiles.shift();
                try {
                    yield page.goto(profileToVisit.profileUrl, { waitUntil: 'domcontentloaded' });
                    console.log('Successfully navigated to profile');
                    // Move to visited profiles
                    state.visitedProfiles.push(Object.assign(Object.assign({}, profileToVisit), { timestamp: new Date().toISOString() }));
                    yield (0, storage_1.saveState)(state);
                    console.log('Moved profile from queue to visited');
                    // Extract and save initial profile details
                    const profileDetails = yield (0, extract_profile_details_from_page_1.extractProfileText)(page);
                    const cleanUrl = (0, extract_profiles_from_search_results_2.cleanProfileUrl)(profileToVisit.profileUrl);
                    console.log('extracted profile details:', JSON.stringify(profileDetails).slice(0, 100) + '...');
                    yield (0, storage_1.saveProfile)(cleanUrl, profileDetails);
                    // New workflow steps
                    // Click mutual connections
                    yield (0, click_mutual_connection_1.clickMutualConnections)(page);
                    // Click first profile in the list
                    yield (0, click_first_profile_in_the_list_1.clickFirstProfile)(page);
                    // Extract details from the new profile
                    const newProfileDetails = yield (0, extract_profile_details_from_page_1.extractProfileText)(page);
                    const newProfileUrl = (0, extract_profiles_from_search_results_2.cleanProfileUrl)(page.url());
                    console.log('extracted mutual connection profile details:', JSON.stringify(newProfileDetails).slice(0, 100) + '...');
                    yield (0, storage_1.saveProfile)(newProfileUrl, newProfileDetails);
                    // Update action status to 'scheduled' for both profiles
                    yield (0, storage_1.updateOrAddProfileVisit)(state, {
                        timestamp: new Date().toISOString(),
                        profileUrl: profileToVisit.profileUrl,
                        actions: {
                            [`to request intro to ${profileDetails.name}`]: 'scheduled'
                        }
                    });
                    yield (0, storage_1.updateOrAddProfileVisit)(state, {
                        timestamp: new Date().toISOString(),
                        profileUrl: newProfileUrl,
                        actions: {
                            [`to request intro to ${profileDetails.name}`]: 'scheduled'
                        }
                    });
                    // Click message button
                    yield (0, click_message_1.clickFirstMessageButton)(page);
                    // Export messages
                    const messages = yield (0, extract_messages_1.getMessages)(page);
                    if (messages.length === 0) {
                        console.log('no existing messages found, this might be a new conversation');
                    }
                    yield (0, storage_1.saveMessages)(newProfileUrl, messages);
                    if ((0, check_recent_messages_1.hasRecentMessages)(messages)) {
                        console.log('recent messages detected, scheduling follow up');
                        // Call LLM even when recent messages exist
                        const llmResponse = yield (0, llm_call_1.callGPT4)(`Profile details: ${JSON.stringify(newProfileDetails)}
                        ${templates_json_1.default['llm-appraisal-prompt']}`);
                        console.log('llm response:', JSON.stringify(llmResponse.content).slice(0, 100) + '...');
                        // Schedule the LLM message for later instead of sending immediately
                        yield (0, storage_1.scheduleMessage)(state, newProfileUrl, llmResponse.content, 'when recent messages reviewed');
                        yield (0, storage_1.updateOrAddProfileVisit)(state, {
                            timestamp: new Date().toISOString(),
                            profileUrl: newProfileUrl,
                            actions: {
                                'recent messages detected': 'to review'
                            }
                        });
                        // Close any open dialogues before proceeding
                        console.log('closing any open message dialogues...');
                        yield (0, close_dialogues_1.closeAllMessageDialogues)(page);
                        processedCount++;
                        continue; // exit the try block
                    }
                    // Call LLM 
                    const llmResponse = yield (0, llm_call_1.callGPT4)(`Profile details: ${JSON.stringify(newProfileDetails)}
                    ${templates_json_1.default['llm-appraisal-prompt']}`);
                    console.log('llm response:', JSON.stringify(llmResponse.content).slice(0, 100) + '...');
                    // Write LLM response to message box
                    yield (0, write_message_1.writeMessage)(page, llmResponse.content);
                    console.log('wrote llm response to message box');
                    // Send the message
                    yield (0, click_send_1.clickSend)(page);
                    // Close any open dialogues before proceeding
                    console.log('closing any open message dialogues...');
                    yield (0, close_dialogues_1.closeAllMessageDialogues)(page);
                    // Add LLM message to existing messages
                    yield (0, storage_1.saveMessages)(newProfileUrl, [{
                            text: llmResponse.content,
                            timestamp: new Date().toISOString(),
                            sender: 'LLM'
                        }]);
                    console.log('saved messages with LLM response:', JSON.stringify(messages).slice(0, 100) + '...');
                    // Schedule intro request for later
                    yield (0, storage_1.scheduleMessage)(state, newProfileUrl, templates_json_1.default['request-for-intro-prompt-to-ai'].replace('${fullName}', profileDetails.name || 'your connection'), 'replied to previous message');
                    // Add delay if we have more profiles to process and haven't hit the limit
                    if (state.toVisitProfiles.length > 0 && processedCount < maxProfiles) {
                        const delay = Math.floor(Math.random() * (3000) + 1000);
                        console.log(`waiting ${delay}ms before processing next profile...`);
                        yield new Promise(resolve => setTimeout(resolve, delay));
                    }
                    processedCount++;
                }
                catch (e) {
                    console.error('Failed during profile navigation workflow:', e);
                    processedCount++; // count failed attempts too
                    continue;
                }
            }
            (0, state_1.updateWorkflowStep)('processing', 'done', `completed processing ${processedCount} profiles`);
        }
        catch (error) {
            console.error('automation failed:', error);
            (0, state_1.updateWorkflowStep)('error', 'error', error.message);
        }
        finally {
            (0, state_1.setRunningState)(false);
        }
    });
}
// Add error handling to see if something fails
startAutomation().catch(error => {
    console.error('automation failed:', error);
});
