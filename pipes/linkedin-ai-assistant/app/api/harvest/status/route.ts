import { NextResponse } from 'next/server';
import { loadConnections, saveConnection, saveNextHarvestTime, saveHarvestingState, saveRefreshStats } from '@/lib/storage/storage';
import { getActiveBrowser } from '@/lib/browser-setup';
import { clickCancelConnectionRequest } from '@/lib/simple-actions/click-cancel-connection-request';
import { startHarvesting } from '@/lib/logic-sequence/harvest-connections';
import { Page } from 'puppeteer-core';

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Add types for page and connection
type Connection = {
  status: string;
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

// Add type for status
interface HarvestStatus {
  nextHarvestTime: string;
  isHarvesting: string;
  connectionsSent: number;
}

// Initialize with empty strings instead of undefined
let lastStatus: HarvestStatus = {
  nextHarvestTime: '',
  isHarvesting: '',
  connectionsSent: 0
};

// Add cache for cooldown check
let lastCooldownCheck = {
  nextTime: '',
  shouldRestart: false
};

// Add type for progress updates
interface RefreshProgress {
  current: number;
  total: number;
}

// Add progress tracking at module level
let refreshProgress: RefreshProgress | null = null;

export async function GET(request: Request) {
  const nextDelay = 0;
  try {
    const url = new URL(request.url);
    const shouldRefresh = url.searchParams.get('refresh') === 'true';
    let connectionsStore = await loadConnections();

    // Only log if values changed
    const currentStatus = {
      nextHarvestTime: connectionsStore.nextHarvestTime || '',
      isHarvesting: String(connectionsStore.isHarvesting || ''),
      connectionsSent: connectionsStore.connectionsSent
    };

    if (JSON.stringify(lastStatus) !== JSON.stringify(currentStatus)) {
      console.log('harvest status changed:', currentStatus);
      lastStatus = currentStatus;
    }

    // If isHarvesting is true but no active harvesting is happening, restart it
    if (connectionsStore.isHarvesting && !connectionsStore.nextHarvestTime) {
      console.log('detected stale harvesting state, restarting process');
      
      // Start harvesting in the background
      startHarvesting().then(() => {
        // console.log('harvest restart result:', result);
      }).catch(error => {
        console.error('failed to restart harvesting:', error);
        // Reset harvesting state if start fails
        saveHarvestingState(false).catch(console.error);
      });
    }

    // Original cooldown check
    if (connectionsStore.nextHarvestTime) {
      const nextTime = new Date(connectionsStore.nextHarvestTime);
      const now = new Date();
      const shouldRestart = nextTime <= now;

      // Only track nextTime and shouldRestart state changes
      const currentCooldownCheck = {
        nextTime: nextTime.toISOString(),
        shouldRestart
      };

      if (JSON.stringify(lastCooldownCheck) !== JSON.stringify(currentCooldownCheck)) {
        console.log('cooldown check:', {
          ...currentCooldownCheck,
          now: now.toISOString() // Include now only in the log
        });
        lastCooldownCheck = currentCooldownCheck;
      }

      if (shouldRestart) {
        console.log('cooldown period ended, restarting harvest process');
        await saveNextHarvestTime('');
        await saveHarvestingState(true);
        connectionsStore = await loadConnections();
        
        startHarvesting().then(() => {
          // console.log('harvest restart result:', result);
        }).catch(error => {
          console.error('failed to restart harvesting:', error);
          saveHarvestingState(false).catch(console.error);
        });
      }
    }

    if (shouldRefresh) {
      const { page } = getActiveBrowser();
      if (page) {
        const startTime = Date.now();
        
        const pendingConnections = Object.entries(connectionsStore.connections)
          .filter(([, connection]) => connection.status === 'pending');
        
        refreshProgress = {
          current: 0,
          total: pendingConnections.length
        };

        // Check pending connections
        for (const [url, connection] of pendingConnections) {
          refreshProgress.current++;
          
          const newStatus = await checkConnectionStatus(page, url, connection);
          if (newStatus !== connection.status) {
            await saveConnection({
              ...connection,
              status: newStatus,
              timestamp: new Date().toISOString()
            });
          }
        }
        
        // Calculate and save duration stats
        const totalDuration = Date.now() - startTime;
        await saveRefreshStats(totalDuration, pendingConnections.length);
        
        // Reset progress after completion
        refreshProgress = null;
      }
      // Reload after updates
      connectionsStore = await loadConnections();
    }
    
    // Calculate stats from connections
    const stats = Object.values(connectionsStore.connections).reduce((acc, connection) => {
      const status = connection.status || 'pending';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      // Convert boolean isHarvesting to three-state status
      isHarvesting: connectionsStore.nextHarvestTime && new Date(connectionsStore.nextHarvestTime) > new Date()
        ? 'cooldown'
        : connectionsStore.isHarvesting
          ? 'running'
          : 'stopped',
      nextHarvestTime: connectionsStore.nextHarvestTime,
      connectionsSent: connectionsStore.connectionsSent || 0,
      dailyLimitReached: connectionsStore.connectionsSent >= 35,
      weeklyLimitReached: false,
      stats: {
        pending: stats.pending || 0,
        accepted: stats.accepted || 0,
        declined: stats.declined || 0,
        email_required: stats.email_required || 0,
        cooldown: stats.cooldown || 0,
        total: Object.keys(connectionsStore.connections).length,
        lastRefreshDuration: connectionsStore.lastRefreshDuration,
        averageProfileCheckDuration: connectionsStore.averageProfileCheckDuration
      },
      // Add refresh progress to response
      refreshProgress,
      rateLimitedUntil: null,
      nextProfileTime: nextDelay ? Date.now() + nextDelay : null,
    });
  } catch (error: unknown) {
    return NextResponse.json({ message: (error as Error).message?.toLowerCase() }, { status: 500 });
  }
} 