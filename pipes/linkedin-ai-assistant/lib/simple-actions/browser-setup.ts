import puppeteer, { Browser, Page } from 'puppeteer-core';

export async function setupBrowser(): Promise<{ browser: Browser; page: Page }> {
    const browser = await puppeteer.connect({
        browserWSEndpoint: 'ws://127.0.0.1:9222/devtools/browser/a9aa5499-6fd8-4271-99f6-aad696018cfa',
        defaultViewport: null,
    });
    console.log('browser connected');

    const pages = await browser.pages();
    const page = pages[0];
    console.log('got active page');

    return { browser, page };
}