import { NextResponse } from 'next/server';
import { setupBrowser, getActiveBrowser } from '@/lib/browser_setup';

export async function POST(request: Request) {
    try {
        const { wsUrl } = await request.json();
        console.log('checking linkedin login status');

        await setupBrowser(wsUrl);
        const { page } = getActiveBrowser();
        
        if (!page) {
            throw new Error('no active browser session');
        }

        // Set default navigation timeout
        page.setDefaultNavigationTimeout(30000);

        // Navigate to LinkedIn and wait for the page to load
        await page.goto('https://www.linkedin.com', { waitUntil: 'networkidle2' });

        // Remove any existing event listeners to prevent hanging
        page.removeAllListeners();

        // Check for login status
        const isLoggedIn = await Promise.race([
            page.waitForSelector('nav.global-nav', { timeout: 10000 }).then(() => true),
            page.waitForSelector('[data-tracking-control-name="guest_homepage-basic_sign-in-button"]', { timeout: 10000 }).then(() => false),
            new Promise<boolean>((resolve, reject) => {
                setTimeout(() => reject('timeout'), 15000);
            })
        ]);

        console.log('login status:', isLoggedIn ? 'logged in' : 'logged out');

        // Close the page to free resources
        await page.close();

        return NextResponse.json({
            success: true,
            isLoggedIn
        });

    } catch (error) {
        console.error('failed to check login status:', error);

        // Close the page in case of error
        const { page } = getActiveBrowser();
        if (page) {
            await page.close();
        }

        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500 }
        );
    }
}
