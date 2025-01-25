import puppeteer, { Browser, Page } from 'puppeteer-core';
import { ChromeSession } from './chrome-session';
import { RouteLogger } from './route-logger';

let activeBrowser: Browser | null = null;
let activePage: Page | null = null;
const defaultLogger = new RouteLogger('browser-setup');

// Export this function so it can be used elsewhere if needed
export async function getDebuggerUrl(logger: RouteLogger = defaultLogger): Promise<string> {
    logger.log('attempting to get debugger url...');
    const response = await fetch('http://127.0.0.1:9222/json/version');
    if (!response.ok) {
        logger.error(`failed to get debugger url: ${response.status} ${response.statusText}`);
        throw new Error('failed to get fresh websocket url');
    }
    const data = await response.json() as { webSocketDebuggerUrl: string };
    logger.log('got debugger url: ' + data.webSocketDebuggerUrl);
    return data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');
}

// we rely on an existing or newly launched chrome instance
export async function setupBrowser(logger: RouteLogger = defaultLogger): Promise<{ browser: Browser; page: Page }> {
    logger.log('checking for existing browser...');
    if (!activeBrowser) {
        const session = ChromeSession.getInstance();
        const wsUrl = session.getWsUrl() || await getDebuggerUrl(logger);

        let retries = 5;
        let lastError;

        while (retries > 0) {
            try {
                logger.log(`connection attempt ${6 - retries}...`);
                await new Promise(resolve => setTimeout(resolve, 1000));

                activeBrowser = await puppeteer.connect({
                    browserWSEndpoint: wsUrl,
                    defaultViewport: null,
                });
                session.setActiveBrowser(activeBrowser);
                logger.log('browser connected successfully');

                await new Promise(resolve => setTimeout(resolve, 1000));
                let pages = await activeBrowser.pages();
                logger.log(`found ${pages.length} pages`);

                let linkedinPage = pages.find(page => page.url().startsWith('https://www.linkedin.com'));

                if (linkedinPage) {
                    logger.log('found existing linkedin page, reusing it');
                    activePage = linkedinPage;
                } else {
                    logger.log('no existing linkedin page found, opening a new tab');
                    activePage = await activeBrowser.newPage();
                    logger.log('new tab opened');
                }
                session.setActivePage(activePage);
                logger.log('browser setup complete');
                break;
            } catch (error) {
                lastError = error;
                logger.error(`connection attempt ${6 - retries} failed: ${error}`);
                retries--;
                if (retries > 0) {
                    logger.log(`retrying in 2s... (${retries} attempts left)`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        if (!activeBrowser) {
            logger.error(`all connection attempts failed: ${lastError}`);
            throw new Error(`failed to connect to browser after 5 attempts: ${lastError}`);
        }
    } else {
        logger.log('using existing browser connection');
    }

    if (!activeBrowser || !activePage) {
        logger.error('browser or page not properly initialized');
        throw new Error('browser or page not initialized');
    }

    return { browser: activeBrowser, page: activePage };
}

// helper to return the active browser and page
export function getActiveBrowser() {
    const session = ChromeSession.getInstance();
    return { 
        browser: session.getActiveBrowser(),
        page: session.getActivePage() 
    };
}

// used to disconnect puppeteer if desired
export async function quitBrowser(logger: RouteLogger = defaultLogger) {
    ChromeSession.getInstance().clear();
    if (activeBrowser) {
        try {
            await activeBrowser.disconnect();
            logger.log('browser disconnected');
        } catch (error) {
            logger.error(`error disconnecting browser: ${error}`);
        }
        activeBrowser = null;
        activePage = null;
        logger.log('browser session cleared');
    }
}