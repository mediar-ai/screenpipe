import { NextResponse } from 'next/server';
import { getActiveBrowser, setupBrowser } from '@/lib/browser_setup';
import type { Page } from 'puppeteer-core';

async function navigateToPage(page: Page, url: string) {
    try {
        console.log('starting navigation');
        
        // Set longer timeout and handle common errors
        await page.setDefaultNavigationTimeout(60000);
        
        // Enable request interception to handle potential issues
        await page.setRequestInterception(true);

        // Define request interception handler
        const requestHandler = (request: any) => {
            if (['image', 'font'].includes(request.resourceType())) {
                request.abort(); // Abort unnecessary requests to speed up navigation
            } else {
                request.continue(); // Continue processing other requests
            }
        };

        // Attach the request handler
        page.on('request', requestHandler);

        // Navigate to the target URL
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded', // Use 'domcontentloaded' to prevent potential hanging with 'networkidle0'
            timeout: 60000
        });

        // Remove the request handler after navigation completes
        page.off('request', requestHandler);

        // Return navigation results
        return {
            status: response?.status() || 0,
            finalUrl: page.url()
        };

    } catch (error) {
        console.error('navigation error:', error);
        throw error; // Rethrow error to be caught in the POST handler
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