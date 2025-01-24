import { NextResponse } from 'next/server';
import { setupBrowser } from '@/lib/browser-setup';
import { ChromeSession } from '@/lib/chrome-session';
import type { Page } from 'puppeteer-core';

const logs: string[] = [];
const addLog = (msg: string) => {
  console.log(msg);
  logs.push(`${new Date().toISOString()} - ${msg}`);
};

async function navigateToPage(page: Page, url: string) {
    try {
        addLog('starting navigation');
        addLog(`target url: ${url}`);
        
        // Set longer timeout but keep navigation simple
        await page.setDefaultNavigationTimeout(60000);
        addLog('navigation timeout set to 60s');
        
        // Navigate to the target URL with same settings as search navigation
        addLog('navigating to page...');
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        addLog(`navigation response status: ${response?.status() || 0}`);

        // Wait for the main content to load
        addLog('waiting for body element...');
        await page.waitForSelector('body', { timeout: 30000 });
        addLog('body element found');

        // Store the page in ChromeSession after successful navigation
        ChromeSession.getInstance().setActivePage(page);
        addLog('page stored in chrome session');

        return {
            status: response?.status() || 0,
            finalUrl: page.url()
        };

    } catch (error) {
        addLog(`navigation error: ${error}`);
        throw error;
    }
}

export async function POST(request: Request) {
    try {
        const { url } = await request.json();
        addLog(`attempting to navigate to: ${url}`);
        
        // Setup the browser connection
        addLog('setting up browser...');
        const { page } = await setupBrowser(logs);
        
        // Perform the navigation
        const result = await navigateToPage(page, url);
        addLog(`navigation complete. final url: ${result.finalUrl}`);

        // Return a successful response with navigation details
        return NextResponse.json({ 
            success: true,
            status: result.status,
            finalUrl: result.finalUrl,
            logs
        });

    } catch (error) {
        addLog(`failed to navigate: ${error}`);
        // Return an error response with details
        return NextResponse.json({ 
            success: false,
            error: 'failed to navigate', 
            details: error instanceof Error ? error.message : String(error),
            logs
        }, { status: 500 });
    }
}