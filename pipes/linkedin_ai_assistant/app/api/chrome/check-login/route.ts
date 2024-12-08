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

        // Check for elements that indicate logged-in state
        const isLoggedIn = await page.evaluate(() => {
            // Check for feed-specific elements that only appear when logged in
            const feedElements = document.querySelector('.scaffold-layout__main')
            const navElements = document.querySelector('.global-nav__me')
            
            // Return true if we find elements specific to logged-in state
            return !!(feedElements || navElements)
        })

        console.log(`login status: ${isLoggedIn ? 'logged in' : 'logged out'}`)

        return NextResponse.json({
            success: true,
            isLoggedIn: Boolean(isLoggedIn)
        });

    } catch (error) {
        console.error('failed to check login status:', error);
        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500 }
        );
    }
}
