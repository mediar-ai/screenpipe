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
exports.clickFirstMessageButton = clickFirstMessageButton;
const click_animation_1 = require("./click-animation");
function clickFirstMessageButton(page) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // First, let's log all buttons with their attributes to debug
            yield page.evaluate(() => {
                const buttons = document.querySelectorAll('button');
                console.log('all buttons:', Array.from(buttons).map(b => {
                    var _a;
                    return ({
                        text: (_a = b.textContent) === null || _a === void 0 ? void 0 : _a.trim(),
                        ariaLabel: b.getAttribute('aria-label'),
                        classes: b.className,
                        hasIcon: !!b.querySelector('svg[data-test-icon="send-privately-small"]')
                    });
                }));
            });
            // The data-test-icon is on the SVG, not the button
            const messageButtonSelector = 'button.artdeco-button--primary svg[data-test-icon="send-privately-small"]';
            yield page.waitForSelector(messageButtonSelector, { timeout: 5000 });
            console.log('found message button');
            yield (0, click_animation_1.showClickAnimation)(page, messageButtonSelector);
            // Click the parent button of the SVG
            yield page.evaluate((selector) => {
                const svg = document.querySelector(selector);
                const button = svg === null || svg === void 0 ? void 0 : svg.closest('button');
                if (button)
                    button.click();
            }, messageButtonSelector);
            console.log('clicked message button');
            const modalSelector = '.msg-form';
            yield page.waitForSelector(modalSelector, {
                timeout: 10000,
                visible: true
            });
            const isModalVisible = yield page.evaluate((selector) => {
                const modal = document.querySelector(selector);
                return modal && window.getComputedStyle(modal).display !== 'none';
            }, modalSelector);
            if (!isModalVisible) {
                throw new Error('message modal not visible after click');
            }
            // wait for message dialog title to appear
            yield page.waitForSelector('.msg-overlay-bubble-header__title', { timeout: 5000 });
            console.log('message modal opened and verified');
            // Try to wait for either message list or compose window
            yield Promise.race([
                page.waitForSelector('.msg-s-message-list__event', { timeout: 5000 })
                    .then(() => console.log('existing messages loaded')),
                page.waitForSelector('.msg-form__contenteditable', { timeout: 5000 })
                    .then(() => console.log('new message compose window loaded'))
            ]);
            // Verify we're in either state
            const state = yield page.evaluate(() => {
                return {
                    hasMessageList: !!document.querySelector('.msg-s-message-list__event'),
                    hasComposeWindow: !!document.querySelector('.msg-form__contenteditable')
                };
            });
            if (!state.hasMessageList && !state.hasComposeWindow) {
                throw new Error('neither message list nor compose window found');
            }
        }
        catch (e) {
            console.error('failed to click message button or open modal:', e);
            throw e;
        }
    });
}
