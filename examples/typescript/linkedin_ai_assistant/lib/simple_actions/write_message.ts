import { Page } from 'puppeteer-core';

export async function writeMessage(page: Page, message: string, maxRetries = 2) {
    let attempts = 0;
    
    while (attempts <= maxRetries) {
        try {
            const messageSelector = 'div[role="textbox"][aria-label="Write a message…"]';
            await page.waitForSelector(messageSelector, { timeout: 5000 });
            console.log('found message input');

            // Simulate paste event to insert the message
            await page.evaluate((selector, text) => {
                const element = document.querySelector(selector) as HTMLElement;
                if (element) {
                    element.focus();
                    const clipboardData = new DataTransfer();
                    clipboardData.setData('text/plain', text);

                    const pasteEvent = new ClipboardEvent('paste', {
                        clipboardData,
                        bubbles: true,
                        cancelable: true
                    });

                    element.dispatchEvent(pasteEvent);
                }
            }, messageSelector, message);

            // Verify the message was written
            const content = await page.evaluate((selector) => {
                const element = document.querySelector(selector);
                return element?.textContent || '';
            }, messageSelector);

            if (!content.includes(message)) {
                throw new Error('message was not written correctly');
            }

            console.log('message written and verified');
            return; // Success - exit function
            
        } catch (e) {
            attempts++;
            if (attempts > maxRetries) {
                console.error(`failed to write message after ${maxRetries + 1} attempts:`, e);
                throw e;
            }
            console.log(`retry attempt ${attempts}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between retries
        }
    }
}
