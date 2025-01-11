import { Page } from 'puppeteer-core';
import { showClickAnimation } from './click-animation';

export async function clickFirstMessageButton(page: Page) {
    try {
        // First, let's log all buttons with their attributes to debug
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            console.log('all buttons:', Array.from(buttons).map(b => ({
                text: b.textContent?.trim(),
                ariaLabel: b.getAttribute('aria-label'),
                classes: b.className,
                hasIcon: !!b.querySelector('svg[data-test-icon="send-privately-small"]')
            })));
        });

        // The data-test-icon is on the SVG, not the button
        const messageButtonSelector = 'button.artdeco-button--primary svg[data-test-icon="send-privately-small"]';
        
        await page.waitForSelector(messageButtonSelector, { timeout: 5000 });
        console.log('found message button');
        
        await showClickAnimation(page, messageButtonSelector);
        
        // Click the parent button of the SVG
        await page.evaluate((selector) => {
            const svg = document.querySelector(selector);
            const button = svg?.closest('button');
            if (button) button.click();
        }, messageButtonSelector);
        
        console.log('clicked message button');

        const modalSelector = '.msg-form';
        await page.waitForSelector(modalSelector, { 
            timeout: 10000,
            visible: true
        });
        
        const isModalVisible = await page.evaluate((selector) => {
            const modal = document.querySelector(selector);
            return modal && window.getComputedStyle(modal).display !== 'none';
        }, modalSelector);

        if (!isModalVisible) {
            throw new Error('message modal not visible after click');
        }
        
        // wait for message dialog title to appear
        await page.waitForSelector('.msg-overlay-bubble-header__title', { timeout: 5000 });
        console.log('message modal opened and verified');
        
        // Try to wait for either message list or compose window
        await Promise.race([
            page.waitForSelector('.msg-s-message-list__event', { timeout: 5000 })
                .then(() => console.log('existing messages loaded')),
            page.waitForSelector('.msg-form__contenteditable', { timeout: 5000 })
                .then(() => console.log('new message compose window loaded'))
        ]);
        
        // Verify we're in either state
        const state = await page.evaluate(() => {
            return {
                hasMessageList: !!document.querySelector('.msg-s-message-list__event'),
                hasComposeWindow: !!document.querySelector('.msg-form__contenteditable')
            };
        });
        
        if (!state.hasMessageList && !state.hasComposeWindow) {
            throw new Error('neither message list nor compose window found');
        }
        
    } catch (e) {
        console.error('failed to click message button or open modal:', e);
        throw e;
    }
}
