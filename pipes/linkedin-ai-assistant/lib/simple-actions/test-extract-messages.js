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
const browser_setup_1 = require("../browser-setup");
const extract_messages_1 = require("./extract-messages");
function testExtractMessages() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Replace with your actual WebSocket URL
            // const wsUrl = 'ws://127.0.0.1:9222/devtools/browser/72af91ce-8c00-4035-81bc-aa5d86846084';
            const { browser, page } = yield (0, browser_setup_1.setupBrowser)();
            console.log('connected to browser');
            // Extract messages using your existing function
            const messages = yield (0, extract_messages_1.getMessages)(page);
            console.log('extracted messages:', JSON.stringify(messages, null, 2));
            yield browser.disconnect();
            console.log('browser disconnected');
        }
        catch (e) {
            console.error('test failed:', e);
        }
    });
}
testExtractMessages();
