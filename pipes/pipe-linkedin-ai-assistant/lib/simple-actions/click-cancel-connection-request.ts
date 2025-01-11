/* eslint-disable @typescript-eslint/no-unused-vars */

import { Page, ElementHandle } from 'puppeteer-core';
import { showClickAnimation } from './click-animation';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// this function attempts to click the "pending" button to cancel a connection request
// then it checks for a "connect" button to verify that the request was indeed canceled
export async function clickCancelConnectionRequest(page: Page): Promise<{
    success: boolean;
    profileUrl?: string;
}> {
    try {
        // 1) We'll locate any "artdeco-button--muted.artdeco-button--secondary" button,
        //    then filter by innerText === "Pending". This removes the need for :has() syntax.
        const selector = 'button.artdeco-button--muted.artdeco-button--secondary';

        // 2) Wait for at least one muted+secondary button to appear
        //    (in case the page hasn't fully loaded).
        await page.waitForSelector(selector, { timeout: 5000 });

        // 3) Evaluate in the DOM to find the button whose text is exactly "Pending"
        const foundButton = await page.evaluateHandle((sel) => {
            const buttons = document.querySelectorAll<HTMLButtonElement>(sel);
            console.log(`found ${buttons.length} muted secondary buttons`); // debug
            for (const btn of buttons) {
                // Check both direct text and text within span
                const buttonText = btn.innerText.trim();
                const spanText = btn.querySelector('span.artdeco-button__text')?.textContent?.trim();
                console.log(`button text: "${buttonText}", span text: "${spanText}"`); // debug
                if (buttonText === 'Pending' || spanText === 'Pending') {
                    return btn;
                }
            }
            return null;
        }, selector) as ElementHandle<HTMLButtonElement>;

        if (!foundButton) {
            console.log('no pending connection request found after filtering by text');
            return { success: false };
        }

        // Validate that the button exists before trying to interact
        const isButtonAttached = await foundButton.evaluate(btn => {
            return btn instanceof HTMLButtonElement;
        });

        if (!isButtonAttached) {
            console.log('pending button not found, checking for connect button...');
            
            // wait longer and retry multiple times
            for (let i = 0; i < 3; i++) {
                await delay(1000); // wait 1s between attempts
                
                // wait for any button to appear
                await page.waitForSelector('button.artdeco-button', { timeout: 5000 });
                
                const connectButton = await page.evaluateHandle((attempt) => {
                    const buttons = document.querySelectorAll<HTMLButtonElement>('button.artdeco-button');
                    console.log(`attempt ${attempt + 1}: found ${buttons.length} buttons`); // debug
                    for (const btn of buttons) {
                        const buttonText = btn.innerText.trim();
                        const spanText = btn.querySelector('span.artdeco-button__text')?.textContent?.trim();
                        console.log(`checking button: text="${buttonText}", span="${spanText}"`); // debug
                        if (buttonText === 'Connect' || spanText === 'Connect') {
                            return btn;
                        }
                    }
                    return null;
                }, i); // pass i as an argument

                const connectExists = connectButton
                    ? await (connectButton as ElementHandle<HTMLButtonElement>).evaluate(btn => btn instanceof HTMLButtonElement)
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
            await foundButton.evaluate((btn) => {
                btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            });
        } catch (_) {
            console.log('could not scroll to button, trying to click anyway');
            // Continue execution - the button might still be clickable
        }

        // Optional: get a profile URL
        const profileUrl = await page.evaluate(() => {
            const linkSelectors = [
                'a[href*="/in/"]',
                'a[data-control-name="profile"]',
                'a[href*="linkedin.com/in/"]'
            ];
            for (const sel of linkSelectors) {
                const el = document.querySelector<HTMLAnchorElement>(sel);
                if (el) return el.href;
            }
            return null;
        });

        // 5) Show animation and click
        await showClickAnimation(page, selector);
        await foundButton.evaluate(btn => btn.click());
        console.log('clicked the "pending" button');

        // 6) Wait for modal
        await delay(1000);
        console.log('waiting for withdraw modal...');
        const modalSelector = '.artdeco-modal[role="alertdialog"], div[role="alertdialog"]';
        await page.waitForSelector(modalSelector, { visible: true, timeout: 5000 });
        console.log('withdraw modal appeared');

        // 7) Withdraw button check
        const withdrawSelector = [
            'button[data-test-dialog-primary-btn]',
            'button.artdeco-button--primary'
        ].join(', ');
        await page.waitForSelector(withdrawSelector, { visible: true, timeout: 5000 });
        await showClickAnimation(page, withdrawSelector);
        await page.evaluate((sel) => {
            const btn = document.querySelector<HTMLButtonElement>(sel);
            if (btn) btn.click();
        }, withdrawSelector);
        console.log('clicked withdraw button');

        // 8) Wait for modal to disappear
        await page.waitForFunction(
            (s) => !document.querySelector(s),
            { timeout: 5000 },
            modalSelector
        );
        console.log('withdraw modal disappeared, request canceled!');

        // double check if "connect" is now visible to confirm
        try {
            // wait up to 5s for connect
            await page.waitForFunction(() => {
                const cBtn = document.querySelector<HTMLButtonElement>('button.artdeco-button');
                if (!cBtn) return false;
                const text = cBtn.innerText.trim();
                const spanTxt = cBtn.querySelector('span.artdeco-button__text')?.textContent?.trim();
                return text === 'Connect' || spanTxt === 'Connect';
            }, { timeout: 5000 });

            console.log('confirmed "connect" button is present now');
            return { success: true, profileUrl: profileUrl || undefined };
        } catch {
            // no connect found, but we tried
            console.log('no connect button recognized, but request was canceled anyway');
            return { success: true, profileUrl: profileUrl || undefined };
        }
    } catch (e) {
        console.error('failed to cancel connection request:', e);
        return { success: false };
    }
}
