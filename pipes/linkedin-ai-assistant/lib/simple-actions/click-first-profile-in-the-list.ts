import { Page } from 'puppeteer-core';
import { showClickAnimation } from './click-animation';

export async function clickFirstProfile(page: Page) {
    try {
        // Wait for the list and first profile link to be available
        const profileSelector = 'ul[role="list"] li:first-child .t-16 a[data-test-app-aware-link]';
        await page.waitForSelector(profileSelector, { timeout: 5000 });
        console.log('found first profile link');
        
        await showClickAnimation(page, profileSelector);
        await page.click(profileSelector);
        console.log('clicked first profile link');

        // Wait for profile page to load (indicated by h1 presence)
        await page.waitForSelector('h1', { timeout: 5000 });
        console.log('profile page loaded');
    } catch (e) {
        console.error('failed to click first profile:', e);
    }
}
