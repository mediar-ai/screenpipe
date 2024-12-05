import fs from 'fs/promises';
import path from 'path';
import { ProfileVisit, State, Message, ProfileStore, ProfileDetails, MessageStore } from './types';

const STORAGE_DIR = path.join(__dirname);
console.log('storage directory:', STORAGE_DIR);

export async function loadState(): Promise<State> {
    try {
        const statePath = path.join(STORAGE_DIR, 'state.json');
        console.log('attempting to load state from:', statePath);
        
        const data = await fs.readFile(statePath, 'utf-8');
        console.log('raw state data:', data.slice(0, 200) + '...');
        
        const state = JSON.parse(data);
        console.log('parsed state:', {
            visitedProfilesCount: state.visitedProfiles?.length || 0,
            toVisitProfilesCount: state.toVisitProfiles?.length || 0
        });
        
        return {
            visitedProfiles: state.visitedProfiles || [],
            toVisitProfiles: state.toVisitProfiles || []
        };
    } catch (err) {
        console.log('failed to load state:', err);
        return { 
            visitedProfiles: [],
            toVisitProfiles: []
        };
    }
}

export async function saveState(state: State) {
    const statePath = path.join(STORAGE_DIR, 'state.json');
    console.log('saving state to:', statePath, {
        visitedProfilesCount: state.visitedProfiles?.length || 0,
        toVisitProfilesCount: state.toVisitProfiles?.length || 0
    });
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
}

export async function updateOrAddProfileVisit(state: State, newVisit: ProfileVisit) {
    const existingIndex = state.visitedProfiles.findIndex(
        visit => visit.profileUrl === newVisit.profileUrl
    );

    if (existingIndex !== -1) {
        const existing = state.visitedProfiles[existingIndex];
        state.visitedProfiles[existingIndex] = {
            ...existing,
            ...newVisit,
            actions: {
                ...existing.actions,
                ...newVisit.actions
            },
            timestamp: new Date().toISOString()
        };
        console.log('updated existing profile record');
    } else {
        state.visitedProfiles.push(newVisit);
        console.log('added new profile record');
    }

    await saveState(state);
}

export async function loadMessages(): Promise<MessageStore> {
    try {
        const data = await fs.readFile(path.join(STORAGE_DIR, 'messages.json'), 'utf-8');
        return JSON.parse(data);
    } catch {
        return { messages: {} };
    }
}

export async function saveMessages(profileUrl: string, newMessages: Message[]) {
    const messageStore = await loadMessages();
    const existingMessages = messageStore.messages[profileUrl]?.messages || [];
    
    // filter out duplicates based on text and timestamp
    const uniqueNewMessages = newMessages.filter(newMsg => 
        !existingMessages.some(existingMsg => 
            existingMsg.text === newMsg.text && 
            existingMsg.timestamp === newMsg.timestamp
        )
    );

    messageStore.messages[profileUrl] = {
        timestamp: new Date().toISOString(),
        messages: [...existingMessages, ...uniqueNewMessages]
    };
    
    await fs.writeFile(
        path.join(STORAGE_DIR, 'messages.json'),
        JSON.stringify(messageStore, null, 2)
    );
    console.log(`saved ${uniqueNewMessages.length} new messages for profile ${profileUrl}`);
}

export async function scheduleMessage(state: State, profileUrl: string, text: string, condition: string) {
    const existingProfile = state.visitedProfiles.find(visit => visit.profileUrl === profileUrl);
    if (!existingProfile) {
        throw new Error('cannot schedule message for non-existing profile');
    }

    existingProfile.scheduledMessages = [
        ...(existingProfile.scheduledMessages || []),
        {
            text,
            condition,
            timestamp: new Date().toISOString()
        }
    ];

    await saveState(state);
    console.log('scheduled message for profile');
}

export async function loadProfiles(): Promise<ProfileStore> {
    try {
        const data = await fs.readFile(path.join(STORAGE_DIR, 'profiles.json'), 'utf-8');
        return JSON.parse(data);
    } catch {
        return { profiles: {} };
    }
}

export async function saveProfile(profileUrl: string, details: ProfileDetails) {
    const profiles = await loadProfiles();
    profiles.profiles[profileUrl] = details;
    await fs.writeFile(path.join(STORAGE_DIR, 'profiles.json'), JSON.stringify(profiles, null, 2));
    console.log('saved profile details');
}

export async function updateMultipleProfileVisits(state: State, newVisits: ProfileVisit[]) {
    state.visitedProfiles = state.visitedProfiles || [];
    state.toVisitProfiles = state.toVisitProfiles || [];

    for (const newVisit of newVisits) {
        const alreadyVisited = state.visitedProfiles.some(
            visit => visit.profileUrl === newVisit.profileUrl
        );
        
        const alreadyQueued = state.toVisitProfiles.some(
            visit => visit.profileUrl === newVisit.profileUrl
        );

        if (!alreadyVisited && !alreadyQueued) {
            state.toVisitProfiles.push(newVisit);
        }
    }

    await saveState(state);
    console.log(`added ${newVisits.length} profiles to visit queue`);
} 