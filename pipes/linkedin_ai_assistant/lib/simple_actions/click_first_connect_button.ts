import { Page } from 'puppeteer-core';
import { showClickAnimation } from './click_animation';

export async function clickFirstConnectButton(page: Page): Promise<{ 
    success: boolean; 
    profileUrl?: string;
    weeklyLimitReached?: boolean;
}> {
    try {
        // Check if connect button exists with specific text and aria-label pattern
        const connectButtonSelector = 'button[aria-label^="Invite"][aria-label$="to connect"]';
        const connectButton = await page.$(connectButtonSelector);
        
        if (!connectButton) {
            console.log('no connect button found on this page');
            return { success: false };
        }

        // Get profile URL before clicking connect
        const profileUrl = await page.evaluate(() => {
            const link = document.querySelector('a.EvQUJBaxIRgFetdTQjAXvpGhCNvVbYEbE');
            return link?.href;
        });

        console.log('found connect button');

        // Click the connect button with animation
        await showClickAnimation(page, connectButtonSelector);
        await page.click(connectButtonSelector);
        console.log('clicked connect button');

        // Wait for the connect modal
        await page.waitForSelector('.artdeco-modal[role="dialog"]', { timeout: 5000 });
        console.log('connect modal appeared');

        // Click "Send without a note" button
        const sendWithoutNoteSelector = 'button[aria-label="Send without a note"]';
        await page.waitForSelector(sendWithoutNoteSelector, { timeout: 5000 });
        await showClickAnimation(page, sendWithoutNoteSelector);
        await page.click(sendWithoutNoteSelector);
        console.log('clicked send without note');

        // Now check for weekly limit modal
        try {
            const weeklyLimitHeader = await page.waitForSelector('h2#ip-fuse-limit-alert__header', { timeout: 1000 });
            if (weeklyLimitHeader) {
                console.log('weekly invitation limit reached');
                
                // Click the "Got it" button
                const gotItButtonSelector = 'button[aria-label="Got it"]';
                await page.waitForSelector(gotItButtonSelector, { timeout: 5000 });
                await showClickAnimation(page, gotItButtonSelector);
                await page.click(gotItButtonSelector);
                console.log('clicked got it button');
                return { success: false, weeklyLimitReached: true };
            }
        } catch {
            // No weekly limit modal appeared, connection was successful
            return { success: true, profileUrl };
        }

        return { success: true, profileUrl };
    } catch (e) {
        console.error('failed to click connect button:', e);
        return { success: false };
    }
}
