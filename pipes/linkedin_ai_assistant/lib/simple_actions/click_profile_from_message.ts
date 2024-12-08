import { Page } from 'puppeteer-core';
import { showClickAnimation } from './click_animation';

export async function clickProfileFromMessage(page: Page) {
    try {
        const profileSelector = 'a.profile-card-one-to-one__profile-link';
        await page.waitForSelector(profileSelector, { timeout: 5000 });
        console.log('found profile link');
        
        await showClickAnimation(page, profileSelector);
        await page.click(profileSelector);
        console.log('clicked profile link');

        await page.waitForSelector('h1', { timeout: 5000 });
        console.log('profile page loaded');
    } catch (e) {
        console.error('failed to click profile link:', e);
    }
}
