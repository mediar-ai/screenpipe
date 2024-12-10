import { Page } from 'puppeteer-core';
import { navigateToSearch } from '../simple_actions/go_to_search_results';
import {
  loadConnections,
  saveConnection,
  saveNextHarvestTime,
  saveHarvestingState,
  updateConnectionsSent,
} from '../storage/storage';
import { setupBrowser } from '../browser_setup';
import { updateWorkflowStep } from '../../app/api/workflow/status/route';
import { EventEmitter } from 'events';
import { closeAllMessageDialogues } from '../simple_actions/close_dialogues';
import { cleanProfileUrl } from '../simple_actions/extract_profiles_from_search_results';
import { showClickAnimation } from '../simple_actions/click_animation';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// Global harvesting state using an EventEmitter
const harvestingState = new EventEmitter();

// Variables to track the harvesting status
let stopRequested = false;

// Set to track profiles we've already attempted to connect with
const attemptedProfiles = new Set<string>();
const emailVerificationProfiles = new Set<string>();
const cooldownProfiles = new Set<string>();

export function stopHarvesting() {
  stopRequested = true;
  harvestingState.emit('stop');
  saveHarvestingState(false).catch(console.error);
  updateConnectionsSent(0).catch(console.error);
}

export interface HarvestStatus {
  connectionsSent: number;
  weeklyLimitReached: boolean;
  dailyLimitReached: boolean;
  nextHarvestTime?: string;
  stopped?: boolean;
}

export function emitProgress(connectionsSent: number) {
  harvestingState.emit('progress', connectionsSent);
}

