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
exports.writeMessage = writeMessage;
function writeMessage(page_1, message_1) {
    return __awaiter(this, arguments, void 0, function* (page, message, maxRetries = 2) {
        let attempts = 0;
        while (attempts <= maxRetries) {
            try {
                const messageSelector = 'div[role="textbox"][aria-label="Write a message…"]';
                yield page.waitForSelector(messageSelector, { timeout: 5000 });
                console.log('found message input');
                // Simulate paste event to insert the message
                yield page.evaluate((selector, text) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.focus();
                        const clipboardData = new DataTransfer();
                        clipboardData.setData('text/plain', text);
                        const pasteEvent = new ClipboardEvent('paste', {
                            clipboardData,
                            bubbles: true,
                            cancelable: true
                        });
                        element.dispatchEvent(pasteEvent);
                    }
                }, messageSelector, message);
                // Verify the message was written
                const content = yield page.evaluate((selector) => {
                    const element = document.querySelector(selector);
                    return (element === null || element === void 0 ? void 0 : element.textContent) || '';
                }, messageSelector);
                if (!content.includes(message)) {
                    throw new Error('message was not written correctly');
                }
                console.log('message written and verified');
                return; // Success - exit function
            }
            catch (e) {
                attempts++;
                if (attempts > maxRetries) {
                    console.error(`failed to write message after ${maxRetries + 1} attempts:`, e);
                    throw e;
                }
                console.log(`retry attempt ${attempts}/${maxRetries}`);
                yield new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between retries
            }
        }
    });
}
