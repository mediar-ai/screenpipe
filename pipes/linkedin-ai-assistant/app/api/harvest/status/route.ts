import { NextResponse } from 'next/server';
import { loadConnections, saveConnection, saveNextHarvestTime, saveHarvestingState } from '@/lib/storage/storage';
import { getActiveBrowser } from '@/lib/browser-setup';
import { clickCancelConnectionRequest } from '@/lib/simple-actions/click-cancel-connection-request';
import { startHarvesting } from '@/lib/logic-sequence/harvest-connections';

async function checkConnectionStatus(page: any, profileUrl: string, connection: any) {
  // check if pending for more than 14 days
  if (connection.status === 'pending' && connection.timestamp) {
    const daysAsPending = (new Date().getTime() - new Date(connection.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysAsPending > 14) {
      console.log(`connection request to ${profileUrl} has been pending for ${Math.floor(daysAsPending)} days, canceling...`);
      
      // attempt to cancel the request
      const result = await clickCancelConnectionRequest(page);
      if (result.success) {
        return 'declined';
      }
      // if cancellation fails, continue with normal status check
    }
  }

  const maxRetries = 3;
  const retryDelay = 60000; // 1 minute delay between retries

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
      
      // check for rate limit error (429)
      const is429 = await page.evaluate(() => {
        return document.body.textContent?.includes('HTTP ERROR 429') || false;
      });

      if (is429) {
        console.log(`rate limited on ${profileUrl}, waiting ${retryDelay/1000}s before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }

      await page.waitForSelector('body', { timeout: 30000 });

      // Check for 1st degree connection indicator
      const isAccepted = await page.evaluate(() => {
        const distanceBadge = document.querySelector('.distance-badge');
        return distanceBadge?.textContent?.trim().includes('1st') || false;
      });

      return isAccepted ? 'accepted' : 'pending';
    } catch (error) {
      console.error(`failed to check status for ${profileUrl} (attempt ${attempt + 1}/${maxRetries}):`, error);
      
      if (attempt === maxRetries - 1) {
        return 'pending'; // Keep as pending if we can't determine status after all retries
      }
      
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  return 'pending';
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shouldRefresh = url.searchParams.get('refresh') === 'true';
    let connectionsStore = await loadConnections();

    console.log('checking harvest status:', {
      nextHarvestTime: connectionsStore.nextHarvestTime,
      isHarvesting: connectionsStore.isHarvesting,
      connectionsSent: connectionsStore.connectionsSent
    });

    // If isHarvesting is true but no active harvesting is happening, restart it
    if (connectionsStore.isHarvesting && !connectionsStore.nextHarvestTime) {
      console.log('detected stale harvesting state, restarting process');
      
      // Start harvesting in the background
      startHarvesting().then(result => {
        console.log('harvest restart result:', result);
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
      console.log('cooldown check:', {
        nextTime: nextTime.toISOString(),
        now: now.toISOString(),
        shouldRestart: nextTime <= now
      });

      if (nextTime <= now) {
        console.log('cooldown period ended, restarting harvest process');
        await saveNextHarvestTime('');
        await saveHarvestingState(true);
        connectionsStore = await loadConnections();
        
        startHarvesting().then(result => {
          console.log('harvest restart result:', result);
        }).catch(error => {
          console.error('failed to restart harvesting:', error);
          saveHarvestingState(false).catch(console.error);
        });
      }
    }

    if (shouldRefresh) {
      const { page } = getActiveBrowser();
      if (page) {
        // Check pending connections
        for (const [url, connection] of Object.entries(connectionsStore.connections)) {
          if (connection.status === 'pending') {
            // pass connection object to checkConnectionStatus
            const newStatus = await checkConnectionStatus(page, url, connection);
            if (newStatus !== connection.status) {
              await saveConnection({
                ...connection,
                status: newStatus,
                timestamp: new Date().toISOString()
              });
            }
          }
        }
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
      isHarvesting: connectionsStore.isHarvesting || false,
      nextHarvestTime: connectionsStore.nextHarvestTime,
      connectionsSent: connectionsStore.connectionsSent || 0,
      stats: {
        pending: stats.pending || 0,
        accepted: stats.accepted || 0,
        declined: stats.declined || 0,
        email_required: stats.email_required || 0,
        cooldown: stats.cooldown || 0,
        total: Object.keys(connectionsStore.connections).length
      }
    });
  } catch (error: any) {
    return NextResponse.json({ message: error.message?.toLowerCase() }, { status: 500 });
  }
} 