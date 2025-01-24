import { Page } from 'puppeteer-core';
import { setupBrowser } from '../browser-setup';
import { updateWorkflowStep } from '../../app/api/workflow/status/state';
import { loadConnections } from '../storage/storage';
import { saveConnection } from '../storage/storage';
import { shouldStop } from './withdraw-connections';

const port = process.env.PORT!;
const BASE_URL = `http://127.0.0.1:${port}`;

let isCurrentlyChecking = false;

export async function startCheckingRecentlyAddedConnections(): Promise<void> {
    if (isCurrentlyChecking) {
        console.log('check recently added connections process already in progress');
        return;
    }

    isCurrentlyChecking = true;
    console.log('starting check recently added connections process');

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

        // Load connections store to get pending connections
        const connectionsStore = await loadConnections();
        const pendingConnections = Object.values(connectionsStore.connections)
            .filter(conn => conn.status === 'pending')
            .map(conn => conn.profileUrl);

        console.log(`found ${pendingConnections.length} pending connections to check against recently added`);

        // Visit connections page
        await page.goto('https://www.linkedin.com/mynetwork/invite-connect/connections/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Wait for the sort button to be visible
        await page.waitForFunction(`document.querySelector('button[aria-label*="Sort by"]') !== null`, {
            timeout: 10000
        });

        // Verify sort is set to "Recently Added"
        console.log('checking sort button status');
        const sortButton = await page.$('button[aria-label*="Sort by"]');
        const sortText = await sortButton?.evaluate(el => el.textContent);
        console.log('current sort:', sortText);
        
        if (!sortText?.toLowerCase().includes('recently added')) {
            console.log('changing sort to recently added');
            await sortButton?.click();
            await page.waitForFunction(`new Promise(r => setTimeout(r, 1000))`);
            const recentlyAddedOption = await page.$('button:has-text("Recently added")');
            if (!recentlyAddedOption) {
                console.log('could not find recently added option');
                throw new Error('recently added sort option not found');
            }
            await recentlyAddedOption.click();
            await page.waitForFunction(`new Promise(r => setTimeout(r, 2000))`);
        }

        // Extract recently added connections
        console.log('starting to extract connections');
        const recentlyAddedProfiles = new Set<{url: string, name: string, time: string}>();
        let scrollTries = 0;
        const maxScrollTries = 5;
        let initialCardCount = await page.$$eval('.mn-connection-card', cards => cards.length);
        const maxConnections = 100;

        while (scrollTries < maxScrollTries) {
            if (shouldStop) {
                console.log('check recently added connections stopped by user during scrolling');
                return;
            }

            console.log(`scroll attempt ${scrollTries + 1}/${maxScrollTries}`);
            await page.keyboard.press('PageDown');
            await page.keyboard.press('PageDown');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const currentCardCount = await page.$$eval('.mn-connection-card', cards => {
                console.log('after scroll: found', cards.length, 'cards');
                return cards.length;
            });

            if (currentCardCount >= maxConnections) {
                console.log(`reached max connections limit (${maxConnections})`);
                break;
            }

            // Check for "Show more" button at bottom
            if (scrollTries === maxScrollTries - 1) {
                const showMoreButton = await page.$('button.scaffold-finite-scroll__load-button');
                if (showMoreButton) {
                    console.log('found show more button, clicking...');
                    await showMoreButton.click();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    scrollTries = 0;
                    initialCardCount = currentCardCount;
                    continue;
                }
            }

            if (currentCardCount > initialCardCount) {
                console.log(`found ${currentCardCount - initialCardCount} new cards`);
                initialCardCount = currentCardCount;
            } else {
                console.log('no new cards, trying again...');
                scrollTries++;
            }
        }

        // Compare with pending connections
        const recentlyAddedPending = pendingConnections.filter(pendingUrl => {
            const cleanPendingUrl = pendingUrl.replace(/\/$/, '').toLowerCase();
            return Array.from(recentlyAddedProfiles).some(profile => 
                profile.url.replace(/\/$/, '').toLowerCase() === cleanPendingUrl
            );
        });

        console.log(`found ${recentlyAddedPending.length} pending connections that were recently added`);
        console.log('recently added pending connections:', recentlyAddedPending);

        // Update their status to accepted
        for (const profileUrl of recentlyAddedPending) {
            await saveConnection({
                profileUrl,
                status: 'accepted',
                timestamp: new Date().toISOString()
            });
        }
        console.log(`updated ${recentlyAddedPending.length} connections to accepted status`);

    } catch (error) {
        console.error('check recently added connections process failed:', error);
        throw error;
    } finally {
        isCurrentlyChecking = false;
    }
}
