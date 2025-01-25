import { Page } from 'puppeteer-core';
import { setupBrowser } from '../browser-setup';
import { updateWorkflowStep } from '../../app/api/workflow/status/state';
import { loadConnections, saveConnection, saveProfile } from '../storage/storage';
import { extractProfileText } from '../simple-actions/extract-profile-details-from-page';
import { cleanProfileUrl } from '../simple-actions/extract-profiles-from-search-results';
import { shouldStop } from './withdraw-connections';

const port = process.env.PORT!;
const BASE_URL = `http://127.0.0.1:${port}`;

let isCurrentlyChecking = false;

export async function startCheckingAcceptedConnections(): Promise<void> {
    if (isCurrentlyChecking) {
        console.log('check accepted connections process already in progress');
        return;
    }

    isCurrentlyChecking = true;
    console.log('starting check accepted connections process');

    try {
        // Browser setup
        updateWorkflowStep('browser', 'running', 'connecting to chrome');
        const statusResponse = await fetch(`${BASE_URL}/api/chrome/status`);
        const statusData = await statusResponse.json();

        if (statusData.status !== 'connected' || !statusData.wsUrl) {
            throw new Error('chrome not connected');
        }

        const { page } = await setupBrowser();
        updateWorkflowStep('browser', 'done', 'browser connected');

        // Load all connections and filter for those pending > 14 days
        const connectionsStore = await loadConnections();
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        const pendingConnections = Object.values(connectionsStore.connections)
            .filter(conn => {
                if (conn.status !== 'pending') return false;
                const connectionDate = new Date(conn.timestamp);
                return connectionDate < twoWeeksAgo;
            });

        console.log(`found ${pendingConnections.length} pending connections older than 14 days to check`);

        for (const connection of pendingConnections) {
            if (shouldStop) {
                console.log('check accepted connections stopped by user');
                return;
            }

            try {
                console.log(`navigating to profile: ${connection.profileUrl}`);
                
                await page.goto(connection.profileUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });

                // Check for 404 page
                const is404 = await Promise.race([
                    page.$eval('.not-found__header', () => true).catch(() => false),
                    page.$eval('[data-test-not-found-error-container]', () => true).catch(() => false)
                ]);

                if (is404) {
                    console.log(`profile not found (404) for ${connection.profileUrl}`);
                    await saveConnection({
                        ...connection,
                        status: 'invalid',
                        timestamp: new Date().toISOString()
                    });
                    continue;
                }

                console.log('waiting for profile content to load...');
                
                // Wait for either connect button or pending/message buttons to appear
                const selectors = [
                    'button.artdeco-button--connect',
                    'button[aria-label*="Pending"]',
                    'button[aria-label*="Message"]'
                ];
                
                const button = await Promise.race([
                    ...selectors.map(selector => 
                        page.waitForSelector(selector, { timeout: 45000 })
                            .catch(() => null)
                    )
                ]);

                console.log('button detection result:', !!button);

                // Check connection status
                const pendingButton = await page.$('button[aria-label*="Pending"]');
                const messageButton = await page.$('button[aria-label*="Message"]');
                const connectButton = await page.$('button.artdeco-button--connect');

                console.log('found buttons:', {
                    pending: !!pendingButton,
                    message: !!messageButton,
                    connect: !!connectButton
                });

                // If we have a message button or pending button but no connect button, they're connected
                const isConnected = messageButton && !connectButton;

                if (isConnected) {
                    console.log(`connection accepted for ${connection.profileUrl}`);
                    
                    // Extract and save profile details
                    const profileDetails = await extractProfileText(page);
                    const cleanUrl = cleanProfileUrl(connection.profileUrl);
                    console.log('extracted profile details:', JSON.stringify(profileDetails).slice(0, 100) + '...');
                    
                    await saveProfile(cleanUrl, profileDetails);
                    
                    // Update connection status
                    await saveConnection({
                        ...connection,
                        status: 'accepted',
                        timestamp: new Date().toISOString()
                    });
                } else if (pendingButton) {
                    console.log(`connection still pending for ${connection.profileUrl}`);
                } else {
                    console.log(`unclear connection status for ${connection.profileUrl}`);
                }

                // Check for any potential blocks or captchas
                const possibleCaptcha = await page.$('iframe[title*="recaptcha"]');
                if (possibleCaptcha) {
                    console.error('detected possible captcha, may need manual intervention');
                    throw new Error('captcha detected');
                }

                // Random delay between profile checks
                const delay = 2000 + Math.random() * 3000;
                console.log(`waiting ${Math.round(delay)}ms before next profile...`);
                await new Promise(resolve => setTimeout(resolve, delay));

            } catch (error) {
                console.error(`error checking connection ${connection.profileUrl}:`, error);
                
                // Take screenshot on error for debugging
                try {
                    await page.screenshot({ 
                        path: `error-${Date.now()}.png`,
                        fullPage: true 
                    });
                    console.log('saved error screenshot');
                } catch (e) {
                    console.error('failed to save error screenshot:', e);
                }
                
                continue;
            }
        }

        console.log('completed checking all pending connections');

    } catch (error) {
        console.error('check accepted connections process failed:', error);
        throw error;
    } finally {
        isCurrentlyChecking = false;
    }
} 