import { Page } from 'puppeteer-core';
import { setupBrowser } from '../browser-setup';
import { updateWorkflowStep } from '../../app/api/workflow/status/state';
import { loadConnections, saveConnection, saveProfile } from '../storage/storage';
import { extractProfileText } from '../simple-actions/extract-profile-details-from-page';
import { cleanProfileUrl } from '../simple-actions/extract-profiles-from-search-results';

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
            try {
                console.log(`checking connection status for ${connection.profileUrl}`);
                
                // Visit profile
                await page.goto(connection.profileUrl, {
                    waitUntil: 'networkidle0',
                    timeout: 30000
                });

                // Check if connected
                const connectButton = await page.$('button.artdeco-button--connect');
                const isConnected = !connectButton;

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
                }

                // Random delay between profile checks
                await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));

            } catch (error) {
                console.error(`error checking connection ${connection.profileUrl}:`, error);
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