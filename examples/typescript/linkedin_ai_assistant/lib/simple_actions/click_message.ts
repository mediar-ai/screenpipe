import { Page } from 'puppeteer-core';
import { setupBrowser } from './browser_setup';
import { showClickAnimation } from './click_animation';

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
        
        console.log('message modal opened and verified');
    } catch (e) {
        console.error('failed to click message button or open modal:', e);
        throw e;
    }
}
// add main function to test
// async function main() {
//     try {
//         const { browser, page } = await setupBrowser();
//         console.log('starting message button test');
        
//         await clickFirstMessageButton(page);
        
//         // wait a bit to see the results
//         await new Promise(r => setTimeout(r, 2000));
        
//         await browser.close();
//         console.log('test completed');
//     } catch (e) {
//         console.error('test failed:', e);
//         // process.exit(1);
//     }
// }

// // run if this file is being executed directly
// if (require.main === module) {
//     main();
// }

