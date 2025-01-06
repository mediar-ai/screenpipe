import fs from 'fs/promises';
import { extractProfileElements } from '../simple_actions/extract_profiles_from_search_results';
import { navigateToSearch } from '../simple_actions/go_to_search_results';
import templates from '../storage/templates.json';
import { setupBrowser } from '../browser_setup';
import { ProfileDetails, ProfileVisit, State, ProfileElement } from '../storage/types';
import { extractProfileText } from '../simple_actions/extract_profile_details_from_page';
import { clickMutualConnections } from '../simple_actions/click_mutual_connection';
import { clickFirstMessageButton } from '../simple_actions/click_message';
import { clickFirstProfile } from '../simple_actions/click_first_profile_in_the_list';
import { getMessages } from '../simple_actions/extract_messages';
import {
    loadState,
    updateOrAddProfileVisit,
    updateMultipleProfileVisits,
    saveMessages,
    scheduleMessage,
    saveState,
    saveProfile
} from '../storage/storage';
import { callGPT4 } from '../simple_actions/llm_call';
import { writeMessage } from '../simple_actions/write_message';
import { clickSend } from '../simple_actions/click_send';
import { cleanProfileUrl } from '../simple_actions/extract_profiles_from_search_results';
import { closeAllMessageDialogues } from '../simple_actions/close_dialogues';
import { hasRecentMessages } from '../simple_actions/check_recent_messages';
import { setRunningState, updateWorkflowStep, updateQueueStats } from '../../app/api/workflow/status/state';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

