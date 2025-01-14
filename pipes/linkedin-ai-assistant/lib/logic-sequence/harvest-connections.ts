/* eslint-disable @typescript-eslint/no-unused-vars */

import { Page } from 'puppeteer-core';
import {
  loadConnections,
  saveConnection,
  saveNextHarvestTime,
  saveHarvestingState,
  updateConnectionsSent,
  setStopRequested,
  isStopRequested,
} from '../storage/storage';
import { setupBrowser } from '../browser-setup';
import { updateWorkflowStep } from '../../app/api/workflow/status/state';
import { closeAllMessageDialogues } from '../simple-actions/close-dialogues';
import { cleanProfileUrl } from '../simple-actions/extract-profiles-from-search-results';
import { showClickAnimation } from '../simple-actions/click-animation';
import { checkIfRestricted } from '../simple-actions/check-if-restricted';

const port = process.env.PORT!;
const BASE_URL = `http://127.0.0.1:${port}`;

// Variables to track the harvesting status
// let stopRequested = false;

// Set to track profiles we've already attempted to connect with
const attemptedProfiles = new Set<string>();
const emailVerificationProfiles = new Set<string>();
const cooldownProfiles = new Set<string>();

// Add state management to track active harvesting
let isCurrentlyHarvesting = false;

export async function stopHarvesting() {
  await setStopRequested(true);
  isCurrentlyHarvesting = false;
  // Ensure we clean up state
  attemptedProfiles.clear();
  emailVerificationProfiles.clear();
  cooldownProfiles.clear();
}

export interface HarvestStatus {
  connectionsSent: number;
  weeklyLimitReached: boolean;
  dailyLimitReached: boolean;
  nextHarvestTime?: string;
  stopped?: boolean;
  harvestingStatus: 'stopped' | 'running' | 'cooldown';
}

export async function emitProgress(connectionsSent: number) {
  await updateConnectionsSent(connectionsSent);
}

export async function isHarvesting(): Promise<boolean> {
  const store = await loadConnections();
  return store.harvestingStatus !== 'stopped';
}

