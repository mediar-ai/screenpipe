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
exports.addVocabularyEntry = addVocabularyEntry;
exports.getVocabularyEntries = getVocabularyEntries;
exports.clearVocabulary = clearVocabulary;
exports.cleanupOldEntries = cleanupOldEntries;
const localforage_1 = __importDefault(require("localforage"));
// Initialize store
const vocabularyStore = localforage_1.default.createInstance({
    name: "vocabulary",
    storeName: "corrections"
});
const CURRENT_STORAGE_VERSION = 1;
function addVocabularyEntry(original, corrected, meetingId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const entries = yield getVocabularyEntries();
            const newEntry = {
                original,
                corrected,
                timestamp: Date.now(),
                meetingId
            };
            console.log('adding vocabulary entry:', newEntry);
            yield vocabularyStore.setItem("vocabulary", [...entries, newEntry]);
            // Verify save
            const saved = yield vocabularyStore.getItem("vocabulary");
            console.log('verified saved vocabulary:', saved);
        }
        catch (error) {
            console.error("error adding vocabulary entry:", error);
            throw error;
        }
    });
}
function getVocabularyEntries() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const entries = (yield vocabularyStore.getItem("vocabulary")) || [];
            // Log storage stats
            const entriesCount = entries.length;
            const storageSize = new TextEncoder().encode(JSON.stringify(entries)).length / 1024;
            console.log("vocabulary storage stats:", {
                entriesCount,
                storageSize: `${storageSize.toFixed(2)}kb`,
            });
            return entries;
        }
        catch (error) {
            console.error("error getting vocabulary entries:", error);
            throw error;
        }
    });
}
function clearVocabulary() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield vocabularyStore.clear();
            console.log("vocabulary cleared from storage");
        }
        catch (error) {
            console.error("error clearing vocabulary:", error);
            throw error;
        }
    });
}
function cleanupOldEntries() {
    return __awaiter(this, arguments, void 0, function* (keepCount = 1000) {
        try {
            const entries = yield getVocabularyEntries();
            const entriesToKeep = entries.slice(-keepCount);
            yield vocabularyStore.setItem("vocabulary", entriesToKeep);
            console.log(`cleaned up vocabulary storage, keeping last ${keepCount} entries`);
        }
        catch (error) {
            console.error("error cleaning up old vocabulary entries:", error);
            throw error;
        }
    });
}
