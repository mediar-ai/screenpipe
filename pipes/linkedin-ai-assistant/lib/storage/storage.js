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
exports.loadState = loadState;
exports.saveState = saveState;
exports.updateOrAddProfileVisit = updateOrAddProfileVisit;
exports.loadMessages = loadMessages;
exports.saveMessages = saveMessages;
exports.scheduleMessage = scheduleMessage;
exports.loadProfiles = loadProfiles;
exports.saveProfile = saveProfile;
exports.updateMultipleProfileVisits = updateMultipleProfileVisits;
exports.loadConnections = loadConnections;
exports.saveConnection = saveConnection;
exports.saveNextHarvestTime = saveNextHarvestTime;
exports.saveHarvestingState = saveHarvestingState;
exports.updateConnectionsSent = updateConnectionsSent;
exports.saveRefreshStats = saveRefreshStats;
exports.setShouldStopRefresh = setShouldStopRefresh;
exports.getShouldStopRefresh = getShouldStopRefresh;
exports.setStopRequested = setStopRequested;
exports.isStopRequested = isStopRequested;
exports.saveToChrome = saveToChrome;
exports.loadFromChrome = loadFromChrome;
exports.setWithdrawingStatus = setWithdrawingStatus;
exports.saveRestrictionInfo = saveRestrictionInfo;
exports.saveCronLog = saveCronLog;
exports.loadCronLogs = loadCronLogs;
exports.updateHeartbeat = updateHeartbeat;
exports.isHarvestingAlive = isHarvestingAlive;
exports.getHarvestingStatus = getHarvestingStatus;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const browser_setup_1 = require("../browser-setup");
const chrome_session_1 = require("../chrome-session");
const STORAGE_DIR = path_1.default.join(process.cwd(), 'lib', 'storage');
console.log('storage directory:', STORAGE_DIR);
function ensureStorageDir() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield promises_1.default.access(STORAGE_DIR);
        }
        catch (_a) {
            yield promises_1.default.mkdir(STORAGE_DIR, { recursive: true });
            console.log('created storage directory:', STORAGE_DIR);
        }
    });
}
function loadState() {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureStorageDir();
        let state = null;
        // Try file system first
        try {
            const statePath = path_1.default.join(STORAGE_DIR, 'state.json');
            const data = yield promises_1.default.readFile(statePath, 'utf-8');
            state = JSON.parse(data);
        }
        catch (err) {
            console.log('failed to load state from fs:', err);
            // Try Chrome storage as fallback
            try {
                state = yield loadFromChrome('linkedin_assistant_state');
                console.log('loaded state from chrome storage');
            }
            catch (err) {
                console.log('failed to load state from chrome:', err);
            }
        }
        // Return default state if both failed
        if (!state) {
            return {
                visitedProfiles: [],
                toVisitProfiles: []
            };
        }
        return state;
    });
}
function saveState(state) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Save to file
            const statePath = path_1.default.join(STORAGE_DIR, 'state.json');
            yield promises_1.default.writeFile(statePath, JSON.stringify(state, null, 2));
            // Save to Chrome
            yield saveToChrome('linkedin_assistant_state', state);
            console.log('state saved to both locations');
        }
        catch (err) {
            console.error('error saving state:', err);
        }
    });
}
function updateOrAddProfileVisit(state, newVisit) {
    return __awaiter(this, void 0, void 0, function* () {
        const existingIndex = state.visitedProfiles.findIndex(visit => visit.profileUrl === newVisit.profileUrl);
        if (existingIndex !== -1) {
            const existing = state.visitedProfiles[existingIndex];
            state.visitedProfiles[existingIndex] = Object.assign(Object.assign(Object.assign({}, existing), newVisit), { actions: Object.assign(Object.assign({}, existing.actions), newVisit.actions), timestamp: new Date().toISOString() });
            console.log('updated existing profile record');
        }
        else {
            state.visitedProfiles.push(newVisit);
            console.log('added new profile record');
        }
        yield saveState(state);
    });
}
function loadMessages() {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureStorageDir();
        let messageStore;
        try {
            const data = yield promises_1.default.readFile(path_1.default.join(STORAGE_DIR, 'messages.json'), 'utf-8');
            messageStore = JSON.parse(data);
        }
        catch (_a) {
            try {
                messageStore = yield loadFromChrome('linkedin_assistant_messages');
            }
            catch (_b) {
                messageStore = { messages: {} };
            }
        }
        return messageStore;
    });
}
function saveMessages(profileUrl, newMessages) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        // Load both message store and state
        const messageStore = yield loadMessages();
        const state = yield loadState();
        const existingMessages = ((_a = messageStore.messages[profileUrl]) === null || _a === void 0 ? void 0 : _a.messages) || [];
        // filter out duplicates based on text and timestamp
        const uniqueNewMessages = newMessages.filter(newMsg => !existingMessages.some(existingMsg => existingMsg.text === newMsg.text &&
            existingMsg.timestamp === newMsg.timestamp));
        // Update message store
        messageStore.messages[profileUrl] = {
            timestamp: new Date().toISOString(),
            messages: [...existingMessages, ...uniqueNewMessages]
        };
        // Update state timestamp for the profile
        const profileIndex = state.visitedProfiles.findIndex(p => p.profileUrl === profileUrl);
        if (profileIndex !== -1) {
            state.visitedProfiles[profileIndex].timestamp = new Date().toISOString();
            yield saveState(state);
        }
        // Save messages
        yield promises_1.default.writeFile(path_1.default.join(STORAGE_DIR, 'messages.json'), JSON.stringify(messageStore, null, 2));
        console.log(`saved ${uniqueNewMessages.length} new messages for profile ${profileUrl}`);
    });
}
function scheduleMessage(state, profileUrl, text, condition) {
    return __awaiter(this, void 0, void 0, function* () {
        const existingProfile = state.visitedProfiles.find(visit => visit.profileUrl === profileUrl);
        if (!existingProfile) {
            throw new Error('cannot schedule message for non-existing profile');
        }
        existingProfile.scheduledMessages = [
            ...(existingProfile.scheduledMessages || []),
            {
                text,
                condition,
                timestamp: new Date().toISOString()
            }
        ];
        yield saveState(state);
        console.log('scheduled message for profile');
    });
}
function loadProfiles() {
    return __awaiter(this, void 0, void 0, function* () {
        let profiles;
        try {
            const data = yield promises_1.default.readFile(path_1.default.join(STORAGE_DIR, 'profiles.json'), 'utf-8');
            profiles = JSON.parse(data);
        }
        catch (_a) {
            try {
                profiles = yield loadFromChrome('linkedin_assistant_profiles');
            }
            catch (_b) {
                profiles = { profiles: {} };
            }
        }
        return profiles;
    });
}
function saveProfile(profileUrl, details) {
    return __awaiter(this, void 0, void 0, function* () {
        const profiles = yield loadProfiles();
        profiles.profiles[profileUrl] = details;
        try {
            yield promises_1.default.writeFile(path_1.default.join(STORAGE_DIR, 'profiles.json'), JSON.stringify(profiles, null, 2));
            yield saveToChrome('linkedin_assistant_profiles', profiles);
            console.log('saved profile details to both locations');
        }
        catch (err) {
            console.error('error saving profile:', err);
        }
    });
}
function updateMultipleProfileVisits(state, newVisits) {
    return __awaiter(this, void 0, void 0, function* () {
        state.visitedProfiles = state.visitedProfiles || [];
        state.toVisitProfiles = state.toVisitProfiles || [];
        let alreadyVisitedCount = 0;
        let alreadyQueuedCount = 0;
        let newlyQueuedCount = 0;
        for (const newVisit of newVisits) {
            const alreadyVisited = state.visitedProfiles.some(visit => visit.profileUrl === newVisit.profileUrl);
            const alreadyQueued = state.toVisitProfiles.some(visit => visit.profileUrl === newVisit.profileUrl);
            if (alreadyVisited) {
                alreadyVisitedCount++;
            }
            else if (alreadyQueued) {
                alreadyQueuedCount++;
            }
            else {
                state.toVisitProfiles.push(newVisit);
                newlyQueuedCount++;
            }
        }
        yield saveState(state);
        const summary = {
            total: newVisits.length,
            alreadyVisited: alreadyVisitedCount,
            alreadyQueued: alreadyQueuedCount,
            newlyQueued: newlyQueuedCount,
            currentQueueSize: state.toVisitProfiles.length,
            totalVisited: state.visitedProfiles.length
        };
        console.log('profile queue update:', summary);
        return summary;
    });
}
// Define default values
const DEFAULT_CONNECTION_STORE = {
    connections: {},
    connectionsSent: 0,
    harvestingStatus: 'stopped',
    stopRequested: false,
    nextHarvestTime: '',
    lastRefreshDuration: 0,
    averageProfileCheckDuration: 0,
    isWithdrawing: false
};
function loadConnections() {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureStorageDir();
        let connectionsStore;
        // Try filesystem first
        try {
            const data = yield promises_1.default.readFile(path_1.default.join(STORAGE_DIR, 'connections.json'), 'utf-8');
            connectionsStore = Object.assign(Object.assign({}, DEFAULT_CONNECTION_STORE), JSON.parse(data) // Override with stored values
            );
            // If found in fs but not in chrome, save to chrome
            yield saveToChrome('linkedin_assistant_connections', connectionsStore);
        }
        catch (_a) {
            // Try chrome if fs fails
            try {
                connectionsStore = Object.assign(Object.assign({}, DEFAULT_CONNECTION_STORE), yield loadFromChrome('linkedin_assistant_connections'));
                // If found in chrome but not in fs, save to fs
                yield promises_1.default.writeFile(path_1.default.join(STORAGE_DIR, 'connections.json'), JSON.stringify(connectionsStore, null, 2));
            }
            catch (_b) {
                connectionsStore = Object.assign({}, DEFAULT_CONNECTION_STORE);
            }
        }
        // Ensure connections object exists and all connections have valid status
        connectionsStore.connections = connectionsStore.connections || {};
        Object.entries(connectionsStore.connections).forEach(([url, connection]) => {
            if (!connection || !connection.status) {
                connectionsStore.connections[url] = {
                    profileUrl: url,
                    status: 'pending',
                    timestamp: new Date().toISOString()
                };
            }
        });
        return connectionsStore;
    });
}
function saveConnection(connection) {
    return __awaiter(this, void 0, void 0, function* () {
        const connectionsStore = yield loadConnections();
        connectionsStore.connections[connection.profileUrl] = connection;
        try {
            yield promises_1.default.writeFile(path_1.default.join(STORAGE_DIR, 'connections.json'), JSON.stringify(connectionsStore, null, 2));
            yield saveToChrome('linkedin_assistant_connections', connectionsStore);
            console.log(`saved connection to both locations: ${connection.profileUrl}`);
        }
        catch (err) {
            console.error('error saving connection:', err);
        }
    });
}
function saveNextHarvestTime(timestamp) {
    return __awaiter(this, void 0, void 0, function* () {
        const connectionsStore = yield loadConnections();
        connectionsStore.nextHarvestTime = timestamp;
        try {
            yield promises_1.default.writeFile(path_1.default.join(STORAGE_DIR, 'connections.json'), JSON.stringify(connectionsStore, null, 2));
            yield saveToChrome('linkedin_assistant_connections', connectionsStore);
            console.log(`saved next harvest time to both locations: ${timestamp}`);
        }
        catch (err) {
            console.error('error saving harvest time:', err);
        }
    });
}
function saveHarvestingState(status, statusMessage) {
    return __awaiter(this, void 0, void 0, function* () {
        const connectionsStore = yield loadConnections();
        connectionsStore.harvestingStatus = status;
        connectionsStore.statusMessage = statusMessage; // Save the status message
        try {
            yield promises_1.default.writeFile(path_1.default.join(STORAGE_DIR, 'connections.json'), JSON.stringify(connectionsStore, null, 2));
            yield saveToChrome('linkedin_assistant_connections', connectionsStore);
            console.log(`saved harvesting status to both locations: ${status} (${statusMessage || 'no message'})`);
        }
        catch (err) {
            console.error('error saving harvesting state:', err);
        }
    });
}
function updateConnectionsSent(connectionsSent) {
    return __awaiter(this, void 0, void 0, function* () {
        const connectionsStore = yield loadConnections();
        connectionsStore.connectionsSent = connectionsSent;
        try {
            yield promises_1.default.writeFile(path_1.default.join(STORAGE_DIR, 'connections.json'), JSON.stringify(connectionsStore, null, 2));
            yield saveToChrome('linkedin_assistant_connections', connectionsStore);
            console.log(`updated connections sent count to ${connectionsSent} in both locations`);
        }
        catch (err) {
            console.error('error updating connections sent:', err);
        }
    });
}
function saveRefreshStats(totalDuration, profileCount) {
    return __awaiter(this, void 0, void 0, function* () {
        const connectionsStore = yield loadConnections();
        connectionsStore.lastRefreshDuration = totalDuration;
        connectionsStore.averageProfileCheckDuration = profileCount > 0 ? totalDuration / profileCount : undefined;
        yield promises_1.default.writeFile(path_1.default.join(STORAGE_DIR, 'connections.json'), JSON.stringify(connectionsStore, null, 2));
        console.log(`saved refresh stats: ${totalDuration}ms for ${profileCount} profiles`);
    });
}
function setShouldStopRefresh(value) {
    return __awaiter(this, void 0, void 0, function* () {
        const store = yield loadConnections();
        store.shouldStopRefresh = value;
        yield promises_1.default.writeFile(path_1.default.join(STORAGE_DIR, 'connections.json'), JSON.stringify(store, null, 2));
        console.log('saved shouldStopRefresh:', value);
    });
}
function getShouldStopRefresh() {
    return __awaiter(this, void 0, void 0, function* () {
        const store = yield loadConnections();
        return store.shouldStopRefresh || false;
    });
}
function setStopRequested(value) {
    return __awaiter(this, void 0, void 0, function* () {
        const store = yield loadConnections();
        store.stopRequested = value;
        yield promises_1.default.writeFile(path_1.default.join(STORAGE_DIR, 'connections.json'), JSON.stringify(store, null, 2));
        console.log('saved stopRequested:', value);
    });
}
function isStopRequested() {
    return __awaiter(this, void 0, void 0, function* () {
        const store = yield loadConnections();
        return store.stopRequested || false;
    });
}
function saveToChrome(key, data) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // First try to get existing browser
            let pages;
            const { browser } = (0, browser_setup_1.getActiveBrowser)();
            if (!browser) {
                console.log('no browser found, attempting to set up...');
                const { browser: newBrowser } = yield (0, browser_setup_1.setupBrowser)();
                if (!newBrowser) {
                    console.log('cannot save to chrome: failed to set up browser');
                    return;
                }
                pages = yield newBrowser.pages();
            }
            else {
                pages = yield browser.pages();
            }
            // console.log('found pages:', pages.length);
            // Find LinkedIn tab
            let linkedInPage = null;
            for (const page of pages) {
                const url = yield page.url();
                // console.log('checking page url:', url);
                if (url.includes('linkedin.com')) {
                    linkedInPage = page;
                    break;
                }
            }
            if (!linkedInPage) {
                console.log('cannot save to chrome: no linkedin page found');
                return;
            }
            yield linkedInPage.evaluate((key, data) => {
                localStorage.setItem(key, JSON.stringify(data));
                return true;
            }, key, data);
            // console.log('successfully saved to chrome storage:', key);
        }
        catch (err) {
            console.log('failed to save to chrome storage:', { error: err, key });
        }
    });
}
function loadFromChrome(key) {
    return __awaiter(this, void 0, void 0, function* () {
        const session = chrome_session_1.ChromeSession.getInstance();
        const page = session.getActivePage();
        if (!page) {
            console.log('cannot load from chrome: no active page in session');
            return null;
        }
        try {
            console.log('attempting to load', key, 'from chrome storage');
            const data = yield page.evaluate((key) => {
                console.log('in page context, loading:', key);
                const value = localStorage.getItem(key);
                console.log('loaded value:', value);
                return value;
            }, key);
            console.log('chrome storage load result:', data ? 'found' : 'not found');
            return data ? JSON.parse(data) : null;
        }
        catch (err) {
            console.log('failed to load from chrome storage:', err);
            return null;
        }
    });
}
function setWithdrawingStatus(isWithdrawing, details) {
    return __awaiter(this, void 0, void 0, function* () {
        const store = yield loadConnections();
        store.withdrawStatus = Object.assign({ isWithdrawing }, (details || {}));
        yield promises_1.default.writeFile(path_1.default.join(STORAGE_DIR, 'connections.json'), JSON.stringify(store, null, 2));
        console.log('saved withdrawal status:', Object.assign({ isWithdrawing }, details));
    });
}
function saveRestrictionInfo(info) {
    return __awaiter(this, void 0, void 0, function* () {
        const store = yield loadConnections();
        store.restrictionInfo = info;
        yield promises_1.default.writeFile(path_1.default.join(STORAGE_DIR, 'connections.json'), JSON.stringify(store, null, 2));
        yield saveToChrome('linkedin_assistant_connections', store);
        console.log('saved restriction info:', info);
    });
}
// Add these functions
function saveCronLog(log) {
    return __awaiter(this, void 0, void 0, function* () {
        const logPath = path_1.default.join(STORAGE_DIR, 'cron-logs.json');
        let logs = [];
        try {
            const data = yield promises_1.default.readFile(logPath, 'utf-8');
            logs = JSON.parse(data);
        }
        catch (_a) {
            // File doesn't exist yet, start with empty array
        }
        // Add new log and keep last 100 entries
        logs.unshift(log);
        logs = logs.slice(0, 100);
        yield promises_1.default.writeFile(logPath, JSON.stringify(logs, null, 2));
        console.log('saved cron log:', log);
    });
}
function loadCronLogs() {
    return __awaiter(this, void 0, void 0, function* () {
        const logPath = path_1.default.join(STORAGE_DIR, 'cron-logs.json');
        try {
            const data = yield promises_1.default.readFile(logPath, 'utf-8');
            return JSON.parse(data);
        }
        catch (_a) {
            return [];
        }
    });
}
function updateHeartbeat(processId) {
    return __awaiter(this, void 0, void 0, function* () {
        const store = yield loadConnections();
        store.heartbeat = {
            lastBeat: new Date().toISOString(),
            processId
        };
        console.log('updating heartbeat:', {
            processId,
            timestamp: store.heartbeat.lastBeat
        });
        yield promises_1.default.writeFile(path_1.default.join(STORAGE_DIR, 'connections.json'), JSON.stringify(store, null, 2));
    });
}
function isHarvestingAlive() {
    return __awaiter(this, void 0, void 0, function* () {
        const store = yield loadConnections();
        if (!store.heartbeat) {
            // console.log('no heartbeat found');
            return false;
        }
        const lastBeat = new Date(store.heartbeat.lastBeat);
        const now = new Date();
        // If no heartbeat in last 30 seconds, consider process dead
        const isAlive = now.getTime() - lastBeat.getTime() < 30000;
        //   console.log('harvest heartbeat check:', { 
        //     lastBeat: store.heartbeat.lastBeat,
        //     processId: store.heartbeat.processId,
        //     isAlive,
        //     timeSinceLastBeat: `${Math.floor((now.getTime() - lastBeat.getTime()) / 1000)}s`
        //   });
        return isAlive;
    });
}
function getHarvestingStatus() {
    return __awaiter(this, void 0, void 0, function* () {
        const store = yield loadConnections();
        const isAlive = yield isHarvestingAlive();
        if (store.harvestingStatus === 'running' && !isAlive) {
            console.log('detected dead harvest process, resetting state');
            yield saveHarvestingState('stopped', 'harvest process died unexpectedly');
            return {
                harvestingStatus: 'stopped',
                connectionsSent: store.connectionsSent || 0,
                weeklyLimitReached: false,
                dailyLimitReached: false,
                nextHarvestTime: store.nextHarvestTime,
                statusMessage: 'harvest process died unexpectedly'
            };
        }
        return {
            harvestingStatus: store.harvestingStatus,
            connectionsSent: store.connectionsSent || 0,
            weeklyLimitReached: false,
            dailyLimitReached: false,
            nextHarvestTime: store.nextHarvestTime,
            statusMessage: store.statusMessage
        };
    });
}
