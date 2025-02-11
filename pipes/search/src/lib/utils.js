"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeDuplicateSelections = void 0;
exports.cn = cn;
const clsx_1 = require("clsx");
const tailwind_merge_1 = require("tailwind-merge");
const js_levenshtein_1 = __importDefault(require("js-levenshtein"));
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
const removeDuplicateSelections = (results, selectedResults, similarityThreshold = 0.9) => {
    const newSelectedResults = new Set();
    const seenContents = [];
    const getSimilarity = (str1, str2) => {
        const maxLength = Math.max(str1.length, str2.length);
        const distance = (0, js_levenshtein_1.default)(str1, str2);
        return 1 - distance / maxLength;
    };
    const isDuplicate = (content) => {
        return seenContents.some((seenContent) => getSimilarity(content, seenContent) >= similarityThreshold);
    };
    Array.from(selectedResults).forEach((index) => {
        const item = results[index];
        if (!item || !item.type)
            return;
        let content = "";
        if (item.type === "OCR")
            content = item.content.text;
        else if (item.type === "Audio")
            content = item.content.transcription;
        else if (item.type === "UI")
            content = item.content.text;
        if (!isDuplicate(content)) {
            seenContents.push(content);
            newSelectedResults.add(index);
        }
    });
    return newSelectedResults;
};
exports.removeDuplicateSelections = removeDuplicateSelections;
