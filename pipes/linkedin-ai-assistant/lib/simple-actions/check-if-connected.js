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
exports.checkIfConnected = checkIfConnected;
function checkIfConnected(page) {
    return __awaiter(this, void 0, void 0, function* () {
        // Look for both Connect and Message buttons
        const buttons = yield page.$$('button');
        for (const button of buttons) {
            const text = yield button.evaluate(el => { var _a; return (_a = el.textContent) === null || _a === void 0 ? void 0 : _a.trim(); });
            if (text === 'Connect') {
                console.log('found connect button, not connected');
                return false;
            }
            if (text === null || text === void 0 ? void 0 : text.includes('Message')) {
                console.log('found message button, already connected');
                return true;
            }
        }
        // If neither button is found, log warning and assume not connected
        console.log('warning: could not determine connection status, assuming not connected');
        return false;
    });
}
// usage example with click_message:
/*
async function handleProfile(page: Page) {
    const isConnected = await checkIfConnected(page);
    
    if (!isConnected) {
        console.log('skipping profile - not connected');
        return;
    }
    
    await clickFirstMessageButton(page);
}
*/
