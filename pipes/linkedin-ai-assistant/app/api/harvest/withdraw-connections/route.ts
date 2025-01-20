import { NextResponse } from 'next/server';
import { setupBrowser, getActiveBrowser } from '@/lib/browser-setup';
import { ChromeSession } from '@/lib/chrome-session';
import { startWithdrawing } from '@/lib/logic-sequence/withdraw-connections';

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Track withdrawal process state
let isWithdrawing = false;

export async function POST() {
  console.log('stop withdraw requested');
  isWithdrawing = false;
  return NextResponse.json({ message: 'withdraw stop requested' });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shouldStart = url.searchParams.get('start') === 'true';

    if (shouldStart && !isWithdrawing) {
      isWithdrawing = true;

      // First check if we have an active page in the session
      let page = ChromeSession.getInstance().getActivePage();
      
      // If no page in session, try to set up browser
      if (!page) {
        const { page: newPage } = await setupBrowser();
        page = newPage;
      }

      if (!page) {
        throw new Error('no active browser page available');
      }

      // Start withdrawal process in background
      startWithdrawing().catch(error => {
        console.error('withdrawal process failed:', error);
        isWithdrawing = false;
      });
    }

    return NextResponse.json({
      status: isWithdrawing ? 'running' : 'stopped',
      message: isWithdrawing ? 'withdrawal process running' : 'withdrawal process not running'
    });

  } catch (error) {
    console.error('withdrawal process failed:', error);
    isWithdrawing = false;
    return NextResponse.json({
      status: 'error',
      error: (error as Error).message
    }, { status: 200 });
  }
}
