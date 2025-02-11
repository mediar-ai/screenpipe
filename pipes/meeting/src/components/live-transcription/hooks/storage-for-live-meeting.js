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
exports.clearCurrentKey = exports.getCurrentKey = exports.LIVE_MEETING_KEY = exports.liveStore = void 0;
exports.MeetingProvider = MeetingProvider;
exports.useMeetingContext = useMeetingContext;
exports.storeLiveChunks = storeLiveChunks;
exports.getLiveMeetingData = getLiveMeetingData;
exports.clearLiveMeetingData = clearLiveMeetingData;
const react_1 = require("react");
const localforage_1 = __importDefault(require("localforage"));
// Storage setup
exports.liveStore = localforage_1.default.createInstance({
    name: "live-meetings",
    storeName: "transcriptions"
});
// Export the key
exports.LIVE_MEETING_KEY = 'current-live-meeting';
// Context creation
const MeetingContext = (0, react_1.createContext)(undefined);
function MeetingProvider({ children }) {
    const [data, setData] = (0, react_1.useState)(null);
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    (0, react_1.useEffect)(() => {
        const loadData = () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                console.log('MeetingProvider: loading data');
                const stored = yield exports.liveStore.getItem(exports.LIVE_MEETING_KEY);
                console.log('MeetingProvider: loaded data:', {
                    exists: !!stored,
                    chunks: (_a = stored === null || stored === void 0 ? void 0 : stored.chunks) === null || _a === void 0 ? void 0 : _a.length,
                    title: stored === null || stored === void 0 ? void 0 : stored.title,
                    notes: (_b = stored === null || stored === void 0 ? void 0 : stored.notes) === null || _b === void 0 ? void 0 : _b.length,
                    notesData: (_c = stored === null || stored === void 0 ? void 0 : stored.notes) === null || _c === void 0 ? void 0 : _c.map(n => {
                        var _a;
                        return ({
                            id: n.id,
                            text: (_a = n.text) === null || _a === void 0 ? void 0 : _a.slice(0, 50),
                            timestamp: n.timestamp
                        });
                    })
                });
                if (!stored) {
                    console.log('MeetingProvider: no stored data, initializing new');
                }
                setData(stored || {
                    chunks: [],
                    editedChunks: {},
                    speakerMappings: {},
                    lastProcessedIndex: -1,
                    startTime: new Date().toISOString(),
                    title: null,
                    notes: [],
                    analysis: null,
                    deviceNames: new Set(),
                    selectedDevices: new Set()
                });
            }
            catch (error) {
                console.error('MeetingProvider: failed to load meeting data:', error);
            }
            finally {
                setIsLoading(false);
            }
        });
        loadData();
    }, []);
    const updateStore = (newData) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        // Debug: log current and new notes details
        console.log('updateStore: checking changes', {
            currentNotes: (_a = data === null || data === void 0 ? void 0 : data.notes) === null || _a === void 0 ? void 0 : _a.length,
            newNotes: (_b = newData.notes) === null || _b === void 0 ? void 0 : _b.length,
            currentNotesData: (_c = data === null || data === void 0 ? void 0 : data.notes) === null || _c === void 0 ? void 0 : _c.map(n => {
                var _a;
                return ({
                    text: (_a = n.text) === null || _a === void 0 ? void 0 : _a.slice(0, 50),
                    timestamp: n.timestamp,
                    id: n.id
                });
            }),
            newNotesData: (_d = newData.notes) === null || _d === void 0 ? void 0 : _d.map(n => {
                var _a;
                return ({
                    text: (_a = n.text) === null || _a === void 0 ? void 0 : _a.slice(0, 50),
                    timestamp: n.timestamp,
                    id: n.id
                });
            }),
            stack: (_e = new Error().stack) === null || _e === void 0 ? void 0 : _e.split('\n').slice(1, 3)
        });
        // Debug: log title differences for clarity
        console.log('updateStore: checking title change', {
            currentTitle: data === null || data === void 0 ? void 0 : data.title,
            newTitle: newData.title,
            titleChanged: (data === null || data === void 0 ? void 0 : data.title) !== newData.title
        });
        // If no previous data, always update
        if (!data) {
            console.log('updateStore: no previous data, saving');
            yield exports.liveStore.setItem(exports.LIVE_MEETING_KEY, newData);
            setData(newData);
            return;
        }
        // Determine if notes have changed
        const notesChanged = data.notes.length !== newData.notes.length ||
            JSON.stringify(data.notes) !== JSON.stringify(newData.notes);
        // Determine if title has changed
        const titleChanged = data.title !== newData.title;
        // If neither notes nor title changed, skip saving
        if (!notesChanged && !titleChanged) {
            console.log('updateStore: no changes detected', { notesChanged, titleChanged });
            return;
        }
        console.log('updateStore: saving changes', {
            currentNotes: data.notes.length,
            newNotes: newData.notes.length,
            notesChanged,
            titleChanged
        });
        try {
            yield exports.liveStore.setItem(exports.LIVE_MEETING_KEY, newData);
            setData(newData);
        }
        catch (error) {
            console.error('updateStore: failed:', error);
        }
    });
    const setTitle = (title) => __awaiter(this, void 0, void 0, function* () {
        if (!data) {
            console.log('setTitle: no data available');
            return;
        }
        console.log('setTitle: starting update', {
            oldTitle: data.title,
            newTitle: title,
            dataState: !!data
        });
        yield updateStore(Object.assign(Object.assign({}, data), { title }));
        console.log('setTitle: completed update');
    });
    const setNotes = (notes) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!data)
            return;
        console.log('setting notes:', {
            count: notes.length,
            notes: notes.map(n => {
                var _a;
                return ({
                    text: (_a = n.text) === null || _a === void 0 ? void 0 : _a.slice(0, 50),
                    timestamp: n.timestamp,
                    id: n.id
                });
            }),
            stack: (_a = new Error().stack) === null || _a === void 0 ? void 0 : _a.split('\n').slice(1, 3)
        });
        yield updateStore(Object.assign(Object.assign({}, data), { notes }));
    });
    const setSegments = (segments) => __awaiter(this, void 0, void 0, function* () {
        if (!data)
            return;
        console.log('setting segments:', segments.length);
        const chunks = segments.map((seg, index) => {
            var _a;
            return ({
                id: Date.now() + index,
                timestamp: seg.timestamp,
                text: seg.transcription,
                deviceName: seg.deviceName,
                speaker: seg.speaker,
                isInput: ((_a = seg.deviceName) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('input')) || false,
                device: seg.deviceName || 'unknown',
            });
        });
        yield updateStore(Object.assign(Object.assign({}, data), { chunks }));
    });
    const setAnalysis = (analysis) => __awaiter(this, void 0, void 0, function* () {
        if (!data)
            return;
        console.log('setting analysis:', analysis);
        yield updateStore(Object.assign(Object.assign({}, data), { analysis }));
    });
    const value = (0, react_1.useMemo)(() => ({
        title: (data === null || data === void 0 ? void 0 : data.title) || '',
        setTitle,
        notes: (data === null || data === void 0 ? void 0 : data.notes) || [],
        setNotes,
        segments: ((data === null || data === void 0 ? void 0 : data.chunks) || []).map(chunk => ({
            timestamp: chunk.timestamp,
            transcription: (data === null || data === void 0 ? void 0 : data.editedChunks[chunk.id]) || chunk.text,
            deviceName: chunk.deviceName || '',
            speaker: (data === null || data === void 0 ? void 0 : data.speakerMappings[chunk.speaker || 'speaker_0']) || chunk.speaker || 'speaker_0'
        })),
        setSegments,
        analysis: (data === null || data === void 0 ? void 0 : data.analysis) || null,
        setAnalysis,
        isLoading,
        data,
        updateStore
    }), [data, isLoading]);
    return (<MeetingContext.Provider value={value}>
            {children}
        </MeetingContext.Provider>);
}
function useMeetingContext() {
    const context = (0, react_1.useContext)(MeetingContext);
    if (!context) {
        throw new Error('useMeetingContext must be used within a MeetingProvider');
    }
    return context;
}
// Storage operations
const getCurrentKey = () => exports.LIVE_MEETING_KEY;
exports.getCurrentKey = getCurrentKey;
const clearCurrentKey = () => {
    exports.liveStore.removeItem(exports.LIVE_MEETING_KEY);
    console.log('cleared live meeting data');
};
exports.clearCurrentKey = clearCurrentKey;
function storeLiveChunks(chunks) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        try {
            const existing = yield exports.liveStore.getItem(exports.LIVE_MEETING_KEY);
            const data = {
                chunks,
                editedChunks: (_a = existing === null || existing === void 0 ? void 0 : existing.editedChunks) !== null && _a !== void 0 ? _a : {},
                speakerMappings: (_b = existing === null || existing === void 0 ? void 0 : existing.speakerMappings) !== null && _b !== void 0 ? _b : {},
                lastProcessedIndex: (_c = existing === null || existing === void 0 ? void 0 : existing.lastProcessedIndex) !== null && _c !== void 0 ? _c : -1,
                startTime: (_d = existing === null || existing === void 0 ? void 0 : existing.startTime) !== null && _d !== void 0 ? _d : new Date().toISOString(),
                title: (_e = existing === null || existing === void 0 ? void 0 : existing.title) !== null && _e !== void 0 ? _e : null,
                notes: (_f = existing === null || existing === void 0 ? void 0 : existing.notes) !== null && _f !== void 0 ? _f : [],
                analysis: (_g = existing === null || existing === void 0 ? void 0 : existing.analysis) !== null && _g !== void 0 ? _g : null,
                deviceNames: (_h = existing === null || existing === void 0 ? void 0 : existing.deviceNames) !== null && _h !== void 0 ? _h : new Set(),
                selectedDevices: (_j = existing === null || existing === void 0 ? void 0 : existing.selectedDevices) !== null && _j !== void 0 ? _j : new Set()
            };
            console.log('storing live meeting data');
            yield exports.liveStore.setItem(exports.LIVE_MEETING_KEY, data);
        }
        catch (error) {
            console.error('failed to store live meeting:', error);
        }
    });
}
function getLiveMeetingData() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        try {
            console.log('getLiveMeetingData: loading');
            const data = yield exports.liveStore.getItem(exports.LIVE_MEETING_KEY);
            // Ensure dates are properly restored
            if (data === null || data === void 0 ? void 0 : data.notes) {
                data.notes = data.notes.map(note => (Object.assign(Object.assign({}, note), { timestamp: new Date(note.timestamp), editedAt: note.editedAt ? new Date(note.editedAt) : undefined })));
            }
            console.log('getLiveMeetingData: result:', {
                exists: !!data,
                chunks: (_a = data === null || data === void 0 ? void 0 : data.chunks) === null || _a === void 0 ? void 0 : _a.length,
                title: data === null || data === void 0 ? void 0 : data.title,
                notes: (_b = data === null || data === void 0 ? void 0 : data.notes) === null || _b === void 0 ? void 0 : _b.length,
                firstNote: (_e = (_d = (_c = data === null || data === void 0 ? void 0 : data.notes) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.text) === null || _e === void 0 ? void 0 : _e.slice(0, 50)
            });
            return data;
        }
        catch (error) {
            console.error('getLiveMeetingData: failed:', error);
            return null;
        }
    });
}
function clearLiveMeetingData() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const currentData = yield exports.liveStore.getItem(exports.LIVE_MEETING_KEY);
            console.log('clearing live meeting data:', {
                had_title: !!(currentData === null || currentData === void 0 ? void 0 : currentData.title),
                notes_count: currentData === null || currentData === void 0 ? void 0 : currentData.notes.length,
                chunks_count: currentData === null || currentData === void 0 ? void 0 : currentData.chunks.length,
                analysis: !!(currentData === null || currentData === void 0 ? void 0 : currentData.analysis),
                start_time: currentData === null || currentData === void 0 ? void 0 : currentData.startTime,
            });
            // Create empty state
            const emptyState = {
                chunks: [],
                editedChunks: {},
                speakerMappings: {},
                lastProcessedIndex: -1,
                startTime: new Date().toISOString(),
                title: null,
                notes: [],
                analysis: null,
                deviceNames: new Set(),
                selectedDevices: new Set()
            };
            // Set empty state first, then remove
            yield exports.liveStore.setItem(exports.LIVE_MEETING_KEY, emptyState);
            yield exports.liveStore.removeItem(exports.LIVE_MEETING_KEY);
            console.log('live meeting data cleared successfully');
        }
        catch (error) {
            console.error('failed to clear live meeting data:', error);
            throw error;
        }
    });
}
