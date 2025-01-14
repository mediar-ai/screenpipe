import puppeteer, { Browser, Page } from 'puppeteer-core';
import { ChromeSession } from './chrome-session';

let activeBrowser: Browser | null = null;
let activePage: Page | null = null;

// Export this function so it can be used elsewhere if needed
export async function getDebuggerUrl(): Promise<string> {
    const response = await fetch('http://127.0.0.1:9222/json/version');
    if (!response.ok) {
        throw new Error('failed to get fresh websocket url');
    }
    const data = await response.json() as { webSocketDebuggerUrl: string };
    return data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');
}

// we rely on an existing or newly launched chrome instance
export async function setupBrowser(): Promise<{ browser: Browser; page: Page }> {
    if (!activeBrowser) {
        const session = ChromeSession.getInstance();
        const wsUrl = session.getWsUrl() || await getDebuggerUrl();
        
        let retries = 5;
        let lastError;
        
        while (retries > 0) {
            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                activeBrowser = await puppeteer.connect({
                    browserWSEndpoint: wsUrl,
                    defaultViewport: null,
                });
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                const pages = await activeBrowser.pages();
                
                if (!pages.length) {
                    throw new Error('no pages available');
                }
                activePage = pages[0];
                session.setActivePage(activePage);
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
    const session = ChromeSession.getInstance();
    return { 
        browser: activeBrowser, 
        page: session.getActivePage() || activePage 
    };
}

// used to disconnect puppeteer if desired
export async function quitBrowser() {
    ChromeSession.getInstance().clear();
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