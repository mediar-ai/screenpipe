import puppeteer, { Browser, Page } from 'puppeteer-core';

let activeBrowser: { browser: Browser; page: Page } | null = null;

export async function setupBrowser(wsUrl: string): Promise<{ browser: Browser; page: Page }> {
    try {
        const browser = await puppeteer.connect({
            browserWSEndpoint: wsUrl,
            defaultViewport: null,
        });
        console.log('browser connected');

        const pages = await browser.pages();
        const page = pages[0];
        if (!page) {
            throw new Error('no active page found');
        }
        console.log('got active page');

        activeBrowser = { browser, page };
        return activeBrowser;
    } catch (error) {
        console.error('failed to connect to chrome:', error);
        if (process.env.NODE_ENV === 'production') {
            throw new Error('failed to connect to chrome in production');
        }
        throw error;
    }
}

export function getActiveBrowser(): { browser: Browser | null; page: Page | null } {
    return activeBrowser || { browser: null, page: null };
}

export async function quitBrowser() {
    if (activeBrowser) {
        await activeBrowser.browser.disconnect();
        activeBrowser = null;
        console.log('browser session cleared');
    }
}