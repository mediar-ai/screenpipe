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
exports.setMeetings = setMeetings;
exports.getMeetings = getMeetings;
exports.updateMeeting = updateMeeting;
exports.getAllUpdates = getAllUpdates;
exports.clearMeetings = clearMeetings;
exports.cleanupOldMeetings = cleanupOldMeetings;
exports.createMeeting = createMeeting;
const localforage_1 = __importDefault(require("localforage"));
const uuid_1 = require("uuid");
// Initialize separate stores for different data types
const meetingsStore = localforage_1.default.createInstance({
    name: "meetings",
    storeName: "meetings"
});
const updatesStore = localforage_1.default.createInstance({
    name: "meetings",
    storeName: "updates"
});
// Add version constant at the top
const CURRENT_STORAGE_VERSION = 1;
function setMeetings(meetings) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Assume meetings are already migrated when setting
            const meetingsToStore = meetings.map(m => (Object.assign(Object.assign({}, m), { _version: CURRENT_STORAGE_VERSION })));
            console.log("storing meetings to localforage:", meetingsToStore);
            yield meetingsStore.setItem("meetings", meetingsToStore);
            // Verify the save worked
            const saved = yield meetingsStore.getItem("meetings");
            console.log("verified saved meetings:", saved);
        }
        catch (error) {
            console.error("error setting meetings in storage:", error);
            throw error;
        }
    });
}
function migrateMeetingData(meeting) {
    return __awaiter(this, void 0, void 0, function* () {
        // Detect old format by checking for legacy fields
        const needsMigration = 'name' in meeting || 'summary' in meeting || 'fullTranscription' in meeting;
        if (!needsMigration) {
            // console.log('meeting already in current format:', meeting.id)
            return meeting;
        }
        console.log('migrating meeting data:', meeting);
        // Create a base meeting structure
        const migratedMeeting = {
            id: meeting.id || (0, uuid_1.v4)(),
            meetingStart: meeting.meetingStart,
            meetingEnd: meeting.meetingEnd,
            humanName: meeting.name || meeting.humanName || null,
            aiName: meeting.aiName || null,
            agenda: meeting.agenda || null,
            aiSummary: meeting.summary || meeting.aiSummary || null,
            participants: meeting.participants || null,
            mergedWith: meeting.mergedWith || [],
            selectedDevices: new Set(meeting.selectedDevices || []),
            deviceNames: new Set(meeting.deviceNames || []),
            segments: meeting.segments || [],
            notes: meeting.notes || [],
        };
        console.log('migrated meeting:', migratedMeeting);
        return migratedMeeting;
    });
}
function getMeetings() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const meetings = yield meetingsStore.getItem("meetings");
            const updates = yield getAllUpdates();
            // Migrate and apply updates
            const migratedMeetings = yield Promise.all((meetings || []).map((meeting) => __awaiter(this, void 0, void 0, function* () {
                const migrated = yield migrateMeetingData(meeting);
                const update = updates[migrated.id];
                return update ? Object.assign(Object.assign({}, migrated), update) : migrated;
            })));
            // Store migrated format back to persist the changes
            if (meetings && meetings.length > 0) {
                console.log('persisting migrated meetings format');
                yield setMeetings(migratedMeetings);
            }
            // Log storage stats
            const meetingsCount = (migratedMeetings === null || migratedMeetings === void 0 ? void 0 : migratedMeetings.length) || 0;
            const updatesCount = Object.keys(updates).length;
            const meetingsSize = new TextEncoder().encode(JSON.stringify(migratedMeetings)).length / 1024;
            const updatesSize = new TextEncoder().encode(JSON.stringify(updates)).length / 1024;
            console.log("storage stats:", {
                meetingsCount,
                updatesCount,
                meetingsSize: `${meetingsSize.toFixed(2)}kb`,
                updatesSize: `${updatesSize.toFixed(2)}kb`,
                orphanedUpdates: Object.keys(updates).filter(id => !(migratedMeetings === null || migratedMeetings === void 0 ? void 0 : migratedMeetings.some(m => m.id === id)))
            });
            return migratedMeetings;
        }
        catch (error) {
            console.error("error getting meetings from storage:", error);
            throw error;
        }
    });
}
function updateMeeting(id, update) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('updating meeting:', id, update);
            const updates = (yield updatesStore.getItem("updates")) || {};
            // Merge with existing updates
            updates[id] = Object.assign(Object.assign(Object.assign({}, updates[id]), update), { id });
            yield updatesStore.setItem("updates", updates);
            console.log('stored update:', updates[id]);
        }
        catch (error) {
            console.error("error updating meeting:", error);
            throw error;
        }
    });
}
function getAllUpdates() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return (yield updatesStore.getItem("updates")) || {};
        }
        catch (error) {
            console.error("error getting updates:", error);
            return {};
        }
    });
}
function clearMeetings() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield Promise.all([
                meetingsStore.clear(),
                updatesStore.clear()
            ]);
            console.log("meetings and updates cleared from storage");
        }
        catch (error) {
            console.error("error clearing meetings:", error);
            throw error;
        }
    });
}
function cleanupOldMeetings() {
    return __awaiter(this, arguments, void 0, function* (keepCount = 10) {
        try {
            const meetings = yield getMeetings();
            const meetingsToKeep = meetings.slice(-keepCount);
            yield setMeetings(meetingsToKeep);
            // Cleanup updates for removed meetings
            const updates = yield getAllUpdates();
            const keepIds = new Set(meetingsToKeep.map(m => m.id));
            const updatesToKeep = Object.entries(updates)
                .filter(([id]) => keepIds.has(id))
                .reduce((acc, [id, update]) => (Object.assign(Object.assign({}, acc), { [id]: update })), {});
            yield updatesStore.setItem("updates", updatesToKeep);
            console.log(`cleaned up storage, keeping last ${keepCount} meetings`);
        }
        catch (error) {
            console.error("error cleaning up old meetings:", error);
            throw error;
        }
    });
}
function createMeeting(meeting) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('creating new meeting with data:', {
            meetingStart: meeting.meetingStart,
            selectedDevices: Array.from(meeting.selectedDevices),
            deviceNames: Array.from(meeting.deviceNames),
            segmentsCount: meeting.segments.length
        });
        const newMeeting = Object.assign(Object.assign({}, meeting), { id: (0, uuid_1.v4)(), humanName: null, aiName: null, aiSummary: null, notes: [] });
        const meetings = yield getMeetings();
        yield setMeetings([...meetings, newMeeting]);
        console.log('created new meeting:', {
            id: newMeeting.id,
            meetingStart: newMeeting.meetingStart,
            selectedDevices: Array.from(newMeeting.selectedDevices),
            deviceNames: Array.from(newMeeting.deviceNames)
        });
        return newMeeting;
    });
}
