import { NextResponse } from 'next/server';
import { getActiveBrowser, setupBrowser } from '@/lib/browser_setup';
import type { Page } from 'puppeteer-core';

async function navigateToPage(page: Page, url: string) {
    try {
        console.log('starting navigation');
        
        // Set longer timeout but keep navigation simple
        await page.setDefaultNavigationTimeout(60000);
        
        // Navigate to the target URL with same settings as search navigation
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Wait for the main content to load
        await page.waitForSelector('body', { timeout: 30000 });

        return {
            status: response?.status() || 0,
            finalUrl: page.url()
        };

    } catch (error) {
        console.error('navigation error:', error);
        throw error;
    }
}

export async function POST(request: Request) {
    try {
        const { url, wsUrl } = await request.json();
        console.log('attempting to navigate to:', url);
        
        // Setup the browser connection using the provided WebSocket URL
        await setupBrowser(wsUrl);
        
        const { page } = getActiveBrowser();
        if (!page) {
            throw new Error('no active browser session');
        }
        
        // Perform the navigation
        const result = await navigateToPage(page, url);

        // Return a successful response with navigation details
        return NextResponse.json({ 
            success: true,
            status: result.status,
            finalUrl: result.finalUrl
        });

    } catch (error) {
        console.error('failed to navigate:', error);
        // Return an error response with details
        return NextResponse.json({ 
            success: false,
            error: 'failed to navigate', 
            details: error instanceof Error ? error.message : String(error) 
        }, { status: 500 });
    }
}