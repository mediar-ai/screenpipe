import { NextResponse } from 'next/server';
import { loadConnections, saveConnection, saveRefreshStats, setShouldStopRefresh, getShouldStopRefresh, saveHarvestingState, saveNextHarvestTime } from '@/lib/storage/storage';
import { setupBrowser, getActiveBrowser } from '@/lib/browser-setup';
import { ChromeSession } from '@/lib/chrome-session';
import { clickCancelConnectionRequest } from '@/lib/simple-actions/click-cancel-connection-request';
import { Page } from 'puppeteer-core';
import { checkIfRestricted } from '@/lib/simple-actions/check-if-restricted';

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Add types for page and connection
type ConnectionStatus = 'cooldown' | 'declined' | 'accepted' | 'pending' | 'email_required';

type Connection = {
  status: ConnectionStatus;
  timestamp?: string;
};

async function checkConnectionStatus(page: Page, profileUrl: string, connection: Connection) {
  try {
    const maxRetries = 3;
    const baseDelay = 60000; // base delay of 1 minute

    for (let attempt = 0; attempt < maxRetries; attempt++) {

      try {
        // Add delay only after first attempt
        if (attempt > 0 || (refreshProgress && refreshProgress.current > 1)) {
          const nextDelay = Math.floor(Math.random() * 1000) + 20000;
          await new Promise(resolve => setTimeout(resolve, nextDelay));
          if (await getShouldStopRefresh()) {
            console.log('stop detected after delay, returning current status');
            return connection.status;
          }
        }

        // check if page is still valid
        try {
          await page.evaluate(() => document.title);
        } catch {
          // page is detached, get a new one
          const browser = getActiveBrowser();
          if (!browser.page) throw new Error('failed to get new page');
          page = browser.page;
        }

        // Navigate once at the start
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
        
        // Check for restriction after each navigation
        const restrictionStatus = await checkIfRestricted(page);
        if (restrictionStatus.isRestricted) {
          console.log('account restriction detected during status check:', restrictionStatus);
          await setShouldStopRefresh(true);
          if (restrictionStatus.restrictionEndDate) {
            await saveHarvestingState('cooldown');
            await saveNextHarvestTime(restrictionStatus.restrictionEndDate);
          } else {
            await saveHarvestingState('stopped');
          }
          throw new Error(`account restricted until ${restrictionStatus.restrictionEndDate}`);
        }

        // check for rate limit error (429)
        const is429 = await page.evaluate(() => {
          return document.body.textContent?.includes('HTTP ERROR 429') || false;
        });

        if (is429) {
          const retryDelay = baseDelay + Math.floor(Math.random() * baseDelay);
          console.log(`rate limited on ${profileUrl}, waiting ${retryDelay/1000}s before retry ${attempt + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }

        // First check if we need to cancel old pending request
        if (connection.status === 'pending' && connection.timestamp) {
          const daysAsPending = (new Date().getTime() - new Date(connection.timestamp).getTime()) / (1000 * 60 * 60 * 24);
          
          if (daysAsPending > 14) {
            console.log(`connection request to ${profileUrl} has been pending for ${Math.floor(daysAsPending)} days, canceling...`);
            const result = await clickCancelConnectionRequest(page);
            if (result.success) {
              return 'declined';
            }
          }
        }

        // Then check current connection status
        await page.waitForSelector('body', { timeout: 30000 });
        const isAccepted = await page.evaluate(() => {
          const distanceBadge = document.querySelector('.distance-badge');
          return distanceBadge?.textContent?.trim().includes('1st') || false;
        });

        return isAccepted ? 'accepted' : 'pending';

      } catch (error) {
        console.error(`failed to check status for ${profileUrl} (attempt ${attempt + 1}/${maxRetries}):`, error);
        
        if (error instanceof Error && error.message.includes('detached Frame')) {
          const browser = getActiveBrowser();
          if (!browser.page) throw new Error('failed to get new page');
          page = browser.page;
        }
        
        if (attempt === maxRetries - 1) {
          return 'pending';
        }
        
        const retryDelay = baseDelay + Math.floor(Math.random() * baseDelay);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    return 'pending';
  } catch (error) {
    console.error(`failed to check status for ${profileUrl}:`, error);
    return 'pending';
  }
}

// Add type for progress updates
interface RefreshProgress {
  current: number;
  total: number;
}

// Add progress tracking at module level
let refreshProgress: RefreshProgress | null = null;

// Add new endpoint to handle stop refresh
export async function POST() {
  console.log('stop requested');
  await setShouldStopRefresh(true);
  return NextResponse.json({ message: 'refresh stop requested' });
}

export async function GET(request: Request) {
  const nextDelay = 0;
  try {
    let connectionsStore = await loadConnections();
    const url = new URL(request.url);
    const shouldRefresh = url.searchParams.get('refresh') === 'true';

    // Only try to get browser page if we're actually refreshing connection statuses
    if (shouldRefresh) {
      await setShouldStopRefresh(false);
      
      // First check if we have an active page in the session
      let page = ChromeSession.getInstance().getActivePage();
      
      // If no page in session, try to set up browser
      if (!page) {
        const { page: newPage } = await setupBrowser();
        page = newPage;
      }

      if (!page) {
        console.warn('no active browser page, skipping connection status refresh');
      } else {
        const startTime = Date.now();
        
        // Get only pending connections for status check
        const pendingConnections = Object.entries(connectionsStore.connections)
          .filter(([, connection]) => connection.status === 'pending');
        
        // Initialize progress at 0
        refreshProgress = {
          current: 0,
          total: pendingConnections.length
        };

        // Check each pending connection
        for (const [url, connection] of pendingConnections) {
          if (await getShouldStopRefresh()) {
            console.log('stop detected in main loop, exiting...');
            refreshProgress = null;
            return NextResponse.json({
              harvestingStatus: 'stopped',
              refreshProgress: null
            });
          }

          const newStatus = await checkConnectionStatus(page, url, connection);
          if (newStatus !== connection.status) {
            await saveConnection({
              ...connection,
              status: newStatus,
              timestamp: new Date().toISOString()
            });
          }
          refreshProgress.current++;
        }
        
        const totalDuration = Date.now() - startTime;
        await saveRefreshStats(totalDuration, pendingConnections.length);
        
        // Reload after updates
        connectionsStore = await loadConnections();
      }
    }

    return NextResponse.json({
      harvestingStatus: connectionsStore.harvestingStatus,
      nextHarvestTime: connectionsStore.nextHarvestTime,
      connectionsSent: connectionsStore.connectionsSent || 0,
      dailyLimitReached: (connectionsStore.connectionsSent || 0) >= 35,
      weeklyLimitReached: false,
      refreshProgress,
      refreshError: null,
      rateLimitedUntil: null,
      nextProfileTime: nextDelay ? Date.now() + nextDelay : null,
      restrictionInfo: {
        isRestricted: connectionsStore.harvestingStatus === 'cooldown',
        endDate: connectionsStore.nextHarvestTime,
        reason: 'linkedin has detected automated activity on your account'
      }
    });

  } catch (error) {
    console.error('status check failed:', error);
    return NextResponse.json({
      harvestingStatus: 'stopped',
      error: (error as Error).message
    }, { status: 200 });
  }
} 