import { Page } from 'puppeteer-core';
import { setupBrowser } from '../browser-setup';
import { updateWorkflowStep } from '../../app/api/workflow/status/state';
import { showClickAnimation } from '../simple-actions/click-animation';
import { checkIfRestricted } from '../simple-actions/check-if-restricted';
import { saveConnection, setWithdrawingStatus } from '../storage/storage';
import { startCheckingAcceptedConnections } from './check-accepted-connections';
import { startCheckingRecentlyAddedConnections } from './check-recently-added-connections';

const port = process.env.PORT!;
const BASE_URL = `http://127.0.0.1:${port}`;

let isCurrentlyWithdrawing = false;
export let shouldStop = false;

export function setShouldStop(value: boolean) {
  shouldStop = value;
}

export async function startWithdrawing(): Promise<void> {
  if (isCurrentlyWithdrawing) {
    console.log('withdraw process already in progress');
    return;
  }

  isCurrentlyWithdrawing = true;
  await setWithdrawingStatus(true);
  console.log('starting withdraw process');

  try {
    // Reset the flag at start
    await setWithdrawingStatus(true);

    // Check if we should stop frequently during the process
    if (shouldStop) {
      console.log('withdraw process stopped by user');
      await setWithdrawingStatus(false, {
        reason: 'stopped by user',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // First check recently added connections
    console.log('checking recently added connections first');
    if (shouldStop) return;
    await startCheckingRecentlyAddedConnections();

    // Browser setup
    updateWorkflowStep('browser', 'running', 'connecting to chrome');
    const statusResponse = await fetch(`${BASE_URL}/api/chrome/status`);
    const statusData = await statusResponse.json();

    if (statusData.status !== 'connected' || !statusData.wsUrl) {
      throw new Error('chrome not connected');
    }

    const { page } = await setupBrowser();
    updateWorkflowStep('browser', 'done', 'browser connected');

    // Navigate to sent invitations page
    updateWorkflowStep('navigation', 'running', 'navigating to sent invitations');
    await navigateToSentInvitations(page);

    while (true) {
      if (shouldStop) {
        console.log('withdraw process stopped by user during main loop');
        await setWithdrawingStatus(false, {
          reason: 'stopped by user',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const foundProfilesToWithdraw = await withdrawOldInvitations(page);
      if (!foundProfilesToWithdraw) {
        const hasNextPage = await goToNextPage(page);
        if (!hasNextPage) {
          console.log('goToNextPagefunction stopped');
          break;
        }
      }
    }

  } catch (error) {
    console.error('withdraw process failed:', error);
    await setWithdrawingStatus(false, {
      reason: `withdraw process failed: ${error}`,
      timestamp: new Date().toISOString()
    });
    throw error;
  } finally {
    isCurrentlyWithdrawing = false;
  }
}

async function navigateToSentInvitations(page: Page) {
  console.log('navigating to sent invitations page');
  await page.goto('https://www.linkedin.com/mynetwork/invitation-manager/sent/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
}

async function randomDelay(baseMs: number = 1000, variationMs: number = 500): Promise<void> {
  const delay = baseMs + Math.random() * variationMs;
//   console.log(`waiting for ${Math.round(delay)}ms`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function withdrawOldInvitations(page: Page): Promise<boolean> {
  console.log('checking for old invitations');
  
  // Wait for cards to be present after any page update
  await page.waitForSelector('.invitation-card__container', { timeout: 10000 });
  await randomDelay();  // Add small delay after content load
  
  // Re-query cards after ensuring page is loaded
  const cards = await page.$$('.invitation-card__container');
  let foundOldInvitation = false;

  for (const card of cards) {
    if (shouldStop) {
      console.log('withdraw process stopped by user during card processing');
      return false;
    }

    try {
      // Re-query elements within each card to ensure fresh references
      const profileLink = await card.$('a[href*="/in/"]');
      const profileUrl = await profileLink?.evaluate(el => el.getAttribute('href'));
      
      if (!profileUrl) {
        console.log('no profile url found, skipping');
        continue;
      }

      const timeBadge = await card.$('.time-badge');
      const timeText = await timeBadge?.evaluate(el => el.textContent?.trim());

      if (!timeText) continue;

      const isOldEnough = timeText.includes('month') || 
        (timeText.includes('week') && parseInt(timeText) >= 2);

      if (isOldEnough) {
        console.log(`found old invitation for ${profileUrl}: ${timeText}`);
        foundOldInvitation = true;

        // Re-query the withdraw button
        const withdrawBtn = await card.$('button[aria-label^="Withdraw invitation"]');
        if (!withdrawBtn) {
          console.log('withdraw button not found, skipping');
          continue;
        }

        await showClickAnimation(page, withdrawBtn);
        await withdrawBtn.click();
        await randomDelay();
        console.log('clicked withdraw button');

        // Wait for and handle confirmation modal
        const confirmBtn = await page.waitForSelector('button.artdeco-modal__confirm-dialog-btn[data-test-dialog-primary-btn]', {
          timeout: 5000
        });
        
        if (confirmBtn) {
          await showClickAnimation(page, confirmBtn);
          await confirmBtn.click();
          await randomDelay();
          console.log('confirmed withdrawal');
          
          await saveConnection({
            status: 'declined',
            timestamp: new Date().toISOString(),
            profileUrl
          });
          
          console.log(`updated status to declined for ${profileUrl}`);
          await randomDelay(2000); // Longer delay after confirmation
        }
      }
    } catch (error) {
      console.error('error processing invitation card:', error);
      continue;
    }
  }

  return foundOldInvitation;
}

async function goToNextPage(page: Page): Promise<boolean> {
  try {
    console.log('checking for next page');
    
    const nextButton = await page.$('button.artdeco-pagination__button--next:not([disabled])');
    if (!nextButton) {
      console.log('no next page available - reached last page');
      await setWithdrawingStatus(false, {
        reason: 'completed: reached last page of invitations',
        timestamp: new Date().toISOString()
      });
      
      // Start checking accepted connections after withdrawal completes
      console.log('starting accepted connections check flow');
      await startCheckingAcceptedConnections();
      
      return false;
    }

    const currentUrl = page.url();
    await showClickAnimation(page, nextButton);
    await nextButton.click();
    console.log('navigating to next page');

    // Wait for URL to change
    await page.waitForFunction(
      (oldUrl) => window.location.href !== oldUrl,
      { timeout: 15000 },
      currentUrl
    );

    // Check if we got redirected to the base page (LinkedIn's protection mechanism)
    const newUrl = page.url();
    if (newUrl.includes('invitationType=CONNECTION')) {
      console.log('detected linkedin protection redirect');
      await setWithdrawingStatus(false, {
        reason: 'paused: linkedin daily withdrawal limit reached',
        timestamp: new Date().toISOString()
      });
      return false;
    }

    // Wait for content
    await page.waitForSelector('.invitation-card__container', {
      timeout: 10000
    });
    
    console.log('successfully navigated to next page:', newUrl);
    return true;
  } catch (error) {
    console.error('error during page navigation:', error);
    await setWithdrawingStatus(false, {
      reason: `error: page navigation failed - ${error}`,
      timestamp: new Date().toISOString()
    });
    return false;
  }
}
