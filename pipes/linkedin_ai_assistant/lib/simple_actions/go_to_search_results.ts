import { Page } from 'puppeteer-core';

export async function navigateToSearch(page: Page, url: string) {
    console.log('navigating to linkedin search...');
    await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
    });

    console.log('page loaded, waiting for results...');
    await page.waitForSelector('.search-results-container');
}

