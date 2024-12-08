import { Page } from 'puppeteer-core';
import { navigateToSearch } from '../simple_actions/go_to_search_results';
import { clickFirstConnectButton } from '../simple_actions/click_first_connect_button';
import { loadConnections, saveConnection, saveNextHarvestTime, saveHarvestingState, updateConnectionsSent } from '../storage/storage';
import { setupBrowser } from '../browser_setup';
import { setRunningState, updateWorkflowStep } from '../../app/api/workflow/status/route';
import { EventEmitter } from 'events';
import { closeAllMessageDialogues } from '../simple_actions/close_dialogues';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// Add global harvesting state
const harvestingState = new EventEmitter();

export function stopHarvesting() {
  harvestingState.emit('stop');
  saveHarvestingState(false).catch(console.error);

  // Optionally reset connectionsSent when stopping
  updateConnectionsSent(0).catch(console.error);
}

export interface HarvestStatus {
  connectionsSent: number;
  weeklyLimitReached: boolean;
  nextHarvestTime?: string;
  stopped?: boolean;
}

export function emitProgress(connectionsSent: number) {
  harvestingState.emit('progress', connectionsSent);
}

export async function startHarvesting(maxDailyConnections: number = 35): Promise<HarvestStatus> {
  const connections = await loadConnections();
  if (connections.nextHarvestTime) {
    const nextTime = new Date(connections.nextHarvestTime);
    if (nextTime > new Date()) {
      return {
        connectionsSent: 0,
        weeklyLimitReached: false,
        nextHarvestTime: connections.nextHarvestTime
      };
    }
  }

  await saveHarvestingState(true);
  
  let connectionsSent = 0;
  await updateConnectionsSent(connectionsSent);
  let weeklyLimitReached = false;

  try {
    console.log('Starting harvesting process');

    // Load existing connections
    const connections = await loadConnections();
    updateWorkflowStep('setup', 'done', 'connections loaded');

    // Browser setup
    updateWorkflowStep('browser', 'running', 'connecting to chrome');
    const statusResponse = await fetch(`${BASE_URL}/api/chrome/status`);
    const statusData = await statusResponse.json();

    if (statusData.status !== 'connected' || !statusData.wsUrl) {
      throw new Error('chrome not connected');
    }

    const { browser, page } = await setupBrowser(statusData.wsUrl);
    updateWorkflowStep('browser', 'done', 'browser connected');

    // Navigate to LinkedIn search results
    updateWorkflowStep('navigation', 'running', 'navigating to linkedin search');
    const searchUrl = 'https://www.linkedin.com/search/results/people/?network=%5B%22S%22%5D';
    await navigateToSearch(page, searchUrl, { allowTruncate: true });

    // Close any open message dialogues before starting
    updateWorkflowStep('navigation', 'running', 'closing message dialogues');
    await closeAllMessageDialogues(page);

    // Wait for the search results to load
    console.log('waiting for search results container...');
    await page.waitForSelector('div[data-view-name="search-entity-result-universal-template"]', { 
      visible: true, 
      timeout: 15000 
    });

    console.log('search results loaded');
    updateWorkflowStep('navigation', 'done');

    // Add stop handler
    const stopPromise = new Promise(resolve => {
      harvestingState.once('stop', () => {
        console.log('stopping harvest process');
        resolve(true);
      });
    });

    while (connectionsSent < maxDailyConnections && !weeklyLimitReached) {
      // Check if stop was requested
      if (await Promise.race([stopPromise, Promise.resolve(false)])) {
        console.log('harvest process stopped by user');
        await saveHarvestingState(false);
        return { connectionsSent, weeklyLimitReached, stopped: true };
      }

      updateWorkflowStep('processing', 'running', `processing connections`);

      try {
        // Wait for connect buttons
        const connectButtonSelector = 'button[aria-label^="Invite"][aria-label$="to connect"]';
        const buttons = await page.$$(connectButtonSelector);

        if (buttons.length === 0) {
          console.log('no connect buttons found on this page');
          break;
        }

        const result = await clickFirstConnectButton(page);

        if (result.success) {
          connectionsSent++;
          emitProgress(connectionsSent);
          console.log(`Connection sent to ${result.profileUrl}, total: ${connectionsSent}`);
          
          await saveConnection({
            profileUrl: result.profileUrl || '',
            status: 'pending',
            timestamp: new Date().toISOString()
          });

          // Update connectionsSent in the store
          await updateConnectionsSent(connectionsSent);

          // Add random delay between connections
          const delay = 3000 + Math.floor(Math.random() * 1000);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (result.weeklyLimitReached) {
          console.log('Weekly limit reached, stopping');
          weeklyLimitReached = true;
          break;
        }
      } catch (error) {
        console.error('error processing connection:', error);
        continue;
      }
    }

    console.log(`Finished sending ${connectionsSent} connections`);
  } catch (error) {
    await saveHarvestingState(false);
    console.error('Harvesting failed:', error);
  }

  if (weeklyLimitReached) {
    // Weekly limit reached, set next time and keep harvesting state
    const nextTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await saveNextHarvestTime(nextTime);
    return { 
      connectionsSent, 
      weeklyLimitReached: true, 
      nextHarvestTime: nextTime 
    };
  }

  if (connectionsSent >= maxDailyConnections) {
    // Daily limit reached, set next time and keep harvesting state
    const nextTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await saveNextHarvestTime(nextTime);
    return { 
      connectionsSent,
      weeklyLimitReached: false,
      nextHarvestTime: nextTime 
    };
  }

  return { 
    connectionsSent, 
    weeklyLimitReached: false 
  };
}

startHarvesting().catch(error => {
  console.error('harvesting failed:', error);
});

// Helper function to navigate to the next page
async function goToNextPage(page: Page): Promise<boolean> {
  try {
    const nextButtonSelector = 'button[aria-label="Next"]';
    const nextButton = await page.$(nextButtonSelector);

    if (nextButton) {
      await nextButton.click();
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });

      // Wait for search results to load
      console.log('waiting for search results to load...');
      await page.waitForSelector('ul.reusable-search__entity-result-list', { visible: true, timeout: 15000 });
      console.log('search results loaded');

      return true;
    } else {
      console.log('next page button not found');
      return false;
    }
  } catch (error) {
    console.error('failed to navigate to next page:', error);
    return false;
  }
}