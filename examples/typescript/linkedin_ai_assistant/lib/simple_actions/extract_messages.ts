import { Page } from 'puppeteer-core';
import { Message } from '../storage/types';
import { standardizeTimestamps } from './standardize_timestamp_in_messages';

export async function getMessages(page: Page): Promise<Message[]> {
    try {
        // First check if this is a new message dialogue
        const isNewMessage = await page.evaluate(() => {
            const header = document.querySelector('.msg-overlay-bubble-header__title');
            return header?.textContent?.trim() === 'New message';
        });

        if (isNewMessage) {
            console.log('detected new message dialogue, no messages to export');
            return [];
        }

        // If not a new message, proceed with existing message extraction logic
        const rawMessages = await page.evaluate(() => {
            // Try to get all text content from the message window for debugging
            const messageContainer = document.querySelector('.msg-conversation-listitem');
            if (messageContainer) {
                console.log('found container:', messageContainer.textContent);
            }

            const messageElements = document.querySelectorAll('.msg-s-message-list__event');
            return Array.from(messageElements).map(el => {
                const msg = {
                    text: el.querySelector('.msg-s-event-listitem__body')?.textContent?.trim() || '',
                    timestamp: el.querySelector('time')?.textContent?.trim(),
                    sender: el.querySelector('.t-14.t-bold')?.textContent?.trim()
                };
                console.log('found message:', msg);
                return msg;
            });
        });

        // standardize timestamps before returning
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