export async function startHarvesting(
  maxDailyConnections: number = 35
): Promise<HarvestStatus> {
  console.log(
    'starting harvest process with max daily connections:',
    maxDailyConnections
  );

  // Reset the stop request flag at the beginning of the process
  stopRequested = false;

  const connections = await loadConnections();
  console.log('initial connections state:', connections);

  // Set harvesting state to true immediately
  await saveHarvestingState(true);

  if (connections.nextHarvestTime) {
    const nextTime = new Date(connections.nextHarvestTime);
    console.log('checking next harvest time:', nextTime);
    if (nextTime > new Date()) {
      return {
        connectionsSent: 0,
        weeklyLimitReached: false,
        dailyLimitReached: false,
        nextHarvestTime: connections.nextHarvestTime,
      };
    }
  }

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
    const searchUrl =
      'https://www.linkedin.com/search/results/people/?network=%5B%22S%22%5D';
    await navigateToSearch(page, searchUrl, { allowTruncate: true });

    // Close any open message dialogues before starting
    updateWorkflowStep('navigation', 'running', 'closing message dialogues');
    await closeAllMessageDialogues(page);

    // Wait for the search results to load
    console.log('waiting for search results container...');
    try {
      await page.waitForSelector(
        [
          'div[data-view-name="search-entity-result-universal-template"]',
          'ul.reusable-search__entity-result-list',
        ].join(','),
        {
          visible: true,
          timeout: 15000,
        }
      );
      console.log('search results loaded successfully');
    } catch (error) {
      console.error('failed to find search results:', error);
      throw new Error('no search results found on page');
    }

    console.log('search results loaded');
    updateWorkflowStep('navigation', 'done');

    // Add stop handler
    harvestingState.once('stop', () => {
      console.log('harvest process stopped by user');
      stopRequested = true;
    });

    while (
      connectionsSent < maxDailyConnections &&
      !weeklyLimitReached &&
      !stopRequested
    ) {
      // Check if stop was requested
      if (stopRequested) {
        console.log('harvest process stopped by user');
        await saveHarvestingState(false);
        return {
          connectionsSent,
          weeklyLimitReached,
          dailyLimitReached: false,
          stopped: true,
        };
      }

      updateWorkflowStep('processing', 'running', `processing connections`);

      try {
        const result = await clickNextConnectButton(page, stopRequested);

        if (stopRequested) {
          break;
        }

        if (result.success) {
          connectionsSent++;
          emitProgress(connectionsSent);

          const cleanUrl = result.profileUrl
            ? cleanProfileUrl(result.profileUrl)
            : '';
          console.log(
            `Connection sent to ${cleanUrl}, total: ${connectionsSent}`
          );

          await saveConnection({
            profileUrl: cleanUrl,
            status: 'pending',
            timestamp: new Date().toISOString(),
          });

          // Update connectionsSent in the store
          await updateConnectionsSent(connectionsSent);

          // Add random delay between connections
          const delay = 3000 + Math.floor(Math.random() * 1000);
          await new Promise((resolve) => setTimeout(resolve, delay));

          if (stopRequested) {
            break;
          }
        } else if (result.weeklyLimitReached) {
          console.log('Weekly limit reached, stopping');
          weeklyLimitReached = true;
          break;
        } else if (result.cooldown) {
          console.log('profile in cooldown period:', result.profileUrl);
          // Try next button on the page instead of continuing
          continue;
        } else if (result.emailRequired && result.profileUrl) {
          console.log(
            'email verification required for profile:',
            result.profileUrl
          );
          await saveConnection({
            profileUrl: result.profileUrl,
            status: 'email_required',
            timestamp: new Date().toISOString(),
          });
          // Continue to next profile without incrementing connectionsSent
          continue;
        } else {
          // No valid connect buttons found, attempt to go to next page
          const hasNextPage = await goToNextPage(page, stopRequested);
          if (stopRequested || !hasNextPage) {
            console.log('no more pages available or stopped, ending harvest');
            break;
          }
          // Small delay after page navigation
          await new Promise((resolve) => setTimeout(resolve, 2000));

          if (stopRequested) {
            break;
          }
        }

        // Add small delay between attempts
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (stopRequested) {
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
    console.error('harvesting failed:', error);
    throw error;
  }

  if (stopRequested) {
    await saveHarvestingState(false);
    return {
      connectionsSent,
      weeklyLimitReached: false,
      dailyLimitReached: false,
      stopped: true,
    };
  }

  if (weeklyLimitReached) {
    // Weekly limit reached, set next time and keep harvesting state
    const nextTime = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();
    await saveNextHarvestTime(nextTime);
    return {
      connectionsSent,
      weeklyLimitReached: true,
      dailyLimitReached: false,
      nextHarvestTime: nextTime,
    };
  }

  if (connectionsSent >= maxDailyConnections) {
    // Daily limit reached, set next time and keep harvesting state
    const nextTime = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();
    await saveNextHarvestTime(nextTime);
    return {
      connectionsSent,
      weeklyLimitReached: false,
      dailyLimitReached: true,
      nextHarvestTime: nextTime,
    };
  }

  return {
    connectionsSent,
    weeklyLimitReached: false,
    dailyLimitReached: false,
  };
}

// Function to click the next connect button
async function clickNextConnectButton(
  page: Page,
  stopRequested: boolean
): Promise<{
  success: boolean;
  profileUrl?: string;
  weeklyLimitReached?: boolean;
  emailRequired?: boolean;
  cooldown?: boolean;
  cooldownUntil?: string;
}> {
  try {
    // Load existing connections first
    const { connections } = await loadConnections();

    const connectButtonSelector =
      'button[aria-label^="Invite"][aria-label$="to connect"]';
    const connectButtons = await page.$$(connectButtonSelector);

    for (const connectButton of connectButtons) {
      if (stopRequested) {
        return { success: false };
      }

      const profileUrl = await page.evaluate((button) => {
        const container = button.closest('.linked-area');
        if (!container) return null;
        const profileLink = container.querySelector(
          'a.EvQUJBaxIRgFetdTQjAXvpGhCNvVbYEbE'
        );
        return profileLink?.href || null;
      }, connectButton);

      if (!profileUrl) {
        console.log('could not find profile url, trying next button');
        continue;
      }

      const cleanUrl = cleanProfileUrl(profileUrl);

      // Check stored connections state
      const existingConnection = connections[cleanUrl];
      if (existingConnection) {
        console.log(
          `skipping profile ${cleanUrl}, already in state: ${existingConnection.status}`
        );
        continue;
      }

      // Then check memory state
      if (
        cooldownProfiles.has(cleanUrl) ||
        emailVerificationProfiles.has(cleanUrl) ||
        attemptedProfiles.has(cleanUrl)
      ) {
        console.log('skipping profile due to memory state:', cleanUrl);
        continue;
      }

      attemptedProfiles.add(cleanUrl);
      console.log('trying connect button for profile:', cleanUrl);

      // Click the connect button with an animation
      await showClickAnimation(page, connectButton);
      await connectButton.click();
      console.log('clicked connect button');

      if (stopRequested) {
        return { success: false };
      }

      // Check immediately for an error toast indicating cooldown
      try {
        const errorToastSelector = 'div[data-test-artdeco-toast-item-type="error"]';
        const errorToast = await page.waitForSelector(errorToastSelector, { timeout: 2000 });

        if (errorToast) {
          const errorText = await errorToast.evaluate((el) => el.textContent);

          if (errorText?.includes('You can resend an invitation 3 weeks after')) {
            console.log('connection in cooldown period');

            // Add to cooldown set
            cooldownProfiles.add(cleanUrl);

            // Save to storage with cooldown status
            await saveConnection({
              profileUrl: cleanUrl,
              status: 'cooldown',
              timestamp: new Date().toISOString(),
            });

            // Dismiss the toast
            const dismissButton = await page.$('button[aria-label^="Dismiss"]');
            if (dismissButton) await dismissButton.click();

            continue;
          }
        }
      } catch (e) {
        // No error toast appeared; proceed
      }

      if (stopRequested) {
        return { success: false };
      }

      // Check for email verification modal
      try {
        const emailVerificationSelector =
          'div.artdeco-modal.send-invite input[type="email"]';
        const emailInput = await page.waitForSelector(emailVerificationSelector, {
          timeout: 2000,
        });

        if (emailInput) {
          console.log('email verification required for this profile');

          // Add to email verification set
          emailVerificationProfiles.add(cleanUrl);

          // Close the modal
          const closeButtonSelector = 'button.artdeco-modal__dismiss';
          await page.click(closeButtonSelector);

          return {
            success: false,
            profileUrl: cleanUrl,
            emailRequired: true,
          };
        }
      } catch (e) {
        // No email verification modal appeared
      }

      if (stopRequested) {
        return { success: false };
      }

      // Check for the connect modal and proceed
      try {
        await page.waitForSelector('.artdeco-modal[role="dialog"]', {
          timeout: 5000,
        });
        console.log('connect modal appeared');

        // Use the specific selector for "Send without a note"
        const sendButtonSelector = 'button[aria-label="Send without a note"]';
        await page.waitForSelector(sendButtonSelector, { timeout: 5000 });
        await showClickAnimation(page, sendButtonSelector);
        await page.click(sendButtonSelector);
        console.log('clicked send without note button');

        if (stopRequested) {
          return { success: false };
        }

        // After clicking, check for potential error toast again
        try {
          const errorToastSelector =
            'div[data-test-artdeco-toast-item-type="error"]';
          const errorToast = await page.waitForSelector(errorToastSelector, {
            timeout: 2000,
          });

          if (errorToast) {
            const errorText = await errorToast.evaluate((el) => el.textContent);

            if (
              errorText?.includes('You can resend an invitation 3 weeks after')
            ) {
              console.log('connection in cooldown period');

              // Add to cooldown set
              cooldownProfiles.add(cleanUrl);

              // Dismiss the toast
              const dismissButton = await page.$(
                'button[aria-label^="Dismiss"]'
              );
              if (dismissButton) await dismissButton.click();

              continue;
            }
          }
        } catch (e) {
          // No error toast; connection was successful
        }

        if (stopRequested) {
          return { success: false };
        }

        // Check for weekly limit modal
        try {
          const weeklyLimitHeader = await page.waitForSelector(
            'h2#ip-fuse-limit-alert__header',
            { timeout: 1000 }
          );
          if (weeklyLimitHeader) {
            console.log('weekly invitation limit reached');

            // Click the "Got it" button to dismiss
            const gotItButtonSelector = 'button[aria-label="Got it"]';
            await page.waitForSelector(gotItButtonSelector, { timeout: 5000 });
            await showClickAnimation(page, gotItButtonSelector);
            await page.click(gotItButtonSelector);
            console.log('clicked got it button');
            return { success: false, weeklyLimitReached: true };
          }
        } catch {
          // No weekly limit modal; proceed
        }

        // Connection was successful
        return { success: true, profileUrl: cleanUrl };
      } catch (e) {
        console.error('failed to click connect button:', e);
        continue;
      }
    }

    console.log('no valid connect buttons found on this page');
    return { success: false };
  } catch (e) {
    console.error('failed to click connect button:', e);
    return { success: false };
  }
}

// Helper function to navigate to the next page
async function goToNextPage(
  page: Page,
  stopRequested: boolean
): Promise<boolean> {
  try {
    if (stopRequested) {
      return false;
    }

    console.log('attempting to find next page button...');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (stopRequested) {
      return false;
    }

    const nextButtonSelectors = [
      'button[aria-label="Next"]',
      'button.artdeco-pagination__button--next',
      'button.artdeco-button[aria-label="Next"]',
      'button.artdeco-button[aria-label="Next"][type="button"]',
      'button.artdeco-pagination__button--next',
    ];

    for (const selector of nextButtonSelectors) {
      if (stopRequested) {
        return false;
      }

      console.log(`trying selector: ${selector}`);
      const nextButton = await page.$(selector);

      if (nextButton) {
        const isDisabled = await page.evaluate((button) => {
          return (
            button.hasAttribute('disabled') ||
            button.classList.contains('disabled') ||
            button.getAttribute('aria-disabled') === 'true'
          );
        }, nextButton);

        if (!isDisabled) {
          console.log('found enabled next button');

          await page.evaluate((button) => {
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, nextButton);
          await new Promise((resolve) => setTimeout(resolve, 1000));

          if (stopRequested) {
            return false;
          }

          // Click and wait for URL change
          const currentUrl = page.url();
          await nextButton.click();

          // Wait for URL to change
          await page.waitForFunction(
            (oldUrl) => window.location.href !== oldUrl,
            { timeout: 15000 },
            currentUrl
          );

          if (stopRequested) {
            return false;
          }

          // Reuse the same selectors from initial page load
          try {
            await page.waitForSelector(
              [
                'div[data-view-name="search-entity-result-universal-template"]',
                'ul.reusable-search__entity-result-list',
              ].join(','),
              {
                visible: true,
                timeout: 15000,
              }
            );
            console.log('search results loaded successfully');
            return true;
          } catch (error) {
            console.error('failed to find search results:', error);
            return false;
          }
        }
      }
    }

    console.log('no valid next button found');
    return false;
  } catch (error) {
    console.error('error in goToNextPage:', error);
    return false;
  }
}

export async function navigateToSearch(
  page: Page,
  url: string,
  options: { allowTruncate?: boolean } = {}
) {
  console.log('navigating to linkedin search...');

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
  } catch (error) {
    // If navigation was aborted but page loaded, we can continue
    if (error.message.includes('net::ERR_ABORTED')) {
      // Verify page actually loaded by checking for key elements
      try {
        await page.waitForSelector(
          [
            'div[data-view-name="search-entity-result-universal-template"]',
            'ul.reusable-search__entity-result-list',
          ].join(','),
          {
            visible: true,
            timeout: 15000,
          }
        );
        console.log('page loaded despite navigation abort');
        return;
      } catch (waitError) {
        // If we can't find the elements, then rethrow the original error
        throw error;
      }
    }
    throw error;
  }
}