export async function startHarvesting(
  maxDailyConnections: number = 35
): Promise<HarvestStatus> {
  // Reset stop flag at start
  await setStopRequested(false);

  // Prevent multiple harvesting processes
  if (isCurrentlyHarvesting) {
    console.log('harvest already in progress, skipping start');
    const connections = await loadConnections();
    return {
      connectionsSent: connections.connectionsSent || 0,
      weeklyLimitReached: false,
      dailyLimitReached: false,
      harvestingStatus: 'running'
    };
  }

  // Set flag before any async operations
  isCurrentlyHarvesting = true;
  console.log('starting new harvest process');

  try {
    const store = await loadConnections();
    
    // Check cooldown period first
    if (store.nextHarvestTime && new Date(store.nextHarvestTime) > new Date()) {
      console.log('in cooldown period, cannot start');
      return {
        connectionsSent: store.connectionsSent || 0,
        weeklyLimitReached: false,
        dailyLimitReached: true,
        nextHarvestTime: store.nextHarvestTime,
        harvestingStatus: 'cooldown'
      };
    }

    // Initialize counters
    let connectionsSent = 0;
    let weeklyLimitReached = false;
    const dailyLimitReached = false;

    // Rest of harvesting logic...

    // Set harvesting state to running immediately
    await saveHarvestingState('running');
    await updateConnectionsSent(0);

    try {
      // Reset the stop request flag
      await setStopRequested(false);
      const connections = await loadConnections();

      // Check cooldown period
      if (connections.nextHarvestTime) {
        const nextTime = new Date(connections.nextHarvestTime);
        if (nextTime > new Date()) {
          return { 
            connectionsSent: 0,
            weeklyLimitReached,
            dailyLimitReached,
            nextHarvestTime: connections.nextHarvestTime,
            harvestingStatus: 'cooldown'
          };
        }
      }

      console.log('starting farming process with max daily connections:', maxDailyConnections);
      
      await saveNextHarvestTime('');

      // Load existing connections
      updateWorkflowStep('setup', 'done', 'connections loaded');

      // Browser setup
      updateWorkflowStep('browser', 'running', 'connecting to chrome');
      const statusResponse = await fetch(`${BASE_URL}/api/chrome/status`);
      const statusData = await statusResponse.json();

      if (statusData.status !== 'connected' || !statusData.wsUrl) {
        throw new Error('chrome not connected');
      }

      const { page } = await setupBrowser();
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
      if (await isStopRequested()) {
        await saveHarvestingState('stopped');
        return {
          connectionsSent,
          weeklyLimitReached,
          dailyLimitReached: false,
          stopped: true,
          harvestingStatus: 'stopped'
        };
      }

      while (
        connectionsSent < maxDailyConnections &&
        !weeklyLimitReached &&
        !await isStopRequested()
      ) {
        // Check if stop was requested
        if (await isStopRequested()) {
          console.log('harvest process stopped by user');
          await saveHarvestingState('stopped');
          return {
            connectionsSent,
            weeklyLimitReached,
            dailyLimitReached: false,
            stopped: true,
            harvestingStatus: 'stopped'
          };
        }

        updateWorkflowStep('processing', 'running', `processing connections`);

        try {
          const result = await clickNextConnectButton(page, await isStopRequested());

          if (await isStopRequested()) {
            break;
          }

          if (result.success) {
            connectionsSent++;
            await updateConnectionsSent(connectionsSent);

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
            
            continue; // Continue the loop instead of returning
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
            const hasNextPage = await goToNextPage(page, await isStopRequested());
            if (await isStopRequested() || !hasNextPage) {
              console.log('no more pages available or stopped, ending harvest');
              break;
            }
            // Small delay after page navigation
            await new Promise((resolve) => setTimeout(resolve, 2000));

            if (await isStopRequested()) {
              break;
            }
          }

          // Add small delay between attempts
          await new Promise((resolve) => setTimeout(resolve, 1000));

          if (await isStopRequested()) {
            break;
          }
        } catch (error) {
          console.error('error processing connection:', error);
          continue;
        }
      }

      console.log(`Finished sending ${connectionsSent} connections`);
    } catch (error) {
      await saveHarvestingState('stopped');
      console.error('harvesting failed:', error);
      throw error;
    }

    if (await isStopRequested()) {
      await saveHarvestingState('stopped');
      return {
        connectionsSent,
        weeklyLimitReached: false,
        dailyLimitReached: false,
        stopped: true,
        harvestingStatus: 'stopped'
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
        harvestingStatus: 'running'
      };
    }

    if (connectionsSent >= maxDailyConnections) {
      // Daily limit reached, set next time but keep harvesting true
      const nextTime = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString();
      await saveNextHarvestTime(nextTime);
      await saveHarvestingState('cooldown');
      return {
        connectionsSent,
        weeklyLimitReached: false,
        dailyLimitReached: true,
        nextHarvestTime: nextTime,
        harvestingStatus: 'cooldown'
      };
    }

    return {
      connectionsSent,
      weeklyLimitReached: false,
      dailyLimitReached: false,
      harvestingStatus: 'running'
    };
  } finally {
    isCurrentlyHarvesting = false;
  }
}

// Add this interface near the top with other interfaces
interface ConnectionResult {
  success: boolean;
  profileUrl?: string;
  nextProfileTime?: number;
  weeklyLimitReached?: boolean;
  emailRequired?: boolean;
  cooldown?: boolean;
  cooldownUntil?: string;
}

