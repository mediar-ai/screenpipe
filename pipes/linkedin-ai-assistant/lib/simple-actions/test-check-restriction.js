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
const check_if_restricted_1 = require("./check-if-restricted");
const chrome_session_1 = require("../chrome-session");
function testCheckRestriction() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { browser, page } = yield (0, browser_setup_1.setupBrowser)();
            console.log('connected to browser');
            // Test on a known profile URL
            yield page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle0' });
            console.log('navigated to linkedin feed');
            // Check for restrictions
            const restrictionStatus = yield (0, check_if_restricted_1.checkIfRestricted)(page);
            if (restrictionStatus.isRestricted) {
                console.log('account is restricted!');
                console.log('end date:', restrictionStatus.restrictionEndDate);
                console.log('reason:', restrictionStatus.reason);
            }
            else {
                console.log('account is not restricted');
            }
            // Wait a bit to see the results visually
            yield new Promise(r => setTimeout(r, 2000));
            yield browser.disconnect();
            console.log('browser disconnected');
        }
        catch (e) {
            console.error('test failed:', e);
        }
        finally {
            // Clear the chrome session
            chrome_session_1.ChromeSession.getInstance().clear();
        }
    });
}
testCheckRestriction();
