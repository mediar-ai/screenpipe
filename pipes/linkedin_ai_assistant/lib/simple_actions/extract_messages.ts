import { Page } from 'puppeteer-core';
import { Message } from '../storage/types';
import { standardizeTimestamps } from './standardize_timestamp_in_messages';

export async function getMessages(page: Page): Promise<Message[]> {
    try {
        // First check if this is a new message dialogue
        const isNewMessage = await page.evaluate(() => {
            const header = document.querySelector('.msg-overlay-bubble-header__title');
            const headerText = header?.textContent?.trim();
            console.log('message dialog header:', headerText);
            return headerText === 'New message';
        });

        if (isNewMessage) {
            console.log('detected new message dialogue, no messages to export');
            return [];
        }

        // Proceed with existing message extraction logic
        const rawMessages = await page.evaluate(() => {
            // Log the entire message container
            const messageContainer = document.querySelector('.msg-s-message-list');
            if (messageContainer) {
                console.log('message container HTML:', messageContainer.innerHTML);
            } else {
                console.log('message container not found');
            }

            const messageElements = document.querySelectorAll('.msg-s-message-list__event');
            console.log(`found ${messageElements.length} message events`);

            return Array.from(messageElements).map(el => {
                const text = el.querySelector('.msg-s-event-listitem__body')?.textContent?.trim() || '';
                const timestamp = el.querySelector('time')?.textContent?.trim();
                const sender = el.querySelector('.msg-s-event-listitem__name')?.textContent?.trim();
                const msg = { text, timestamp, sender };
                console.log('found message:', msg);
                return msg;
            });
        });

        // Standardize timestamps before returning
        const messages = standardizeTimestamps(rawMessages);
        console.log('standardized messages:', JSON.stringify(messages, null, 2));
        return messages;

    } catch (e) {
        console.error('failed to get messages:', e);
        return [];
    }
}

// test the functions
if (require.main === module) {
    async function test() {
        try {
            const { setupBrowser } = require('./browser_setup');
            const { browser, page } = await setupBrowser();
            console.log('connected to browser');

            const messages = await getMessages(page);

            await browser.disconnect();
        } catch (e) {
            console.error('test failed:', e);
        }
    }

    test();
}
