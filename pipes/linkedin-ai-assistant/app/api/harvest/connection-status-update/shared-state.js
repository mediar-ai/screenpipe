"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setStopRefresh = exports.shouldStopRefresh = void 0;
// Initialize the global variable if it doesn't exist
if (typeof globalThis.shouldStopRefreshState === 'undefined') {
    globalThis.shouldStopRefreshState = false;
}
const shouldStopRefresh = () => globalThis.shouldStopRefreshState;
exports.shouldStopRefresh = shouldStopRefresh;
const setStopRefresh = (value) => {
    console.log('setting global shouldStopRefresh to:', value);
    globalThis.shouldStopRefreshState = value;
};
exports.setStopRefresh = setStopRefresh;
