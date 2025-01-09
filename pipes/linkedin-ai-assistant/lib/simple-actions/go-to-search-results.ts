import { Page } from 'puppeteer-core';

export async function navigateToSearch(page: Page, url: string, options?: { allowTruncate?: boolean }): Promise<{ count: number }> {
    console.log('navigating to linkedin search...');

    await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });

    console.log('page loaded');

    // Check if LinkedIn requires sign-in
    const isSignInPage = await page.evaluate(() => {
        return !!document.querySelector('.sign-in-form');
    });

    if (isSignInPage) {
        throw new Error('linkedin requires sign in');
    }

    // Wait for search results to load
    await page.waitForSelector('.search-results-container', { timeout: 10000 })
        .catch(() => {
            console.log('search results container not found, proceeding anyway');
        });

    // Extract the results count
    const count = await page.evaluate(() => {
        // Try to find the element that contains the results count
        const resultTextElement = document.querySelector('h2.pb2.t-black--light.t-14') ||
                                  document.querySelector('h2') ||
                                  document.querySelector('.display-flex.t-12.t-black--light.t-normal');

        if (resultTextElement) {
            const text = resultTextElement.textContent || '';
            const match = text.match(/\d+(,\d+)*/);
            if (match) {
                return parseInt(match[0].replace(/,/g, ''), 10);
            }
        }
        return 0;
    });

    console.log(`found ${count} results`);

    if (count > 100 && !options?.allowTruncate) {
        throw new Error(`too many results: ${count} (limit: 100). please refine your search`);
    }

    return { count };
}

