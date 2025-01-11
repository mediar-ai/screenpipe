import { NextResponse } from 'next/server';
import { navigateToSearch } from '@/lib/simple-actions/go-to-search-results';
import { setupBrowser, getActiveBrowser } from '@/lib/browser-setup';

export async function POST(request: Request) {
    try {
        const { url, allowTruncate } = await request.json();
        
        if (!url || !url.includes('linkedin.com/search')) {
            return NextResponse.json(
                { error: 'invalid linkedin search url' },
                { status: 400 }
            );
        }

        // Setup browser with the provided WebSocket URL
        await setupBrowser();
        const { page } = getActiveBrowser();
        
        if (!page) {
            return NextResponse.json(
                { error: 'browser not connected' },
                { status: 400 }
            );
        }

        const { count } = await navigateToSearch(page, url);
        
        if (count > 100 && !allowTruncate) {
            return NextResponse.json(
                { error: 'too many results (limit: 100). please refine your search' },
                { status: 400 }
            );
        }
        
        return NextResponse.json({ count });

    } catch (error) {
        console.error('search validation failed:', error);
        return NextResponse.json(
            { error: String(error) },
            { status: 500 }
        );
    }
} 