// Update the function signature
async function clickNextConnectButton(
  page: Page,
  stopRequested: boolean
): Promise<ConnectionResult> {
  try {
    // Load existing connections first
    const { connections } = await loadConnections();

    const connectButtonSelector =
      'button[aria-label^="Invite"][aria-label$="to connect"]';
    const connectButtons = await page.$$(connectButtonSelector);

    // Add logging for found buttons
    console.log(`found ${connectButtons.length} connect buttons`);

    // Log page structure
    await page.evaluate(() => {
        const searchResults = document.querySelector('.reusable-search__entity-result-list');
        console.log('search results html:', searchResults?.outerHTML);
        
        // Log all connect buttons found
        const buttons = document.querySelectorAll('button[aria-label*="Invite"][aria-label*="connect"]');
        console.log('all connect buttons found:', Array.from(buttons).map(b => ({
            ariaLabel: b.getAttribute('aria-label'),
            text: b.textContent?.trim(),
            html: b.outerHTML,
            // Log parent structure
            parentStructure: {
                immediate: b.parentElement?.className,
                entityResult: b.closest('.entity-result__item')?.className,
                linkedArea: b.closest('.linked-area')?.className,
                // Get all parent classes up to 3 levels
                parents: Array.from({ length: 3 }).map((_, i) => {
                    let parent = b;
                    for (let j = 0; j <= i; j++) {
                        parent = parent.parentElement as Element;
                    }
                    return parent?.className;
                })
            }
        })));

        // Log all profile links in the page
        const profileLinks = document.querySelectorAll('a[href*="/in/"]');
        console.log('all profile links found:', Array.from(profileLinks).map(a => ({
            href: a.getAttribute('href'),
            text: a.textContent?.trim(),
            parentClass: a.parentElement?.className,
            closestEntityResult: a.closest('.entity-result__item')?.className
        })));
    });

    for (const connectButton of connectButtons) {
      if (stopRequested) {
        return { success: false };
      }

      const profileUrl = await page.evaluate((button: HTMLElement) => {
        let current: HTMLElement = button;
        let container: HTMLElement | null = null;

        for (let i = 0; i < 5 && current.parentElement; i++) {
          current = current.parentElement as HTMLElement;
          if (current.querySelector('a[href*="/in/"]')) {
            container = current;
            break;
          }
        }

        if (!container) {
          console.log('no container with profile link found');
          return null;
        }

        const profileLinks = container.querySelectorAll('a[href*="/in/"]');
        return profileLinks[0]?.getAttribute('href') || null;
      }, connectButton);

      if (!profileUrl) {
        console.log('profile url extraction failed:', {
            buttonExists: !!connectButton,
            buttonHtml: await connectButton.evaluate(el => el.outerHTML),
            // Log the structure for debugging
            structure: await connectButton.evaluate(el => {
                let current = el as HTMLElement;
                const path = [];
                for (let i = 0; i < 5 && current.parentElement; i++) {
                    current = current.parentElement as HTMLElement;
                    path.push({
                        tag: current.tagName,
                        hasProfileLink: !!current.querySelector('a[href*="/in/"]'),
                        linkCount: current.querySelectorAll('a[href*="/in/"]').length,
                        allLinks: Array.from(current.querySelectorAll('a')).map(a => ({
                            href: a.getAttribute('href'),
                            text: a.textContent?.trim()
                        }))
                    });
                }
                return path;
            })
        });
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

            // Add to cooldown set to avoid retrying during this session
            cooldownProfiles.add(cleanUrl);

            // Dismiss the toast
            const dismissButton = await page.$('button[aria-label^="Dismiss"]');
            if (dismissButton) await dismissButton.click();

            // Return cooldown result without saving connection
            return {
              success: false,
              profileUrl: cleanUrl,
              cooldown: true
            };
          }
        }
      } catch (_) {
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
      } catch (_) {
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
        } catch (_) {
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
        } catch (_) {
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
            
            // Check for restrictions after navigation
            const restrictionStatus = await checkIfRestricted(page);
            if (restrictionStatus.isRestricted) {
              console.log('account restriction detected after page navigation:', restrictionStatus);
              if (restrictionStatus.restrictionEndDate) {
                // Add 12 hours buffer to the restriction end date
                const endDate = new Date(restrictionStatus.restrictionEndDate);
                const bufferEndDate = new Date(endDate.getTime() + 12 * 60 * 60 * 1000).toISOString();
                await saveHarvestingState('cooldown');
                await saveNextHarvestTime(bufferEndDate);
                throw new Error(`account restricted until ${bufferEndDate}`);
              } else {
                await saveHarvestingState('stopped');
                throw new Error('account restricted with unknown end date');
              }
            }

            console.log('search results loaded successfully');
            return true;
          } catch (error) {
            console.error('failed after page navigation:', error);
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
    if ((error as Error).message.includes('net::ERR_ABORTED')) {
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
      } catch (_) {
        throw error;
      }
    }
    throw error;
  }
}