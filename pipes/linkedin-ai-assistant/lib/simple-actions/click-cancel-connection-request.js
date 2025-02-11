"use strict";
/* eslint-disable @typescript-eslint/no-unused-vars */
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
exports.clickCancelConnectionRequest = clickCancelConnectionRequest;
const click_animation_1 = require("./click-animation");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// this function attempts to click the "pending" button to cancel a connection request
// then it checks for a "connect" button to verify that the request was indeed canceled
function clickCancelConnectionRequest(page) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // 1) We'll locate any "artdeco-button--muted.artdeco-button--secondary" button,
            //    then filter by innerText === "Pending". This removes the need for :has() syntax.
            const selector = 'button.artdeco-button--muted.artdeco-button--secondary';
            // 2) Wait for at least one muted+secondary button to appear
            //    (in case the page hasn't fully loaded).
            yield page.waitForSelector(selector, { timeout: 5000 });
            // 3) Evaluate in the DOM to find the button whose text is exactly "Pending"
            const foundButton = yield page.evaluateHandle((sel) => {
                var _a, _b;
                const buttons = document.querySelectorAll(sel);
                console.log(`found ${buttons.length} muted secondary buttons`); // debug
                for (const btn of buttons) {
                    // Check both direct text and text within span
                    const buttonText = btn.innerText.trim();
                    const spanText = (_b = (_a = btn.querySelector('span.artdeco-button__text')) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim();
                    console.log(`button text: "${buttonText}", span text: "${spanText}"`); // debug
                    if (buttonText === 'Pending' || spanText === 'Pending') {
                        return btn;
                    }
                }
                return null;
            }, selector);
            if (!foundButton) {
                console.log('no pending connection request found after filtering by text');
                return { success: false };
            }
            // Validate that the button exists before trying to interact
            const isButtonAttached = yield foundButton.evaluate(btn => {
                return btn instanceof HTMLButtonElement;
            });
            if (!isButtonAttached) {
                console.log('pending button not found, checking for connect button...');
                // wait longer and retry multiple times
                for (let i = 0; i < 3; i++) {
                    yield delay(1000); // wait 1s between attempts
                    // wait for any button to appear
                    yield page.waitForSelector('button.artdeco-button', { timeout: 5000 });
                    const connectButton = yield page.evaluateHandle((attempt) => {
                        var _a, _b;
                        const buttons = document.querySelectorAll('button.artdeco-button');
                        console.log(`attempt ${attempt + 1}: found ${buttons.length} buttons`); // debug
                        for (const btn of buttons) {
                            const buttonText = btn.innerText.trim();
                            const spanText = (_b = (_a = btn.querySelector('span.artdeco-button__text')) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim();
                            console.log(`checking button: text="${buttonText}", span="${spanText}"`); // debug
                            if (buttonText === 'Connect' || spanText === 'Connect') {
                                return btn;
                            }
                        }
                        return null;
                    }, i); // pass i as an argument
                    const connectExists = connectButton
                        ? yield connectButton.evaluate(btn => btn instanceof HTMLButtonElement)
                        : false;
                    if (connectExists) {
                        console.log('found connect button - request was already cancelled');
                        return { success: true };
                    }
                    console.log(`attempt ${i + 1}: connect button not found, will retry...`);
                }
                console.log('no connect button found after 3 attempts');
                return { success: false };
            }
            // 4) Try to scroll and click, with error handling
            try {
                yield foundButton.evaluate((btn) => {
                    btn.scrollIntoView({ block: 'center', behavior: 'instant' });
                });
            }
            catch (_) {
                console.log('could not scroll to button, trying to click anyway');
                // Continue execution - the button might still be clickable
            }
            // Optional: get a profile URL
            const profileUrl = yield page.evaluate(() => {
                const linkSelectors = [
                    'a[href*="/in/"]',
                    'a[data-control-name="profile"]',
                    'a[href*="linkedin.com/in/"]'
                ];
                for (const sel of linkSelectors) {
                    const el = document.querySelector(sel);
                    if (el)
                        return el.href;
                }
                return null;
            });
            // 5) Show animation and click
            yield (0, click_animation_1.showClickAnimation)(page, selector);
            yield foundButton.evaluate(btn => btn.click());
            console.log('clicked the "pending" button');
            // 6) Wait for modal
            yield delay(1000);
            console.log('waiting for withdraw modal...');
            const modalSelector = '.artdeco-modal[role="alertdialog"], div[role="alertdialog"]';
            yield page.waitForSelector(modalSelector, { visible: true, timeout: 5000 });
            console.log('withdraw modal appeared');
            // 7) Withdraw button check
            const withdrawSelector = [
                'button[data-test-dialog-primary-btn]',
                'button.artdeco-button--primary'
            ].join(', ');
            yield page.waitForSelector(withdrawSelector, { visible: true, timeout: 5000 });
            yield (0, click_animation_1.showClickAnimation)(page, withdrawSelector);
            yield page.evaluate((sel) => {
                const btn = document.querySelector(sel);
                if (btn)
                    btn.click();
            }, withdrawSelector);
            console.log('clicked withdraw button');
            // 8) Wait for modal to disappear
            yield page.waitForFunction((s) => !document.querySelector(s), { timeout: 5000 }, modalSelector);
            console.log('withdraw modal disappeared, request canceled!');
            // double check if "connect" is now visible to confirm
            try {
                // wait up to 5s for connect
                yield page.waitForFunction(() => {
                    var _a, _b;
                    const cBtn = document.querySelector('button.artdeco-button');
                    if (!cBtn)
                        return false;
                    const text = cBtn.innerText.trim();
                    const spanTxt = (_b = (_a = cBtn.querySelector('span.artdeco-button__text')) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim();
                    return text === 'Connect' || spanTxt === 'Connect';
                }, { timeout: 5000 });
                console.log('confirmed "connect" button is present now');
                return { success: true, profileUrl: profileUrl || undefined };
            }
            catch (_a) {
                // no connect found, but we tried
                console.log('no connect button recognized, but request was canceled anyway');
                return { success: true, profileUrl: profileUrl || undefined };
            }
        }
        catch (e) {
            console.error('failed to cancel connection request:', e);
            return { success: false };
        }
    });
}
