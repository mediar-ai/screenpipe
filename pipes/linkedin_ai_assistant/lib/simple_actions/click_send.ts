import { Page } from 'puppeteer-core';
import { showClickAnimation } from './click_animation';

export async function clickSend(page: Page) {
    try {
        const sendButtonSelector = 'button.msg-form__send-button[type="submit"]';
        await page.waitForSelector(sendButtonSelector);
        console.log('found send button');

        await showClickAnimation(page, sendButtonSelector);
        
        await page.keyboard.down('Control');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Control');
        console.log('sent message via Ctrl+Enter');
    } catch (e) {
        console.error('failed to click send button:', e);
    }
}
