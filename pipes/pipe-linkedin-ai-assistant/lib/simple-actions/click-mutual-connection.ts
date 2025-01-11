import { Page } from 'puppeteer-core';
import { showClickAnimation } from './click-animation';

export async function clickMutualConnections(page: Page) {
    try {
        const mutualSelector = 'a[href*="facetNetwork"][href*="facetConnectionOf"]';
        await page.waitForSelector(mutualSelector, { timeout: 5000 });
        console.log('found mutual connections link');
        
        await showClickAnimation(page, mutualSelector);
        await page.click(mutualSelector);
        console.log('clicked mutual connections');

        await page.waitForSelector('.search-results-container', { timeout: 5000 });
        console.log('mutual connections page loaded');
    } catch (e) {
        console.error('failed to click mutual connections:', e);
    }
}
