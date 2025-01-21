import { NextResponse } from 'next/server';
import { setupBrowser, getActiveBrowser } from '@/lib/browser-setup';

const logs: string[] = [];
const addLog = (msg: string) => {
  console.log(msg);
  logs.push(`${new Date().toISOString()} - ${msg}`);
};

export async function POST(request: Request) {
    try {
        await request.json(); // keep reading the request to avoid hanging
        addLog('checking linkedin login status');

        addLog('setting up browser...');
        await setupBrowser(logs);
        const { page } = getActiveBrowser();
        
        if (!page) {
            addLog('no active browser session found');
            throw new Error('no active browser session');
        }

        addLog('evaluating login state...');
        // Check for elements that indicate logged-in state
        const isLoggedIn = await page.evaluate(() => {
            // Check for feed-specific elements that only appear when logged in
            const feedElements = document.querySelector('.scaffold-layout__main')
            const navElements = document.querySelector('.global-nav__me')
            
            // Return true if we find elements specific to logged-in state
            return !!(feedElements || navElements)
        });

        addLog(`login status: ${isLoggedIn ? 'logged in' : 'logged out'}`);

        return NextResponse.json({
            success: true,
            isLoggedIn: Boolean(isLoggedIn),
            logs
        });

    } catch (error) {
        addLog(`failed to check login status: ${error}`);
        return NextResponse.json(
            { success: false, error: String(error), logs },
            { status: 500 }
        );
    }
}
