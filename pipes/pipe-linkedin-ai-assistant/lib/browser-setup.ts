import puppeteer, { Browser, Page } from 'puppeteer-core';

let activeBrowser: Browser | null = null;
let activePage: Page | null = null;

export async function setupBrowser(): Promise<{ browser: Browser; page: Page }> {
    if (!activeBrowser) {
        let retries = 5;
        let lastError;
        
        while (retries > 0) {
            try {
                const response = await fetch('http://127.0.0.1:9222/json/version');
                if (!response.ok) {
                    throw new Error('failed to get fresh websocket url');
                }
                const data = await response.json() as { webSocketDebuggerUrl: string };
                const freshWsUrl = data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');
                
                console.log('attempting connection with fresh ws url:', freshWsUrl);
                
                activeBrowser = await puppeteer.connect({
                    browserWSEndpoint: freshWsUrl,
                    defaultViewport: null,
                });
                
                console.log('browser connected to:', freshWsUrl);

                const pages = await activeBrowser.pages();
                if (!pages.length) {
                    throw new Error('no pages available');
                }
                activePage = pages[0];
                console.log('got active page');
                break;
            } catch (error) {
                lastError = error;
                console.error(`connection attempt ${6 - retries} failed:`, error);
                retries--;
                if (retries > 0) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        if (!activeBrowser) {
            throw new Error(`failed to connect to browser after 5 attempts: ${lastError}`);
        }
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
        try {
            await activeBrowser.disconnect();
        } catch (error) {
            console.error('error disconnecting browser:', error);
        }
        activeBrowser = null;
        activePage = null;
        console.log('browser session cleared');
    }
}