import { setupBrowser } from '../browser_setup';
import { getMessages } from '../simple_actions/extract_messages';
import { loadState, saveMessages } from '../storage/storage';
import { closeAllMessageDialogues } from '../simple_actions/close_dialogues';
import { clickFirstMessageButton } from '../simple_actions/click_message';
import { checkIfConnected } from '../simple_actions/check_if_connected';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

export async function checkAllMessages() {
    console.log('starting message check automation...');
    const state = await loadState();
    
    // Check Chrome connection
    const statusResponse = await fetch(`${BASE_URL}/api/chrome/status`);
    const statusData = await statusResponse.json();
    
    if (statusData.status !== 'connected' || !statusData.wsUrl) {
        throw new Error('chrome not connected');
    }
    
    // Setup browser
    const { browser, page } = await setupBrowser(statusData.wsUrl);
    
    try {
        // Get all profiles (both visited and to visit)
        const allProfiles = [
            ...state.visitedProfiles,
            ...state.toVisitProfiles
        ];
        
        console.log(`checking messages for ${allProfiles.length} profiles...`);
        
        for (const profile of allProfiles) {
            try {
                console.log(`checking messages for profile: ${profile.profileUrl}`);
                
                // Navigate to profile
                await page.goto(profile.profileUrl, { waitUntil: 'domcontentloaded' });
                
                // Check if we're connected before proceeding
                const isConnected = await checkIfConnected(page);
                if (!isConnected) {
                    console.log(`skipping ${profile.profileUrl} - not connected`);
                    continue;
                }
                
                // Close any existing message dialogues
                await closeAllMessageDialogues(page);
                
                // Click message button
                await clickFirstMessageButton(page);
                                
                
                // Get messages
                const messages = await getMessages(page);
                
                // Save messages
                await saveMessages(profile.profileUrl, messages);
                
                console.log(`saved ${messages.length} messages for ${profile.profileUrl}`);
                
                // Close dialogues before next profile
                await closeAllMessageDialogues(page);
                
                // Add a small delay between profiles
                const delay = Math.floor(Math.random() * (2000) + 1000);
                await new Promise(resolve => setTimeout(resolve, delay));
                
            } catch (error) {
                console.error(`failed to check messages for ${profile.profileUrl}:`, error);
                continue; // Continue with next profile even if one fails
            }
        }
        
    } finally {
        // Always close the browser
        await browser.close();
        console.log('message check completed');
    }
}

// Add error handling
export async function startMessageCheck() {
    try {
        await checkAllMessages();
        return { success: true };
    } catch (error) {
        console.error('message check automation failed:', error);
        return { success: false, error: error.message };
    }
} 