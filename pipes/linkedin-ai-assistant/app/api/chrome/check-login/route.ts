import { NextResponse } from 'next/server';
import { setupBrowser, getActiveBrowser } from '@/lib/browser-setup';
import { RouteLogger } from '@/lib/route-logger';

const logger = new RouteLogger('chrome-check-login');

export async function POST(request: Request) {
    try {
        await request.json(); // keep reading the request to avoid hanging
        logger.log('checking linkedin login status');

        logger.log('setting up browser...');
        await setupBrowser(logger);
        const { page } = getActiveBrowser();
        
        if (!page) {
            logger.log('no active browser session found');
            throw new Error('no active browser session');
        }

        logger.log('evaluating login state...');
        // Check for elements that indicate logged-in state
        const isLoggedIn = await page.evaluate(() => {
            // Check for feed-specific elements that only appear when logged in
            const feedElements = document.querySelector('.scaffold-layout__main')
            const navElements = document.querySelector('.global-nav__me')
            
            // Return true if we find elements specific to logged-in state
            return !!(feedElements || navElements)
        });

        logger.log(`login status: ${isLoggedIn ? 'logged in' : 'logged out'}`);

        return NextResponse.json({
            success: true,
            isLoggedIn: Boolean(isLoggedIn),
            logs: logger.getLogs()
        });

    } catch (error) {
        logger.error(`failed to check login status: ${error}`);
        return NextResponse.json(
            { success: false, error: String(error), logs: logger.getLogs() },
            { status: 500 }
        );
    }
}
