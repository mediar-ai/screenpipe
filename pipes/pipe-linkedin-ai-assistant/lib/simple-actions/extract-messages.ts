import { Page } from 'puppeteer-core';
import { Message } from '../storage/types';
import { standardizeTimestamps } from './standardize-timestamp-in-messages';

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
            const messageElements = document.querySelectorAll('.msg-s-message-list__event');
            console.log(`found ${messageElements.length} message events`);

            let lastSender: string | null = null;
            let lastTimestamp: string | null = null;
            return Array.from(messageElements).map(el => {
                // Try multiple selectors for sender
                const senderSelectors = [
                    '.msg-s-event-listitem__name',
                    '.t-14.t-bold',
                    '[data-anonymize="person-name"]',
                ];

                let sender = null;
                for (const selector of senderSelectors) {
                    const senderEl = el.querySelector(selector);
                    if (senderEl) {
                        sender = senderEl.textContent?.trim();
                        break;
                    }
                }

                if (!sender) {
                    sender = lastSender;
                } else {
                    lastSender = sender;
                }

                // Get raw timestamp parts
                const timeEl = el.querySelector('.msg-s-message-group__timestamp');
                const dateEl = el.querySelector('time');
                let timestamp = null;

                if (timeEl && dateEl) {
                    const time = timeEl.textContent?.trim() || '';
                    const date = dateEl.textContent?.trim() || '';
                    timestamp = `${date} ${time}`.trim();
                }

                if (!timestamp) {
                    timestamp = lastTimestamp;
                }
                lastTimestamp = timestamp;

                const text = el.querySelector('.msg-s-event-listitem__body')?.textContent?.trim() || '';
                const msg = { text, timestamp, sender };
                console.log('found message:', msg);
                return msg;
            });
        });

        // Standardize timestamps before returning
        const messages = standardizeTimestamps(rawMessages as Message[]);
        console.log('standardized messages:', JSON.stringify(messages, null, 2));
        return messages;

    } catch (e) {
        console.error('failed to get messages:', e);
        return [];
    }
}

// test the functions
if (require.main === module) {
    const test = async () => {
        try {
            const { setupBrowser, getActiveBrowser } = await import('../browser-setup');
            await setupBrowser();
            const { browser, page } = getActiveBrowser();
            if (!page) throw new Error('no active page');
            if (!browser) throw new Error('no active browser');
            console.log('connected to browser');

            await getMessages(page);

            await browser.disconnect();
        } catch (error) {
            console.error('test failed:', error);
        }
    };

    test();
}
