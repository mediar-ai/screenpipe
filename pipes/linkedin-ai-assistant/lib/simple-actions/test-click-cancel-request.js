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
const click_cancel_connection_request_1 = require("./click-cancel-connection-request");
function testCancelRequest() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Replace with your actual WebSocket URL
            // const wsUrl = 'ws://127.0.0.1:9222/devtools/browser/eb8cd29f-cf02-43c1-a4f7-6368bd6c25de';
            const { browser, page } = yield (0, browser_setup_1.setupBrowser)();
            console.log('connected to browser');
            // Test the cancel request functionality
            const result = yield (0, click_cancel_connection_request_1.clickCancelConnectionRequest)(page);
            console.log('cancel request test result:', result);
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
testCancelRequest();
// visit http://localhost:9222/json/version to get websocket url code
