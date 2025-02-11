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
const click_message_1 = require("./click-message");
function testClickMessage() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Replace with your actual WebSocket URL
            // const wsUrl = 'ws://127.0.0.1:9222/devtools/browser/1f237598-603c-4e61-8fc1-f8a91a3340a7';
            const { browser, page } = yield (0, browser_setup_1.setupBrowser)();
            console.log('connected to browser');
            // Test the click message functionality
            yield (0, click_message_1.clickFirstMessageButton)(page);
            console.log('message button click test completed successfully');
            // Wait a bit to see the results visually
            yield new Promise(r => setTimeout(r, 2000));
            yield browser.disconnect();
            console.log('browser disconnected');
        }
        catch (e) {
            console.error('test failed:', e);
        }
    });
}
testClickMessage();
