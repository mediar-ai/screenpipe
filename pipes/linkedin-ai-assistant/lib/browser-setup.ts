import puppeteer, { Browser, Page } from 'puppeteer-core';
import { ChromeSession } from './chrome-session';

let activeBrowser: Browser | null = null;
let activePage: Page | null = null;

// Export this function so it can be used elsewhere if needed
export async function getDebuggerUrl(): Promise<string> {
    console.log('attempting to get debugger url...');
    const response = await fetch('http://127.0.0.1:9222/json/version');
    if (!response.ok) {
        console.error('failed to get debugger url:', response.status, response.statusText);
        throw new Error('failed to get fresh websocket url');
    }
    const data = await response.json() as { webSocketDebuggerUrl: string };
    console.log('got debugger url:', data.webSocketDebuggerUrl);
    return data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');
}

// we rely on an existing or newly launched chrome instance
export async function setupBrowser(): Promise<{ browser: Browser; page: Page }> {
    console.log('setting up browser...');
    if (!activeBrowser) {
        const session = ChromeSession.getInstance();
        console.log('getting ws url...');
        const wsUrl = session.getWsUrl() || await getDebuggerUrl();
        console.log('using ws url:', wsUrl);
        
        let retries = 5;
        let lastError;
        
        while (retries > 0) {
            try {
                console.log(`connection attempt ${6 - retries}...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                activeBrowser = await puppeteer.connect({
                    browserWSEndpoint: wsUrl,
                    defaultViewport: null,
                });
                console.log('browser connected successfully');
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                const pages = await activeBrowser.pages();
                console.log(`found ${pages.length} pages`);
                
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
                    console.log(`retrying in 2s... (${retries} attempts left)`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        if (!activeBrowser) {
            console.error('all connection attempts failed:', lastError);
            throw new Error(`failed to connect to browser after 5 attempts: ${lastError}`);
        }
    } else {
        console.log('using existing browser connection');
    }

    if (!activeBrowser || !activePage) {
        console.error('browser or page not properly initialized');
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