export async function startAutomation(maxProfiles: number = Infinity) {
    try {
        setRunningState(true);
        updateWorkflowStep('setup', 'running', 'initializing automation');
        
        const state = await loadState();
        updateWorkflowStep('setup', 'done', 'state loaded');
        
        // Chrome setup
        updateWorkflowStep('browser', 'running', 'connecting to chrome');
        const statusResponse = await fetch(`${BASE_URL}/api/chrome/status`);
        const statusData = await statusResponse.json();
        
        if (statusData.status !== 'connected' || !statusData.wsUrl) {
            throw new Error('chrome not connected');
        }
        
        // Use the shared browser setup
        const { browser, page } = await setupBrowser(statusData.wsUrl);
        updateWorkflowStep('browser', 'done', 'browser connected');
        
        // Navigation
        updateWorkflowStep('navigation', 'running', 'navigating to linkedin search');
        await navigateToSearch(page, templates.paste_here_url_from_linkedin_with_2nd_grade_connections, { allowTruncate: true });
        updateWorkflowStep('navigation', 'done');
        
        // Close any open dialogues before proceeding
        console.log('closing any open message dialogues...');
        await closeAllMessageDialogues(page);
        
        // Profile extraction
        updateWorkflowStep('extraction', 'running', 'extracting profiles from search');
        const profileElements = await extractProfileElements(page, { maxProfiles: 100 });
        updateWorkflowStep('extraction', 'done', `found ${profileElements.length} profiles (truncated to 100 if needed)`);
        
        const profiles: ProfileVisit[] = profileElements.map((element: ProfileElement) => {
            const cleanUrl = cleanProfileUrl(element.href || '');
            const name = element.text?.match(/View (.*?)(?:'s|’s|’) profile/)?.[1]?.trim() || 'unknown';
            
            console.log(`extracted name: "${name}" from text: "${element.text}"`);
            
            return {
                timestamp: new Date().toISOString(),
                profileUrl: cleanUrl,
                actions: {
                    [`to request intro to ${name}`]: 'not done'
                }
            };
        }).filter(profile => profile.profileUrl);
        
        const queueSummary = await updateMultipleProfileVisits(state, profiles);
        updateWorkflowStep('queueing', 'done', 
            `queued ${queueSummary.newlyQueued} new profiles ` +
            `(${queueSummary.alreadyVisited} already visited, ` +
            `${queueSummary.alreadyQueued} already queued)`
        );
        updateQueueStats(queueSummary);
        
        let processedCount = 0;
        
        // Process up to maxProfiles profiles in the queue
        while (state.toVisitProfiles.length > 0 && processedCount < maxProfiles) {
            updateWorkflowStep('processing', 'running', 
                `processed ${processedCount}/${maxProfiles} profiles`);
            const profileToVisit = state.toVisitProfiles.shift()!;
            
            try {
                await page.goto(profileToVisit.profileUrl, { waitUntil: 'domcontentloaded' });
                console.log('Successfully navigated to profile');
                
                // Move to visited profiles
                state.visitedProfiles.push({
                    ...profileToVisit,
                    timestamp: new Date().toISOString()
                });
                
                await saveState(state);
                console.log('Moved profile from queue to visited');
                
                // Extract and save initial profile details
                const profileDetails = await extractProfileText(page);
                const cleanUrl = cleanProfileUrl(profileToVisit.profileUrl);
                console.log('extracted profile details:', JSON.stringify(profileDetails).slice(0, 100) + '...');
                
                await saveProfile(cleanUrl, profileDetails);
        
                // New workflow steps
                // Click mutual connections
                await clickMutualConnections(page);
                            
                // Click first profile in the list
                await clickFirstProfile(page);
                
                // Extract details from the new profile
                const newProfileDetails = await extractProfileText(page);
                const newProfileUrl = cleanProfileUrl(page.url());
                console.log('extracted mutual connection profile details:', JSON.stringify(newProfileDetails).slice(0, 100) + '...');
                
                await saveProfile(newProfileUrl, newProfileDetails);
        
                // Update action status to 'scheduled' for both profiles
                await updateOrAddProfileVisit(state, {
                    timestamp: new Date().toISOString(),
                    profileUrl: profileToVisit.profileUrl,
                    actions: {
                        [`to request intro to ${profileDetails.name}`]: 'scheduled'
                    }
                });
                
                await updateOrAddProfileVisit(state, {
                    timestamp: new Date().toISOString(),
                    profileUrl: newProfileUrl,
                    actions: {
                        [`to request intro to ${profileDetails.name}`]: 'scheduled'
                    }
                });
                
                // Click message button
                await clickFirstMessageButton(page);
        
                // Export messages
                const messages = await getMessages(page);
                if (messages.length === 0) {
                    console.log('no existing messages found, this might be a new conversation');
                }
        
                await saveMessages(newProfileUrl, messages);
        
                if (hasRecentMessages(messages)) {
                    console.log('recent messages detected, scheduling follow up');
                    
                    // Call LLM even when recent messages exist
                    const llmResponse = await callGPT4(
                        `Profile details: ${JSON.stringify(newProfileDetails)}
                        ${templates.llm_appraisal_prompt}`
                    );
                    console.log('llm response:', JSON.stringify(llmResponse.content).slice(0, 100) + '...');
                    
                    // Schedule the LLM message for later instead of sending immediately
                    await scheduleMessage(
                        state,
                        newProfileUrl,
                        llmResponse.content,
                        'when recent messages reviewed'
                    );
        
                    await updateOrAddProfileVisit(state, {
                        timestamp: new Date().toISOString(),
                        profileUrl: newProfileUrl,
                        actions: {
                            'recent messages detected': 'to review'
                        }
                    });
        
                    // Close any open dialogues before proceeding
                    console.log('closing any open message dialogues...');
                    await closeAllMessageDialogues(page);
                    processedCount++;
        
                    continue; // exit the try block
                }
        
                // Call LLM 
                const llmResponse = await callGPT4(
                    `Profile details: ${JSON.stringify(newProfileDetails)}
                    ${templates.llm_appraisal_prompt}`
                );
                console.log('llm response:', JSON.stringify(llmResponse.content).slice(0, 100) + '...');
                
                // Write LLM response to message box
                await writeMessage(page, llmResponse.content);
                console.log('wrote llm response to message box');
                
                // Send the message
                await clickSend(page);
                
                // Close any open dialogues before proceeding
                console.log('closing any open message dialogues...');
                await closeAllMessageDialogues(page);
        
                // Add LLM message to existing messages
                await saveMessages(newProfileUrl, [{
                    text: llmResponse.content,
                    timestamp: new Date().toISOString(),
                    sender: 'LLM'
                }]);
                console.log('saved messages with LLM response:', JSON.stringify(messages).slice(0, 100) + '...');
                
                // Schedule intro request for later
                await scheduleMessage(
                    state,
                    newProfileUrl,
                    templates.request_for_intro_prompt_to_AI.replace('${fullName}', profileDetails.name || 'your connection'),
                    'replied to previous message'
                );    
                            
                // Add delay if we have more profiles to process and haven't hit the limit
                if (state.toVisitProfiles.length > 0 && processedCount < maxProfiles) {
                    const delay = Math.floor(Math.random() * (3000) + 1000);
                    console.log(`waiting ${delay}ms before processing next profile...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
                processedCount++;
                
            } catch (e) {
                console.error('Failed during profile navigation workflow:', e);
                processedCount++; // count failed attempts too
                continue;
            }
        }
        
        updateWorkflowStep('processing', 'done', 
            `completed processing ${processedCount} profiles`);
            
    } catch (error) {
        console.error('automation failed:', error);
        updateWorkflowStep('error', 'error', (error as Error).message);
    } finally {
        setRunningState(false);
    }
}

// Add error handling to see if something fails
startAutomation().catch(error => {
    console.error('automation failed:', error);
});