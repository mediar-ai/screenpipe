import puppeteer, { Browser, Page } from 'puppeteer-core';

let activeBrowser: Browser | null = null;
let activePage: Page | null = null;

export async function setupBrowser(wsUrl: string): Promise<{ browser: Browser; page: Page }> {
    if (!activeBrowser) {
        activeBrowser = await puppeteer.connect({
            browserWSEndpoint: wsUrl,
            defaultViewport: null,
        });
        console.log('browser connected');

        const pages = await activeBrowser.pages();
        activePage = pages[0];
        console.log('got active page');
    }

    if (!activeBrowser || !activePage) {
        throw new Error('browser or page not initialized');
    }

    return { browser: activeBrowser, page: activePage };
}

export function getActiveBrowser() {
    return { browser: activeBrowser, page: activePage };
}

export async function quitBrowser() {
    if (activeBrowser) {
        await activeBrowser.disconnect();
        activeBrowser = null;
        activePage = null;
        console.log('browser session cleared');
    }
}