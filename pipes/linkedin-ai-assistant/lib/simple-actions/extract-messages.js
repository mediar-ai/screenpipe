"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.getMessages = getMessages;
const standardize_timestamp_in_messages_1 = require("./standardize-timestamp-in-messages");
function getMessages(page) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // First check if this is a new message dialogue
            const isNewMessage = yield page.evaluate(() => {
                var _a;
                const header = document.querySelector('.msg-overlay-bubble-header__title');
                const headerText = (_a = header === null || header === void 0 ? void 0 : header.textContent) === null || _a === void 0 ? void 0 : _a.trim();
                console.log('message dialog header:', headerText);
                return headerText === 'New message';
            });
            if (isNewMessage) {
                console.log('detected new message dialogue, no messages to export');
                return [];
            }
            // Proceed with existing message extraction logic
            const rawMessages = yield page.evaluate(() => {
                const messageElements = document.querySelectorAll('.msg-s-message-list__event');
                console.log(`found ${messageElements.length} message events`);
                let lastSender = null;
                let lastTimestamp = null;
                return Array.from(messageElements).map(el => {
                    var _a, _b, _c, _d, _e;
                    // Try multiple selectors for sender
                    const senderSelectors = [
                        '.msg-s-event-listitem__name',
                        '.t-14.t-bold',
                        '[data-anonymize="person-name"]',
                    ];
                    let sender = null;
                    for (const selector of senderSelectors) {
                        const senderEl = el.querySelector(selector);
                        if (senderEl) {
                            sender = (_a = senderEl.textContent) === null || _a === void 0 ? void 0 : _a.trim();
                            break;
                        }
                    }
                    if (!sender) {
                        sender = lastSender;
                    }
                    else {
                        lastSender = sender;
                    }
                    // Get raw timestamp parts
                    const timeEl = el.querySelector('.msg-s-message-group__timestamp');
                    const dateEl = el.querySelector('time');
                    let timestamp = null;
                    if (timeEl && dateEl) {
                        const time = ((_b = timeEl.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
                        const date = ((_c = dateEl.textContent) === null || _c === void 0 ? void 0 : _c.trim()) || '';
                        timestamp = `${date} ${time}`.trim();
                    }
                    if (!timestamp) {
                        timestamp = lastTimestamp;
                    }
                    lastTimestamp = timestamp;
                    const text = ((_e = (_d = el.querySelector('.msg-s-event-listitem__body')) === null || _d === void 0 ? void 0 : _d.textContent) === null || _e === void 0 ? void 0 : _e.trim()) || '';
                    const msg = { text, timestamp, sender };
                    console.log('found message:', msg);
                    return msg;
                });
            });
            // Standardize timestamps before returning
            const messages = (0, standardize_timestamp_in_messages_1.standardizeTimestamps)(rawMessages);
            console.log('standardized messages:', JSON.stringify(messages, null, 2));
            return messages;
        }
        catch (e) {
            console.error('failed to get messages:', e);
            return [];
        }
    });
}
// test the functions
if (require.main === module) {
    const test = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { setupBrowser, getActiveBrowser } = yield Promise.resolve().then(() => __importStar(require('../browser-setup')));
            yield setupBrowser();
            const { browser, page } = getActiveBrowser();
            if (!page)
                throw new Error('no active page');
            if (!browser)
                throw new Error('no active browser');
            console.log('connected to browser');
            yield getMessages(page);
            yield browser.disconnect();
        }
        catch (error) {
            console.error('test failed:', error);
        }
    });
    test();
}
