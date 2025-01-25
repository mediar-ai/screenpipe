import { NextResponse } from 'next/server';
import { setupBrowser } from '@/lib/browser-setup';
import { ChromeSession } from '@/lib/chrome-session';
import type { Page } from 'puppeteer-core';
import { RouteLogger } from '@/lib/route-logger';

const logger = new RouteLogger('chrome-navigate');

async function navigateToPage(page: Page, url: string) {
    try {
        logger.log('starting navigation');
        logger.log(`target url: ${url}`);
        
        // Set longer timeout but keep navigation simple
        await page.setDefaultNavigationTimeout(60000);
        logger.log('navigation timeout set to 60s');
        
        // Navigate to the target URL with same settings as search navigation
        logger.log('navigating to page...');
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        logger.log(`navigation response status: ${response?.status() || 0}`);

        // Wait for the main content to load
        logger.log('waiting for body element...');
        await page.waitForSelector('body', { timeout: 30000 });
        logger.log('body element found');

        // Store the page in ChromeSession after successful navigation
        ChromeSession.getInstance().setActivePage(page);
        logger.log('page stored in chrome session');

        return {
            status: response?.status() || 0,
            finalUrl: page.url()
        };

    } catch (error) {
        logger.log(`navigation error: ${error}`);
        throw error;
    }
}

export async function POST(request: Request) {
    try {
        const { url } = await request.json();
        logger.log(`attempting to navigate to: ${url}`);
        
        // Setup the browser connection
        logger.log('setting up browser...');
        const { page } = await setupBrowser(logger);
        
        // Perform the navigation
        const result = await navigateToPage(page, url);
        logger.log(`navigation complete. final url: ${result.finalUrl}`);

        // Return a successful response with navigation details
        return NextResponse.json({ 
            success: true,
            status: result.status,
            finalUrl: result.finalUrl,
            logs: logger.getLogs()
        });

    } catch (error) {
        logger.log(`failed to navigate: ${error}`);
        // Return an error response with details
        return NextResponse.json({ 
            success: false,
            error: 'failed to navigate', 
            details: error instanceof Error ? error.message : String(error),
            logs: logger.getLogs()
        }, { status: 500 });
    }
}