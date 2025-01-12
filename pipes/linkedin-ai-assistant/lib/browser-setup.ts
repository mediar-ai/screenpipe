import puppeteer, { Browser, Page } from 'puppeteer-core';

let activeBrowser: Browser | null = null;
let activePage: Page | null = null;

// we rely on an existing or newly launched chrome instance
export async function setupBrowser(): Promise<{ browser: Browser; page: Page }> {
    if (!activeBrowser) {
        let retries = 5;
        let lastError;
        
        while (retries > 0) {
            try {
                // fetch the debug url
                const response = await fetch('http://127.0.0.1:9222/json/version');
                if (!response.ok) {
                    throw new Error('failed to get fresh websocket url');
                }
                const data = await response.json() as { webSocketDebuggerUrl: string };
                // use replacement for 'ws://localhost' to ensure 127.0.0.1
                const freshWsUrl = data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');
                
                // small delay for stability
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // connect puppeteer
                activeBrowser = await puppeteer.connect({
                    browserWSEndpoint: freshWsUrl,
                    defaultViewport: null,
                });
                
                // another delay for stability
                await new Promise(resolve => setTimeout(resolve, 1000));
                const pages = await activeBrowser.pages();
                
                if (!pages.length) {
                    throw new Error('no pages available');
                }
                activePage = pages[0];
                console.log('browser setup complete');
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

// helper to return the active browser and page
export function getActiveBrowser() {
    return { browser: activeBrowser, page: activePage };
}

// used to disconnect puppeteer if desired
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