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
exports.closeAllMessageDialogues = closeAllMessageDialogues;
const click_animation_1 = require("./click-animation");
function closeAllMessageDialogues(page) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Wait for any dialogues to be visible
            yield new Promise(r => setTimeout(r, 2000)); // wait 2 seconds for dialogues to render
            // Get all potential close buttons
            const closeButtonSelector = 'button.msg-overlay-bubble-header__control';
            const buttons = yield page.$$(closeButtonSelector);
            console.log(`found ${buttons.length} potential close buttons`);
            if (buttons.length === 0) {
                console.log('no close buttons found');
                return;
            }
            let dialoguesClosed = 0;
            // Iterate over buttons and click the ones that close conversations
            for (const button of buttons) {
                const buttonText = yield page.evaluate((el) => { var _a; return ((_a = el.querySelector('.artdeco-button__text')) === null || _a === void 0 ? void 0 : _a.textContent) || ''; }, button);
                if (buttonText.includes('Close your conversation with')) {
                    yield (0, click_animation_1.showClickAnimation)(page, button);
                    yield button.click();
                    dialoguesClosed++;
                    console.log(`closed a dialogue: ${buttonText.trim()}`);
                }
            }
            if (dialoguesClosed === 0) {
                console.log('no open message dialogues to close');
            }
            else {
                // Wait a bit for animations to complete
                yield new Promise(r => setTimeout(r, 1000));
                console.log(`successfully closed ${dialoguesClosed} message dialogues`);
            }
        }
        catch (e) {
            console.error('error closing message dialogues:', e);
            throw e;
        }
    });
}
// Test function
// async function main() {
//     const { setupBrowser } = await import('./browser_setup');
//     try {
//         const { browser, page } = await setupBrowser();
//         console.log('starting dialogue close test');
//         await closeAllMessageDialogues(page);
//         console.log('test completed, press ctrl+c to exit');
//         await new Promise(() => {}); // keep alive
//     } catch (e) {
//         console.error('test failed:', e);
//         process.exit(1);
//     }
// }
// if (require.main === module) {
//     main();
// }
